import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QrCode, Smartphone, Loader2, Shield } from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string) || ""
).replace(/\/+$/, "");

export default function IdentifyPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("otp");
  const [phoneNumber, setPhoneNumber] = useState("");
  const countryCode = "+91";
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  const [qrScanning, setQrScanning] = useState(false);
  const [qrCodeValue, setQrCodeValue] = useState("");

  const toE164 = (raw: string) => {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (countryCode === "+91") {
      if (digits.length === 10) return `${countryCode}${digits}`;
      if (raw.trim().startsWith("+")) return raw.trim();
      return `${countryCode}${digits}`;
    }
    if (raw.trim().startsWith("+")) return raw.trim();
    return `${countryCode}${digits}`;
  };

  const handleSendOTP = async () => {
    const e164 = toE164(phoneNumber);
    if (!e164 || e164.length < 12) {
      toast({
        variant: "destructive",
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit mobile number.",
      });
      return;
    }

    setOtpSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/identify/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: e164, countryCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Failed (${res.status})`);

      sessionStorage.setItem("kioskPhone", e164);
      sessionStorage.setItem("kioskFlow", "identify");

      if (data.otpSessionId) {
        sessionStorage.setItem("otpSessionId", data.otpSessionId);
      }

      setOtpSent(true);
      toast({
        title: "OTP Sent",
        description: "Please check your phone for the code.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e?.message || "Failed to send OTP. Please try again.",
      });
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyOTP = async () => {
    const code = (otpCode || "").replace(/\D/g, "");
    if (code.length < 4) {
      toast({
        variant: "destructive",
        title: "Invalid OTP",
        description: "Please enter the complete verification code.",
      });
      return;
    }

    const e164 = toE164(phoneNumber);
    if (!e164 || e164.length < 12) {
      toast({
        variant: "destructive",
        title: "Invalid Phone Number",
        description: "Please enter a valid 10-digit mobile number.",
      });
      return;
    }

    setOtpVerifying(true);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/identify/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: e164,
          code,
          countryCode,
          otpSessionId: sessionStorage.getItem("otpSessionId") || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Verification failed (${res.status})`);

      sessionStorage.setItem("kioskPatientId", data.patientId);
      sessionStorage.setItem("kioskPhone", e164);

      fetch(`${API_BASE}/api/kiosk/session/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: data.patientId }),
        credentials: "include",
      }).catch(() => {});

      toast({
        title: "Verified Successfully",
        description: "You’re checked in.",
      });
      navigate("/appt");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Verification Failed",
        description: e?.message || "Please try again.",
      });
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleQRScan = () => {
    setQrScanning(true);
    setTimeout(() => {
      setQrScanning(false);
      toast({ title: "QR Code Scanned", description: "Appointment found!" });
      navigate("/appt");
    }, 2000);
  };

  const handleManualQRSubmit = () => {
    const code = (qrCodeValue || "").trim();
    if (!code) {
      toast({
        variant: "destructive",
        title: "Invalid Code",
        description:
          "Please enter the QR code number printed with your appointment.",
      });
      return;
    }
    toast({ title: "QR Code Accepted", description: "Appointment found!" });
    navigate("/appt");
  };

  const phoneDigitsLen = (phoneNumber || "").replace(/\D/g, "").length;
  const phoneValid = phoneDigitsLen >= 10;

  return (
    <KioskLayout title="Identify Yourself">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-4">
            {t("identify.title")}
          </h1>
          <p className="text-lg text-muted-foreground">
            Please verify your identity to proceed with your appointment
          </p>
        </div>

        <Card className="p-8 shadow-kiosk">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-16">
              <TabsTrigger value="qr" className="text-lg py-4">
                <QrCode className="h-5 w-5 mr-2" />
                {t("identify.scanQR")}
              </TabsTrigger>
              <TabsTrigger value="otp" className="text-lg py-4">
                <Smartphone className="h-5 w-5 mr-2" />
                {t("identify.enterOTP")}
              </TabsTrigger>
            </TabsList>

            {/* QR tab */}
            <TabsContent value="qr" className="mt-8">
              <div className="text-center space-y-6">
                <div className="bg-secondary/30 rounded-2xl p-12 mb-2 min-h-[300px] flex items-center justify-center">
                  {qrScanning ? (
                    <div className="flex flex-col items-center gap-4">
                      <Loader2 className="h-16 w-16 text-primary animate-spin" />
                      <p className="text-lg text-muted-foreground">
                        Scanning QR Code...
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-4">
                      <QrCode className="h-20 w-20 text-muted-foreground" />
                      <p className="text-lg text-muted-foreground">
                        Camera preview would appear here
                      </p>
                      <p className="text-sm text-muted-foreground max-w-md">
                        Position your appointment QR code in the center of the
                        frame
                      </p>
                    </div>
                  )}
                </div>
                <Button
                  onClick={handleQRScan}
                  size="lg"
                  disabled={qrScanning}
                  className="text-xl px-8 py-6 h-auto"
                >
                  {qrScanning ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Scanning...
                    </>
                  ) : (
                    "Start QR Scan"
                  )}
                </Button>

                <div className="flex items-center gap-2 my-2">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-sm text-muted-foreground">Or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <div className="max-w-md mx-auto text-left space-y-3">
                  <label className="block text-base font-medium">
                    Enter QR Code Number
                  </label>
                  <Input
                    type="text"
                    value={qrCodeValue}
                    onChange={(e) => setQrCodeValue(e.target.value)}
                    placeholder="Type the code printed with your QR"
                    className="h-12 text-lg"
                  />
                  <Button
                    size="lg"
                    className="w-full text-lg py-4 h-auto"
                    disabled={!qrCodeValue.trim()}
                    onClick={handleManualQRSubmit}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* OTP tab */}
            <TabsContent value="otp" className="mt-8">
              <div className="space-y-6">
                {/* Phone input */}
                <div>
                  <label className="block text-lg font-medium mb-3">
                    {t("identify.phoneNumber")}
                  </label>
                  <Input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setOtpSent(false);
                      setOtpCode("");
                      sessionStorage.removeItem("otpSessionId");
                    }}
                    placeholder="Enter 10-digit mobile number"
                    className="text-lg h-14 px-4"
                    maxLength={10}
                  />
                </div>

                {/* Send / Resend OTP */}
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <Button
                    onClick={handleSendOTP}
                    size="lg"
                    disabled={otpSending || !phoneValid}
                    className="w-full sm:w-auto"
                  >
                    {otpSending && (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    )}
                    {otpSent ? "Resend OTP" : t("identify.sendOTP")}
                  </Button>
                  {!otpSent && (
                    <p className="text-sm text-muted-foreground">
                      Enter your mobile number and tap &ldquo;Send OTP&rdquo; to
                      verify it.
                    </p>
                  )}
                </div>

                {/* OTP entry */}
                {otpSent && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-lg font-medium mb-3">
                        {t("identify.enterOTPCode")}
                      </label>
                      <Input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="Enter 4-6 digit OTP"
                        className="text-lg h-14 px-4 text-center"
                        maxLength={6}
                      />
                      <p className="text-sm text-muted-foreground mt-2">
                        OTP sent to{" "}
                        {sessionStorage.getItem("kioskPhone") || toE164(phoneNumber)}
                      </p>
                    </div>

                    {/* >>> CHANGED LAYOUT FOR VERIFY + RESEND BUTTONS <<< */}
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={handleVerifyOTP}
                        size="lg"
                        disabled={
                          otpVerifying ||
                          (otpCode || "").replace(/\D/g, "").length < 4
                        }
                        className="w-full sm:w-auto"
                      >
                        {otpVerifying && (
                          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        )}
                        {t("identify.verify")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={handleSendOTP}
                        disabled={otpSending || !phoneValid}
                        className="w-full sm:w-auto"
                      >
                        Resend OTP
                      </Button>
                    </div>
                    {/* <<< END CHANGED BLOCK >>> */}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </Card>

        <Card className="mt-6 p-4 bg-muted/30 border-0">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <p className="text-sm text-muted-foreground">
              {t("identify.privacyNote")}
            </p>
          </div>
        </Card>
      </div>
    </KioskLayout>
  );
}