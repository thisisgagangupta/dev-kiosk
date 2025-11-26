import express from "express";
import cors from "cors";
import { kioskIdentifyRouter } from "./routes/kioskIdentify.js";

const app = express();

const defaultAllowed = [
  "https://medmitra-frontend-qyc5.onrender.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

const allowed = (process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(",").map(s => s.trim()).filter(Boolean)
  : defaultAllowed);

app.use(cors({ origin: allowed, credentials: true }));
app.use(express.json());

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.use("/api/kiosk/identify", kioskIdentifyRouter);

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Clinic OS API on :${port} (CORS allowed: ${allowed.join(", ")})`));