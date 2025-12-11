import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { UserPlus, Phone, Calendar, Users } from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const API_BASE_RAW = (import.meta.env.VITE_API_BASE_URL as string) || "";
const API_BASE = API_BASE_RAW.replace(/\/+$/, "");

interface WalkinFormData {
  name: string;
  mobile: string;
  yearOfBirth: string;
  gender?: string;
  hasCaregiver: boolean;
  groupSize: number; // NEW
}

type WalkinResponse = {
  patientId: string;
  created: boolean;
  kioskVisitId: string;
  normalizedPhone: string;
  groupAssigned?: string;
};

export default function WalkinPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const [formData, setFormData] = useState<WalkinFormData>({
    name: "",
    mobile: "",
    yearOfBirth: "",
    hasCaregiver: false,
    groupSize: 1,
  });
  const [loading, setLoading] = useState(false);

  // --- OTP state for walk-in mobile verification ---
  const [otpSending, setOtpSending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

  useEffect(() => {
    fetch(`${API_BASE}/api/kiosk/session/clear`, { method: "POST", credentials: "include" }).catch(() => {});
    sessionStorage.removeItem("kioskPatientId");
    sessionStorage.removeItem("kioskVisitId");
    sessionStorage.removeItem("kioskPhone");
    sessionStorage.setItem("kioskFlow", "walkin");
  }, []);

  const handleInputChange = (field: keyof WalkinFormData, value: string | boolean | number) => {
    setFormData((prev) => ({ ...prev, [field]: value as any }));
  };

  // ---------- Age rule helpers ----------
  const numericBirthYear = formData.yearOfBirth ? Number(formData.yearOfBirth) : NaN;
  const computedAge =
    Number.isFinite(numericBirthYear) && numericBirthYear > 1900 && numericBirthYear <= currentYear
      ? currentYear - numericBirthYear
      : undefined;

  // true when patient is under 15 AND not accompanied by caregiver
  const tooYoungWithoutCaregiver =
    computedAge !== undefined && computedAge < 15 && !formData.hasCaregiver;

  // ---------- send OTP for the mobile ----------
  const handleSendOtp = async () => {
    const mobileDigits = (formData.mobile || "").replace(/\D/g, "");
    if (!mobileDigits || mobileDigits.length < 10) {
      toast({
        variant: "destructive",
        title: "Invalid Mobile Number",
        description: "Please enter a valid 10-digit mobile number before requesting OTP.",
      });
      return;
    }

    setOtpSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/walkins/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: mobileDigits,
          countryCode: "+91",
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = payload?.detail || `Failed to send OTP (${res.status})`;
        throw new Error(detail);
      }

      setOtpSent(true);
      setOtpSessionId(payload.otpSessionId || null);
      toast({
        title: "OTP Sent",
        description: `We’ve sent an OTP to ${payload.normalizedPhone || mobileDigits}.`,
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "OTP Send Failed",
        description: e?.message || "Could not send OTP. Please try again or contact front desk.",
      });
    } finally {
      setOtpSending(false);
    }
  };

  const handleSubmit = async () => {
    const name = formData.name.trim();
    const mobileDigits = (formData.mobile || "").replace(/\D/g, "");
    if (!name) {
      toast({ variant: "destructive", title: "Name Required", description: "Please enter your full name." });
      return;
    }
    if (!mobileDigits || mobileDigits.length < 10) {
      toast({ variant: "destructive", title: "Invalid Mobile Number", description: "Please enter a valid 10-digit mobile number." });
      return;
    }
    if (!formData.yearOfBirth) {
      toast({ variant: "destructive", title: "Year of Birth Required", description: "Please select your year of birth." });
      return;
    }

    // Enforce age rule: <15 requires caregiver/guardian
    if (tooYoungWithoutCaregiver) {
      toast({
        variant: "destructive",
        title: "Caregiver Required",
        description: "Patients under 15 years must be accompanied by a caregiver or guardian to register.",
      });
      return;
    }

    // Require OTP to be sent and entered
    const codeDigits = (otpCode || "").replace(/\D/g, "");
    if (!otpSent || !codeDigits || codeDigits.length < 4) {
      toast({
        variant: "destructive",
        title: "OTP Required",
        description: "Please verify your mobile number using the OTP before proceeding.",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/walkins/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobile: mobileDigits,
          yearOfBirth: formData.yearOfBirth,
          gender: formData.gender || "",
          hasCaregiver: !!formData.hasCaregiver,
          countryCode: "+91",
          // pass OTP to backend so it can verify
          otpCode: codeDigits,
          otpSessionId: otpSessionId || undefined,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = payload?.detail || `Registration failed (${res.status})`;
        throw new Error(detail);
      }

      const data = payload as WalkinResponse;
      sessionStorage.setItem("kioskPatientId", data.patientId);
      sessionStorage.setItem("kioskVisitId", data.kioskVisitId);
      sessionStorage.setItem("kioskPhone", data.normalizedPhone);
      sessionStorage.setItem("kioskFlow", "walkin");
      // persist group size for the slot page
      sessionStorage.setItem("kioskGroupSize", String(formData.groupSize || 1));

      fetch(`${API_BASE}/api/kiosk/session/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: data.patientId }),
        credentials: "include",
      }).catch(() => {});

      toast({
        title: "Registration Successful",
        description: data.created ? "Your account has been created." : "Welcome back! We found your account.",
      });

      // After correct OTP + successful registration, we move to next step
      navigate("/walkin-slot");
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: e?.message || "Please try again or see front desk.",
      });
    } finally {
      setLoading(false);
    }
  };

  const mobileDigitsLen = (formData.mobile || "").replace(/\D/g, "").length;
  const isFormValid = !!formData.name.trim() && mobileDigitsLen >= 10 && !!formData.yearOfBirth;

  return (
    <KioskLayout title="Walk-in Registration">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <UserPlus className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary mb-4">Walk-in Registration</h1>
          <p className="text-lg text-muted-foreground">
            Please provide your basic information to register for your visit
          </p>
          {/* <p className="text-sm text-muted-foreground mt-2">
            Patients 15 years and older can visit alone. Patients younger than 15 must be accompanied
            by a caregiver or guardian.
          </p> */}
        </div>

        <Card className="p-8 shadow-kiosk">
          <div className="space-y-6">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name" className="text-lg font-medium">
                Full Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Enter your full name"
                className="text-lg h-14 px-4"
                disabled={loading}
              />
            </div>

            {/* Mobile Number + OTP */}
            <div className="space-y-2">
              <Label htmlFor="mobile" className="text-lg font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                Mobile Number <span className="text-destructive">*</span>
              </Label>

              <Input
                id="mobile"
                inputMode="numeric"
                pattern="[0-9]*"
                type="tel"
                value={formData.mobile}
                onChange={(e) => {
                  handleInputChange("mobile", e.target.value);
                  // reset OTP if user changes number
                  setOtpSent(false);
                  setOtpSessionId(null);
                  setOtpCode("");
                }}
                placeholder="Enter 10-digit mobile number"
                className="text-lg h-14 px-4"
                maxLength={10}
                disabled={loading || otpSending}
              />

              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center mt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendOtp}
                  disabled={otpSending || loading || mobileDigitsLen < 10}
                  className="sm:w-auto"
                >
                  {otpSending ? "Sending OTP..." : otpSent ? "Resend OTP" : "Send OTP"}
                </Button>

                {!otpSent && (
                  <p className="text-xs text-muted-foreground">
                    Enter your mobile number and tap &ldquo;Send OTP&rdquo; to verify it.
                  </p>
                )}
              </div>

              {/* OTP input appears only after OTP has been sent */}
              {otpSent && (
                <div className="mt-4">
                  <Label htmlFor="otp" className="text-sm font-medium">
                    Enter OTP
                  </Label>
                  <Input
                    id="otp"
                    type="text"
                    inputMode="numeric"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    maxLength={6}
                    placeholder="4–6 digit code"
                    className="h-12 mt-1"
                    disabled={loading}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    We’ve sent a code by SMS. Please enter it here to continue.
                  </p>
                </div>
              )}
            </div>

            {/* Year of Birth */}
            <div className="space-y-2">
              <Label className="text-lg font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Year of Birth <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.yearOfBirth}
                onValueChange={(value) => handleInputChange("yearOfBirth", value)}
                disabled={loading}
              >
                <SelectTrigger className="text-lg h-14">
                  <SelectValue placeholder="Select year of birth" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used to check if a caregiver/guardian is required for this visit.
              </p>
            </div>

            {/* Gender (Optional) */}
            <div className="space-y-2">
              <Label className="text-lg font-medium">Gender (Optional)</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) => handleInputChange("gender", value)}
                disabled={loading}
              >
                <SelectTrigger className="text-lg h-14">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="prefer-not-to-say">Prefer not to say</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Caregiver Toggle */}
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center space-x-3">
                <Checkbox
                  id="caregiver"
                  checked={formData.hasCaregiver}
                  onCheckedChange={(checked) => handleInputChange("hasCaregiver", !!checked)}
                  disabled={loading}
                />
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="caregiver" className="text-base cursor-pointer">
                      I am accompanied by a caregiver/guardian
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Required for patients younger than 15 years.
                  </p>
                  {tooYoungWithoutCaregiver && (
                    <p className="text-xs text-destructive">
                      This patient appears to be under 15 years. Please confirm they are accompanied by a
                      caregiver/guardian to continue.
                    </p>
                  )}
                </div>
              </div>
            </Card>

            {/* Group size */}
            <div className="space-y-2">
              <Label className="text-lg font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Group Size (including you)
              </Label>
              <Select
                value={String(formData.groupSize)}
                onValueChange={(v) => handleInputChange("groupSize", Number(v))}
                disabled={loading}
              >
                <SelectTrigger className="text-lg h-14">
                  <SelectValue placeholder="Select group size" />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                We’ll book <strong>{formData.groupSize}</strong> time slot
                {formData.groupSize > 1 ? "s" : ""} for your group.
              </p>
            </div>
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="mt-8 space-y-4">
          <Button
            onClick={handleSubmit}
            size="lg"
            disabled={!isFormValid || loading || tooYoungWithoutCaregiver}
            className="w-full text-xl py-6 h-auto"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Registering...
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5 mr-2" />
                {t("common.proceed")}
              </>
            )}
          </Button>

          <Button
            onClick={() => navigate("/start")}
            variant="outline"
            size="lg"
            className="w-full text-lg py-4 h-auto"
            disabled={loading}
          >
            {t("common.back")} to Options
          </Button>
        </div>

        <Card className="mt-6 p-4 bg-muted/30 border-0">
          <p className="text-sm text-muted-foreground">
            <strong>Privacy Note:</strong> Your information is securely stored and used only for medical purposes.
          </p>
        </Card>
      </div>
    </KioskLayout>
  );
}