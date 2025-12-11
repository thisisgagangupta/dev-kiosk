import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  TestTube,
  Calendar,
  CreditCard,
  Printer,
  QrCode,
  Clock,
  Phone,
  User,
  Loader2,
  AlertCircle,
} from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string) || "").replace(/\/+$/, "");

// Reuse the same helper as IdentifyPage for E.164 formatting (simplified here)
const toE164 = (raw: string, countryCode = "+91") => {
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

interface LabTest {
  id: string;
  name: string;
  price: number;
  ordered: boolean;
  selected?: boolean;
}

interface LabBookingSummary {
  bookingId: string;
  appointmentId: string;
  patientId: string;
  patientName?: string;
  phone?: string;
  orderedTests: LabTest[];
  additionalTests: LabTest[];
  paid: boolean;
  hasDoctorVisit: boolean;
  existingToken?: string;
}

type BookingSource = "portal" | "walkin";
type FlowStep = "identify" | "lab";

export default function LabPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  // If LabPage is opened from a doctor check-in flow, the token can be passed via route state
  const existingTokenFromRoute =
    (location.state as any)?.token && typeof (location.state as any).token === "string"
      ? ((location.state as any).token as string)
      : undefined;

  const [flow, setFlow] = useState<FlowStep>("identify");
  const [bookingSource, setBookingSource] = useState<BookingSource | null>(null);

  // Identity / lookup state
  const [phoneInput, setPhoneInput] = useState("");
  const [walkinName, setWalkinName] = useState("");
  const [walkinYearOfBirth, setWalkinYearOfBirth] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Active booking (portal or walk-in)
  const [activeBooking, setActiveBooking] = useState<LabBookingSummary | null>(null);

  // Token generation state
  const [tokenLoading, setTokenLoading] = useState(false);

  // OTP state for PORTAL (existing app/portal booking)
  const [portalOtpSent, setPortalOtpSent] = useState(false);
  const [portalOtpCode, setPortalOtpCode] = useState("");
  const [portalOtpSessionId, setPortalOtpSessionId] = useState<string | null>(null);
  const [portalOtpLoading, setPortalOtpLoading] = useState(false);

  // OTP state for WALK-IN (lab-only)
  const [walkinOtpSent, setWalkinOtpSent] = useState(false);
  const [walkinOtpCode, setWalkinOtpCode] = useState("");
  const [walkinOtpSessionId, setWalkinOtpSessionId] = useState<string | null>(null);
  const [walkinOtpLoading, setWalkinOtpLoading] = useState(false);

  // Local test list (mirrors backend data when present; otherwise default mock list)
  const [tests, setTests] = useState<LabTest[]>([
    { id: "LAB001", name: "Complete Blood Count (CBC)", price: 300, ordered: true },
    { id: "LAB002", name: "Lipid Profile", price: 450, ordered: true },
    { id: "LAB003", name: "Thyroid Function Test (T3, T4, TSH)", price: 600, ordered: false },
    { id: "LAB004", name: "Blood Sugar (Fasting)", price: 150, ordered: false },
    { id: "LAB005", name: "Liver Function Test", price: 400, ordered: false },
    { id: "LAB006", name: "Kidney Function Test", price: 350, ordered: false },
  ]);

  const orderedTests = tests.filter((test) => test.ordered);
  const additionalTests = tests.filter((test) => !test.ordered);
  const selectedAdditionalTests = additionalTests.filter((test) => test.selected);

  const orderedTotal = orderedTests.reduce((sum, test) => sum + test.price, 0);
  const additionalTotal = selectedAdditionalTests.reduce((sum, test) => sum + test.price, 0);
  const grandTotal = orderedTotal + additionalTotal;

  const toggleTestSelection = (testId: string) => {
    setTests((prev) =>
      prev.map((test) =>
        test.id === testId ? { ...test, selected: !test.selected } : test
      )
    );
  };

  // ------------------ STEP 1: IDENTIFY PATIENT (PORTAL) ------------------ //

  const handlePortalSendOtp = async () => {
    const e164 = toE164(phoneInput);
    if (!e164 || e164.length < 12) {
      setLookupError("Please enter a valid mobile number (10 digits).");
      return;
    }
    setPortalOtpLoading(true);
    setLookupError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/identify/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: e164, countryCode: "+91", createIfMissing: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Failed to send OTP (${res.status})`);
      setPortalOtpSent(true);
      setPortalOtpSessionId(data.otpSessionId || null);
      toast({ title: "OTP Sent", description: `Code sent to ${data.normalizedPhone || e164}` });
    } catch (err: any) {
      setLookupError(err?.message || "Failed to send OTP. Please try again.");
    } finally {
      setPortalOtpLoading(false);
    }
  };

  const handlePortalVerifyOtpAndFetch = async () => {
    const code = (portalOtpCode || "").replace(/\D/g, "");
    if (!code || code.length < 4) {
      setLookupError("Please enter the OTP sent to your phone.");
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    try {
      const e164 = toE164(phoneInput);
      const res = await fetch(`${API_BASE}/api/kiosk/identify/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: e164,
          code,
          countryCode: "+91",
          otpSessionId: portalOtpSessionId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Verification failed (${res.status})`);

      const patientId = data.patientId as string;
      const normalizedPhone = (data.normalizedPhone as string) || e164;

      sessionStorage.setItem("kioskPatientId", patientId);
      sessionStorage.setItem("kioskPhone", normalizedPhone);
      sessionStorage.setItem("kioskFlow", "lab");

      // also set kiosk session cookie (for other APIs if needed)
      fetch(`${API_BASE}/api/kiosk/session/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId }),
      }).catch(() => {});

      // Fetch lab bookings for this patient
      const resp = await fetch(
        `${API_BASE}/api/lab/bookings/by-patient?patientId=${encodeURIComponent(patientId)}`
      );
      const list: LabBookingSummary[] = await resp.json().catch(() => []);
      if (!resp.ok) throw new Error((list as any)?.detail || `Failed (${resp.status})`);

      if (!list.length) {
        setLookupError(
          "No online lab bookings found for this number. You can proceed as a walk-in patient."
        );
        return;
      }

      // For now, pick the first upcoming booking. (Can extend to selection UI later.)
      const booking = {
        ...list[0],
        existingToken: list[0].existingToken || existingTokenFromRoute,
      };

      // Merge tests into local state
      const mergedTests: LabTest[] = [
        ...(booking.orderedTests || []).map((t) => ({ ...t, ordered: true })),
        ...(booking.additionalTests || []).map((t) => ({ ...t, ordered: false })),
      ];
      setTests((prev) => (mergedTests.length > 0 ? mergedTests : prev));

      setActiveBooking(booking);
      setBookingSource("portal");
      setFlow("lab");

      toast({
        title: "Lab Booking Found",
        description: booking.paid
          ? "Payment already completed. You can generate your lab token."
          : "Payment pending. Please pay before sample collection.",
      });
    } catch (err: any) {
      setLookupError(err?.message || "Something went wrong. Please see the front desk.");
    } finally {
      setLookupLoading(false);
    }
  };

  // ------------------ STEP 1: IDENTIFY PATIENT (WALK-IN) ------------------ //

  const handleWalkinSendOtp = async () => {
    const digits = (phoneInput || "").replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      setLookupError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setWalkinOtpLoading(true);
    setLookupError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/walkins/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: digits,
          countryCode: "+91",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Failed to send OTP (${res.status})`);
      setWalkinOtpSent(true);
      setWalkinOtpSessionId(data.otpSessionId || null);
      toast({
        title: "OTP Sent",
        description: `We’ve sent an OTP to ${data.normalizedPhone || digits}.`,
      });
    } catch (err: any) {
      setLookupError(err?.message || "Could not send OTP. Please try again.");
    } finally {
      setWalkinOtpLoading(false);
    }
  };

  const handleStartWalkinFlow = async () => {
    const name = walkinName.trim();
    const digits = (phoneInput || "").replace(/\D/g, "");
    if (!name || !digits || !walkinYearOfBirth) {
      setLookupError("Please fill name, mobile, year of birth, and verify OTP.");
      return;
    }
    const code = (walkinOtpCode || "").replace(/\D/g, "");
    if (!walkinOtpSent || !code || code.length < 4) {
      setLookupError("Please verify your mobile number using the OTP.");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    try {
      // Use existing walk-in registration endpoint so patient is created in Cognito/patients table.
      const res = await fetch(`${API_BASE}/api/kiosk/walkins/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobile: digits,
          yearOfBirth: walkinYearOfBirth,
          gender: "",
          hasCaregiver: false,
          countryCode: "+91",
          otpCode: code,
          otpSessionId: walkinOtpSessionId || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.detail || `Registration failed (${res.status})`);
      }

      const patientId = payload.patientId as string;
      const normalizedPhone = (payload.normalizedPhone as string) || digits;
      sessionStorage.setItem("kioskPatientId", patientId);
      sessionStorage.setItem("kioskVisitId", payload.kioskVisitId || "");
      sessionStorage.setItem("kioskPhone", normalizedPhone);
      sessionStorage.setItem("kioskFlow", "lab");

      // also set kiosk session cookie
      fetch(`${API_BASE}/api/kiosk/session/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId }),
      }).catch(() => {});

      // Initialize booking shell for walk-in lab
      const placeholder: LabBookingSummary = {
        bookingId: `WALKIN-${Date.now()}`,
        appointmentId: "", // will be filled when we create lab appointment
        patientId,
        patientName: name,
        phone: normalizedPhone,
        orderedTests: [],
        additionalTests: [],
        paid: false,
        hasDoctorVisit: false,
        existingToken: existingTokenFromRoute,
      };

      // For walk-ins, all tests start as "not doctor-ordered"
      setTests((prev) =>
        prev.map((t) => ({
          ...t,
          ordered: false,
          selected: false,
        }))
      );

      setActiveBooking(placeholder);
      setBookingSource("walkin");
      setFlow("lab");

      toast({
        title: "Walk-in Registered",
        description: "You can now select tests for your lab visit.",
      });
    } catch (err: any) {
      setLookupError(err?.message || "Walk-in registration failed. Please see the front desk.");
    } finally {
      setLookupLoading(false);
    }
  };

  // ------------------ STEP 2: PAYMENT ------------------ //

  const handleProceedToPayment = async () => {
    if (grandTotal === 0) {
      toast({
        variant: "destructive",
        title: "No Tests Selected",
        description: "Please select at least one test to proceed.",
      });
      return;
    }
    const booking = activeBooking;
    if (!bookingSource || !booking) {
      toast({
        variant: "destructive",
        title: "Missing Booking",
        description: "Please complete the identification step first.",
      });
      return;
    }

    const patientId = sessionStorage.getItem("kioskPatientId") || "";
    if (!patientId) {
      toast({
        variant: "destructive",
        title: "Session Expired",
        description: "Please go back and verify your details again.",
      });
      return;
    }

    let appointmentId = booking.appointmentId;

    // For walk-in lab, we need to create a lab appointment first
    if (bookingSource === "walkin") {
      try {
        const res = await fetch(`${API_BASE}/api/lab/bookings/walkin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            phone: booking.phone || sessionStorage.getItem("kioskPhone") || "",
            tests: [...orderedTests, ...selectedAdditionalTests].map((t) => ({
              id: t.id,
              name: t.name,
              price: t.price,
            })),
            siteId: "main",
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `Booking failed (${res.status})`);
        appointmentId = data.appointmentId as string;
        // update local booking
        setActiveBooking((prev) =>
          prev ? { ...prev, appointmentId, bookingId: appointmentId } : prev
        );
      } catch (err: any) {
        toast({
          variant: "destructive",
          title: "Failed to create lab booking",
          description: err?.message || "Please try again.",
        });
        return;
      }
    }

    if (!appointmentId) {
      toast({
        variant: "destructive",
        title: "Missing Appointment",
        description: "Could not determine appointment for payment.",
      });
      return;
    }

    // Build lab booking payload for PaymentPage
    const labBooking = {
      orderedTests,
      additionalTests: selectedAdditionalTests,
      total: grandTotal,
      timestamp: new Date().toISOString(),
      source: bookingSource || "walkin",
      bookingId: booking.bookingId || appointmentId,
      phone: booking.phone || phoneInput.trim(),
      patientName: booking.patientName || walkinName.trim(),
      existingToken: booking.existingToken || existingTokenFromRoute || null,
      hasDoctorVisit: booking.hasDoctorVisit || false,
      appointmentId,
      patientId,
    };

    localStorage.setItem("medmitra-lab-booking", JSON.stringify(labBooking));
    sessionStorage.setItem("kioskSelectedAppointmentId", appointmentId);
    sessionStorage.setItem("kioskFlow", "lab");

    navigate("/payment");
  };

  // ------------------ STEP 3: TOKEN GENERATION ------------------ //

  const handleGenerateToken = async () => {
    const booking = activeBooking;
    const totalTests = orderedTests.length + selectedAdditionalTests.length;

    if (!totalTests) {
      toast({
        variant: "destructive",
        title: "No Tests Selected",
        description: "Please select at least one test for the lab visit.",
      });
      return;
    }

    if (!bookingSource || !booking) {
      toast({
        variant: "destructive",
        title: "Patient Type Not Selected",
        description: "Please choose whether you booked online or are a walk-in patient.",
      });
      return;
    }

    const patientId = sessionStorage.getItem("kioskPatientId") || "";
    if (!patientId) {
      toast({
        variant: "destructive",
        title: "Session Expired",
        description: "Please verify your details again.",
      });
      return;
    }

    // Portal booking with pending payment → must pay first
    if (bookingSource === "portal" && booking.paid === false) {
      toast({
        variant: "destructive",
        title: "Payment Pending",
        description: "Please complete payment before generating a lab token.",
      });
      return;
    }

    // If token already exists (doctor appointment already issued one), just show it
    if (booking.existingToken) {
      toast({
        title: "Token Already Issued",
        description: `Your token is ${booking.existingToken}. Please wait for your turn.`,
      });
      return;
    }

    const appointmentId = booking.appointmentId;
    if (!appointmentId) {
      toast({
        variant: "destructive",
        title: "Missing Appointment",
        description: "Could not determine appointment for token generation.",
      });
      return;
    }

    setTokenLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/checkin/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId, appointmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || `Token error (${res.status})`);

      const tokenNo = data.tokenNo as string;
      // Save so QueuePage can display it
      localStorage.setItem(
        "medmitra-token",
        JSON.stringify({
          id: tokenNo,
          number: tokenNo,
          queuePosition: data.position,
          estimatedTime: `${data.etaLow}-${data.etaHigh} min`,
          confidence: data.confidence,
        })
      );

      setActiveBooking((prev) =>
        prev
          ? {
              ...prev,
              existingToken: tokenNo,
            }
          : prev
      );

      toast({
        title: "Lab Token Generated",
        description: `Your lab token: ${tokenNo}`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Token Generation Failed",
        description: err?.message || "Please contact the front desk for assistance.",
      });
    } finally {
      setTokenLoading(false);
    }
  };

  // If a portal booking is already paid and has no token, auto-generate one once
  useEffect(() => {
    if (
      flow === "lab" &&
      bookingSource === "portal" &&
      activeBooking &&
      activeBooking.paid &&
      !activeBooking.existingToken
    ) {
      // auto-generate once
      handleGenerateToken();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, bookingSource, activeBooking?.bookingId]);

  const handlePrintBarcodes = () => {
    const totalTests = orderedTests.length + selectedAdditionalTests.length;
    if (!totalTests) {
      toast({
        variant: "destructive",
        title: "No Tests Selected",
        description: "Select tests first so we can print barcode labels.",
      });
      return;
    }

    toast({
      title: "Barcode Labels Printing",
      description: "Lab barcode labels will be printed for sample collection.",
    });
  };

  const totalTestsForToken = orderedTests.length + selectedAdditionalTests.length;
  const canGenerateToken =
    totalTestsForToken > 0 &&
    (bookingSource === "walkin" || activeBooking?.paid !== false);

  return (
    <KioskLayout title={t("lab_services_title") || "Lab Services"}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <TestTube className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary mb-4">Laboratory Services</h1>
          <p className="text-lg text-muted-foreground">
            Review your tests, complete payment if needed, and generate your lab token.
          </p>
        </div>

        {/* STEP 1 – IDENTIFY PATIENT / MODE */}
        {flow === "identify" && (
          <Card className="mb-8 p-6">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              How are you visiting today?
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <Card
                className={`p-4 border-2 cursor-pointer ${
                  bookingSource === "portal"
                    ? "border-primary shadow-md"
                    : "border-transparent hover:border-primary/60"
                }`}
                onClick={() => {
                  setBookingSource("portal");
                  setLookupError(null);
                }}
              >
                <div className="flex items-start gap-3">
                  <QrCode className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold">I booked tests online / app</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      We’ll fetch your lab booking (and doctor appointment, if any) using your
                      mobile number and OTP.
                    </p>
                  </div>
                </div>
              </Card>

              <Card
                className={`p-4 border-2 cursor-pointer ${
                  bookingSource === "walkin"
                    ? "border-primary shadow-md"
                    : "border-transparent hover:border-primary/60"
                }`}
                onClick={() => {
                  setBookingSource("walkin");
                  setLookupError(null);
                }}
              >
                <div className="flex items-start gap-3">
                  <User className="h-6 w-6 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold">I am a walk-in patient</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      We’ll verify your mobile by OTP, register you, and book tests on the same token.
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Details for selected mode */}
            {bookingSource && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium flex items-center gap-2 mb-1">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      Mobile Number
                    </label>
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      placeholder="+91 98765 43210"
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value);
                        setLookupError(null);
                      }}
                    />
                  </div>

                  {bookingSource === "walkin" && (
                    <>
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2 mb-1">
                          <User className="h-4 w-4 text-muted-foreground" />
                          Patient Name
                        </label>
                        <input
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="Full name"
                          value={walkinName}
                          onChange={(e) => {
                            setWalkinName(e.target.value);
                            setLookupError(null);
                          }}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium flex items-center gap-2 mb-1">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          Year of Birth
                        </label>
                        <input
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="e.g. 1990"
                          maxLength={4}
                          value={walkinYearOfBirth}
                          onChange={(e) => {
                            setWalkinYearOfBirth(e.target.value.replace(/\D/g, ""));
                            setLookupError(null);
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>

                {lookupError && (
                  <div className="flex items-start gap-2 text-sm text-red-600 mt-2">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{lookupError}</span>
                  </div>
                )}

                {/* OTP controls */}
                <div className="space-y-3 mt-4">
                  {bookingSource === "portal" ? (
                    <>
                      {!portalOtpSent ? (
                        <Button
                          onClick={handlePortalSendOtp}
                          disabled={!phoneInput.trim() || portalOtpLoading}
                          className="w-full sm:w-auto"
                        >
                          {portalOtpLoading && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                          )}
                          Send OTP
                        </Button>
                      ) : (
                        <>
                          <label className="text-sm font-medium mb-1 block">
                            Enter OTP sent to your mobile
                          </label>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm mb-2"
                            placeholder="4–6 digit OTP"
                            maxLength={6}
                            value={portalOtpCode}
                            onChange={(e) => setPortalOtpCode(e.target.value)}
                          />
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Button
                              onClick={handlePortalVerifyOtpAndFetch}
                              disabled={lookupLoading || !portalOtpCode.trim()}
                              className="w-full sm:w-auto"
                            >
                              {lookupLoading && (
                                <Loader2
                                  className="h-4 w-4 mr-2 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              Verify & Fetch Booking
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handlePortalSendOtp}
                              disabled={portalOtpLoading}
                              className="w-full sm:w-auto"
                            >
                              Resend OTP
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {!walkinOtpSent ? (
                        <Button
                          onClick={handleWalkinSendOtp}
                          disabled={!phoneInput.trim() || walkinOtpLoading}
                          className="w-full sm:w-auto"
                        >
                          {walkinOtpLoading && (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                          )}
                          Send OTP
                        </Button>
                      ) : (
                        <>
                          <label className="text-sm font-medium mb-1 block">
                            Enter OTP sent to your mobile
                          </label>
                          <input
                            className="w-full rounded-md border px-3 py-2 text-sm mb-2"
                            placeholder="4–6 digit OTP"
                            maxLength={6}
                            value={walkinOtpCode}
                            onChange={(e) => setWalkinOtpCode(e.target.value)}
                          />
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Button
                              onClick={handleStartWalkinFlow}
                              disabled={
                                lookupLoading ||
                                !walkinOtpCode.trim() ||
                                !walkinName.trim() ||
                                !walkinYearOfBirth.trim()
                              }
                              className="w-full sm:w-auto"
                            >
                              {lookupLoading && (
                                <Loader2
                                  className="h-4 w-4 mr-2 animate-spin"
                                  aria-hidden="true"
                                />
                              )}
                              Verify OTP & Continue
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleWalkinSendOtp}
                              disabled={walkinOtpLoading}
                              className="w-full sm:w-auto"
                            >
                              Resend OTP
                            </Button>
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <span className="text-xs text-muted-foreground mt-2 sm:mt-1">
                    For walk-in appointment patients who also need lab tests, use the same phone
                    number as your visit. Your existing token will be reused when possible.
                  </span>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* STEP 2 – TEST LIST + ACTIONS */}
        {flow === "lab" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Doctor Ordered Tests & Additional Tests */}
            <Card className="lg:col-span-2 p-6">
              <div className="mb-6">
                <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Doctor Ordered Tests
                </h2>
                <p className="text-sm text-muted-foreground">
                  These tests have been prescribed by your doctor (if any)
                </p>
              </div>

              {orderedTests.length > 0 ? (
                <div className="space-y-3 mb-6">
                  {orderedTests.map((test) => (
                    <div
                      key={test.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-primary/5"
                    >
                      <div>
                        <h3 className="font-medium text-foreground">{test.name}</h3>
                        <Badge variant="default" className="mt-1 text-xs">
                          Doctor Prescribed
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-semibold text-foreground">₹{test.price}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <TestTube className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No tests ordered by doctor</p>
                </div>
              )}

              <Separator className="my-6" />

              {/* Additional Tests */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-2">Additional Tests (Optional)</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add extra tests to your package
                </p>
              </div>

              <div className="space-y-3">
                {additionalTests.map((test) => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        id={test.id}
                        checked={test.selected || false}
                        onCheckedChange={() => toggleTestSelection(test.id)}
                      />
                      <label htmlFor={test.id} className="cursor-pointer">
                        <h4 className="font-medium text-foreground">{test.name}</h4>
                      </label>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-foreground">₹{test.price}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Summary & Actions */}
            <div className="space-y-6">
              {/* Bill Summary */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Bill Summary</h3>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Ordered Tests</span>
                    <span>₹{orderedTotal}</span>
                  </div>

                  {selectedAdditionalTests.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Additional Tests</span>
                      <span>₹{additionalTotal}</span>
                    </div>
                  )}

                  <Separator />

                  <div className="flex justify-between text-lg font-semibold">
                    <span>Total</span>
                    <span className="text-primary">₹{grandTotal}</span>
                  </div>

                  {activeBooking?.paid === false && bookingSource === "portal" && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                      Payment is pending for this online booking. Please complete payment before
                      sample collection.
                    </p>
                  )}

                  {activeBooking?.existingToken && (
                    <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1 mt-2">
                      Using existing token:{" "}
                      <span className="font-semibold">{activeBooking.existingToken}</span>
                    </p>
                  )}
                </div>
              </Card>

              {/* Actions */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Actions</h3>

                <div className="space-y-3">
                  {totalTestsForToken > 0 && (
                    <Button
                      onClick={handleGenerateToken}
                      size="lg"
                      disabled={tokenLoading || !canGenerateToken}
                      className="w-full justify-start"
                    >
                      {tokenLoading ? (
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      ) : (
                        <QrCode className="h-5 w-5 mr-2" />
                      )}
                      {activeBooking?.existingToken
                        ? `Use Token ${activeBooking.existingToken}`
                        : "Generate Lab Token"}
                    </Button>
                  )}

                  <Button
                    onClick={handleProceedToPayment}
                    variant="outline"
                    size="lg"
                    disabled={grandTotal === 0 || activeBooking?.paid === true}
                    className="w-full justify-start"
                  >
                    <CreditCard className="h-5 w-5 mr-2" />
                    {activeBooking?.paid === true
                      ? "Payment Completed"
                      : `Pay Now – ₹${grandTotal}`}
                  </Button>

                  <Button
                    onClick={handlePrintBarcodes}
                    variant="outline"
                    size="lg"
                    disabled={totalTestsForToken === 0}
                    className="w-full justify-start"
                  >
                    <Printer className="h-5 w-5 mr-2" />
                    Print Sample Labels
                  </Button>
                </div>
              </Card>

              {/* Lab Instructions */}
              <Card className="p-4 bg-muted/30 border-0">
                <h4 className="font-medium mb-2">Lab Instructions</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Fasting required for some tests</li>
                  <li>• Carry valid ID for verification</li>
                  <li>• Reports available in 10 hours</li>
                  <li>• Collect reports from lab counter or patient portal</li>
                </ul>
              </Card>
            </div>
          </div>
        )}

        {/* Static Sample Collection Info */}
        <Card className="mt-8 p-6 bg-gradient-subtle">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <TestTube className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Sample Collection</h4>
              <p className="text-sm text-muted-foreground">Ground Floor – Lab Wing</p>
            </div>

            <div className="text-center">
              <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Collection Hours</h4>
              <p className="text-sm text-muted-foreground">7:00 AM – 11:00 AM</p>
            </div>

            <div className="text-center">
              <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Report Delivery</h4>
              <p className="text-sm text-muted-foreground">within 10 hours</p>
            </div>
          </div>
        </Card>
      </div>
    </KioskLayout>
  );
}