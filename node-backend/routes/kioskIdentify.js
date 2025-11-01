// node-backend/routes/kioskIdentify.js
import express from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import AWS from "aws-sdk";
import { sendVerificationSMS } from "../twilio/phone.js";

const {
  AWS_REGION = "us-west-2",
  COGNITO_USER_POOL_ID,
  OTP_CODE_LENGTH = "6",
  OTP_TTL_SECONDS = "300",
  OTP_MAX_ATTEMPTS = "5",
} = process.env;

// if (!COGNITO_USER_POOL_ID) throw new Error("Missing COGNITO_USER_POOL_ID");

AWS.config.update({ region: AWS_REGION });
const cognito = new AWS.CognitoIdentityServiceProvider({ apiVersion: "2016-04-18" });

// In-memory OTP store (replace with Redis/Dynamo in prod)
const store = new Map();
const nowEpoch = () => Math.floor(Date.now() / 1000);
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const purgeExpired = () => {
  const ts = nowEpoch();
  for (const [k, v] of store) if (v.expiresAt <= ts) store.delete(k);
};

const normalizePhone = (mobile, countryCode = "+91") => {
  const digits = String(mobile || "").replace(/\D/g, "");
  if (!digits) return null;
  if (String(mobile || "").trim().startsWith("+")) return String(mobile).trim();
  if (countryCode === "+91") {
    if (digits.length !== 10) return null;
    return `${countryCode}${digits}`;
  }
  return `${countryCode}${digits}`;
};

const findCognitoUserByPhone = async (phoneE164) => {
  const resp = await cognito.listUsers({
    UserPoolId: COGNITO_USER_POOL_ID,
    Filter: `phone_number = "${phoneE164}"`,
    Limit: 1,
  }).promise();

  const user = (resp.Users || [])[0];
  if (!user) return null;

  const attrs = new Map(user.Attributes.map(a => [a.Name, a.Value]));
  const patientId = attrs.get("sub") || null;

  if (!patientId) return null;
  return { patientId, user };
};

const generateCode = (len = parseInt(OTP_CODE_LENGTH, 10) || 6) => {
  const min = 10 ** (len - 1);
  const max = 10 ** len - 1;
  return String(Math.floor(Math.random() * (max - min + 1)) + min);
};

export const kioskIdentifyRouter = express.Router();

/**
 * POST /api/kiosk/identify/send-otp
 * body: { mobile: "9998887777" | "+919998887777", countryCode?: "+91" }
 */
kioskIdentifyRouter.post("/send-otp", async (req, res) => {
  try {
    purgeExpired();

    const { mobile, countryCode = "+91" } = req.body || {};
    const phoneE164 = normalizePhone(mobile, countryCode);
    if (!phoneE164) return res.status(400).json({ detail: "Invalid phone number" });

    const userInfo = await findCognitoUserByPhone(phoneE164);
    if (!userInfo) return res.status(404).json({ detail: "Mobile number not registered" });

    const code = generateCode();
    const otpSessionId = uuidv4();
    const expiresAt = nowEpoch() + parseInt(OTP_TTL_SECONDS, 10);

    store.set(otpSessionId, {
      phoneE164,
      patientId: userInfo.patientId,
      codeHash: hash(code),
      attempts: 0,
      expiresAt,
    });

    await sendVerificationSMS(phoneE164, code);

    return res.status(200).json({
      ok: true,
      otpSessionId,
      normalizedPhone: phoneE164,
      expiresIn: parseInt(OTP_TTL_SECONDS, 10),
    });
  } catch (err) {
    console.error("send-otp error:", err);
    return res.status(500).json({ detail: "Failed to send OTP" });
  }
});

/**
 * POST /api/kiosk/identify/verify-otp
 * body: { mobile, countryCode, code, otpSessionId }
 */
kioskIdentifyRouter.post("/verify-otp", async (req, res) => {
  try {
    purgeExpired();

    const { mobile, countryCode = "+91", code, otpSessionId } = req.body || {};
    const phoneE164 = normalizePhone(mobile, countryCode);
    if (!phoneE164) return res.status(400).json({ detail: "Invalid phone number" });
    if (!code || String(code).replace(/\D/g, "").length < 4) {
      return res.status(400).json({ detail: "Invalid code" });
    }
    if (!otpSessionId || !store.has(otpSessionId)) {
      return res.status(400).json({ detail: "OTP session expired or not found" });
    }

    const rec = store.get(otpSessionId);
    if (rec.phoneE164 !== phoneE164) {
      return res.status(400).json({ detail: "Phone mismatch for this session" });
    }

    if (rec.attempts >= parseInt(OTP_MAX_ATTEMPTS, 10)) {
      store.delete(otpSessionId);
      return res.status(429).json({ detail: "Too many attempts. Please request a new code." });
    }

    rec.attempts += 1;

    if (hash(String(code)) !== rec.codeHash) {
      return res.status(401).json({ detail: "Incorrect code" });
    }

    store.delete(otpSessionId);

    const userInfo = await findCognitoUserByPhone(phoneE164);
    if (!userInfo) return res.status(404).json({ detail: "Mobile number not registered" });

    return res.status(200).json({
      ok: true,
      patientId: userInfo.patientId,
      normalizedPhone: phoneE164,
    });
  } catch (err) {
    console.error("verify-otp error:", err);
    return res.status(500).json({ detail: "OTP verification failed" });
  }
});
