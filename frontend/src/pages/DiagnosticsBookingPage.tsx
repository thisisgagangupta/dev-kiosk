import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import KioskLayout from "@/components/KioskLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  Phone,
  User,
  Calendar,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStoredLanguage, useTranslation } from "@/lib/i18n";

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string) || "").replace(/\/+$/, "");

// Normalize phone
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

type DiagnosticType = "MRI" | "CT" | "X-Ray" | "USG";

type DiagnosticsBookingForm = {
  name: string;
  phone: string;
  yearOfBirth: string;
  dateISO: string;
  timeSlot: string;
};

const priceByDiagnostic: Record<DiagnosticType, number> = {
  MRI: 5000,
  CT: 4000,
  "X-Ray": 800,
  USG: 1500,
};

const defaultSlots = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
];

export default function DiagnosticsBookingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const todayISO = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState<DiagnosticsBookingForm>({
    name: "",
    phone: "",
    yearOfBirth: "",
    dateISO: todayISO,
    timeSlot: "",
  });

  const [patientId, setPatientId] = useState<string | null>(
    sessionStorage.getItem("kioskPatientId") || null
  );
  const [patientPhone, setPatientPhone] = useState<string | null>(
    sessionStorage.getItem("kioskPhone") || null
  );

  // OTP state for walk-in style verification
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  const diagnosticTypeRaw = (sessionStorage.getItem("kioskDiagnosticType") ||
    "MRI") as DiagnosticType;
  const diagnosticType: DiagnosticType = ["MRI", "CT", "X-Ray", "USG"].includes(
    diagnosticTypeRaw
  )
    ? diagnosticTypeRaw
    : "MRI";

  const price = priceByDiagnostic[diagnosticType];

  // If user landed here directly without choosing a type, push them back
  useEffect(() => {
    if (!sessionStorage.getItem("kioskDiagnosticType")) {
      sessionStorage.setItem("kioskDiagnosticType", "MRI");
    }
  }, []);

  const handleFieldChange = (field: keyof DiagnosticsBookingForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "phone" || field === "name" || field === "yearOfBirth") {
      setError(null);
    }
  };

  const handleSendOtp = async () => {
    const digits = (form.phone || "").replace(/\D/g, "");
    if (!digits || digits.length < 10 || !form.name.trim() || !form.yearOfBirth.trim()) {
      setError("Please enter name, valid mobile number, and year of birth first.");
      return;
    }

    setOtpLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/walkins/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: digits,
          countryCode: "+91",
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.detail || `Failed to send OTP (${res.status})`);
      }

      setOtpSent(true);
      setOtpSessionId(payload.otpSessionId || null);
      toast({
        title: "OTP Sent",
        description: `We’ve sent an OTP to ${payload.normalizedPhone || digits}.`,
      });
    } catch (e: any) {
      setError(e?.message || "Could not send OTP. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyAndRegister = async () => {
    const name = form.name.trim();
    const digits = (form.phone || "").replace(/\D/g, "");
    if (!name || !digits || !form.yearOfBirth.trim()) {
      setError("Please fill name, mobile number and year of birth.");
      return;
    }
    const code = (otpCode || "").replace(/\D/g, "");
    if (!otpSent || !code || code.length < 4) {
      setError("Please verify your mobile number using the OTP.");
      return;
    }

    setVerifyLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/walkins/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobile: digits,
          yearOfBirth: form.yearOfBirth,
          gender: "",
          hasCaregiver: false,
          countryCode: "+91",
          otpCode: code,
          otpSessionId: otpSessionId || undefined,
        }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.detail || `Registration failed (${res.status})`);
      }

      const pid = payload.patientId as string;
      const normalizedPhone = (payload.normalizedPhone as string) || digits;

      setPatientId(pid);
      setPatientPhone(normalizedPhone);
      sessionStorage.setItem("kioskPatientId", pid);
      sessionStorage.setItem("kioskVisitId", payload.kioskVisitId || "");
      sessionStorage.setItem("kioskPhone", normalizedPhone);
      sessionStorage.setItem("kioskFlow", "lab"); // reuse lab payment flow

      // Set kiosk session cookie
      fetch(`${API_BASE}/api/kiosk/session/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId: pid }),
      }).catch(() => {});

      setVerified(true);
      toast({
        title: "Verified",
        description: payload.created
          ? "Account created successfully."
          : "We found your existing account.",
      });
    } catch (e: any) {
      setError(e?.message || "Walk-in registration failed. Please see the front desk.");
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleBookAndPay = async () => {
    if (!patientId) {
      setError("Please verify your mobile number first.");
      return;
    }
    if (!verified) {
      setError("Please complete OTP verification first.");
      return;
    }
    if (!form.dateISO || !form.timeSlot) {
      setError("Please select date and time slot.");
      return;
    }

    setBookingLoading(true);
    setError(null);
    try {
      // Use existing lab walk-in booking endpoint,
      // but treat the selected diagnostic as a "test".
      const tests = [
        {
          id: diagnosticType,
          name: `${diagnosticType} Scan`,
          price,
        },
      ];

      const res = await fetch(`${API_BASE}/api/lab/bookings/walkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          phone: patientPhone || form.phone,
          tests,
          siteId: "diagnostics",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `Booking failed (${res.status})`);
      }

      const appointmentId = data.appointmentId as string;

      // Store a lab-style booking so existing PaymentPage lab flow works
      const labBooking = {
        orderedTests: tests,
        additionalTests: [] as typeof tests,
        total: price,
        timestamp: new Date().toISOString(),
        source: "diagnostics-kiosk",
        bookingId: appointmentId,
        phone: patientPhone || form.phone,
        patientName: form.name.trim(),
        existingToken: null,
        hasDoctorVisit: false,
        appointmentId,
        patientId,
      };

      localStorage.setItem("medmitra-lab-booking", JSON.stringify(labBooking));
      sessionStorage.setItem("kioskSelectedAppointmentId", appointmentId);
      sessionStorage.setItem("kioskFlow", "lab"); // PaymentPage will use lab path

      toast({
        title: "Diagnostics Booking Created",
        description: `Proceed to payment for ${diagnosticType} scan.`,
      });

      navigate("/payment");
    } catch (e: any) {
      setError(e?.message || "Failed to create diagnostics booking. Please try again.");
    } finally {
      setBookingLoading(false);
    }
  };

  const isFormBasicValid =
    form.name.trim() &&
    form.phone.replace(/\D/g, "").length >= 10 &&
    form.yearOfBirth.trim();

  const slotsForDisplay = defaultSlots;

  return (
    <KioskLayout title="Diagnostics Booking" showBack={true} onBack={() => navigate("/diagnostics")}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <Activity className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-3xl font-bold mb-2">
            {diagnosticType} Booking
          </h1>
          <p className="text-muted-foreground">
            Please enter your details, verify your mobile by OTP, and choose a convenient time.
          </p>
        </div>

        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Patient Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2 mb-1">
                <User className="h-4 w-4 text-muted-foreground" />
                Full Name
              </Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleFieldChange("name", e.target.value)}
                placeholder="Enter your full name"
                className="h-12"
              />
            </div>
            <div>
              <Label htmlFor="phone" className="text-sm font-medium flex items-center gap-2 mb-1">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Mobile Number
              </Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => handleFieldChange("phone", e.target.value)}
                placeholder="+91 98765 43210"
                className="h-12"
              />
            </div>
            <div>
              <Label htmlFor="yob" className="text-sm font-medium flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Year of Birth
              </Label>
              <Input
                id="yob"
                value={form.yearOfBirth}
                onChange={(e) =>
                  handleFieldChange("yearOfBirth", e.target.value.replace(/\D/g, ""))
                }
                placeholder="e.g. 1990"
                maxLength={4}
                className="h-12"
              />
            </div>
          </div>

          {/* OTP Section */}
          <div className="space-y-3 mb-4">
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              {!otpSent ? (
                <Button
                  onClick={handleSendOtp}
                  size="lg"
                  disabled={otpLoading || !isFormBasicValid}
                  className="w-full sm:w-auto"
                >
                  {otpLoading && (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  )}
                  Send OTP
                </Button>
              ) : (
                <>
                  <div className="flex-1 w-full">
                    <Label className="text-sm font-medium mb-1 block">
                      Enter OTP sent to your mobile
                    </Label>
                    <Input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      maxLength={6}
                      placeholder="4–6 digit OTP"
                      className="h-12"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      onClick={handleVerifyAndRegister}
                      size="lg"
                      disabled={
                        verifyLoading ||
                        !otpCode.trim() ||
                        !isFormBasicValid
                      }
                      className="w-full sm:w-auto"
                    >
                      {verifyLoading && (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      )}
                      Verify OTP & Continue
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={handleSendOtp}
                      disabled={otpLoading}
                      className="w-full sm:w-auto"
                    >
                      Resend OTP
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Date & Time Slot */}
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Schedule
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="date" className="text-sm font-medium mb-1">
                Preferred Date
              </Label>
              <Input
                id="date"
                type="date"
                value={form.dateISO}
                onChange={(e) => handleFieldChange("dateISO", e.target.value)}
                className="h-12"
                min={todayISO}
              />
            </div>
            <div>
              <Label className="text-sm font-medium mb-1">
                Time Slot
              </Label>
              <Select
                value={form.timeSlot}
                onValueChange={(value) => handleFieldChange("timeSlot", value)}
              >
                <SelectTrigger className="h-12">
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  {slotsForDisplay.map((slot) => (
                    <SelectItem key={slot} value={slot}>
                      {slot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary & Action */}
          <Separator className="my-4" />
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground">Service</p>
              <p className="font-medium">{diagnosticType} Scan</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Amount</p>
              <p className="text-xl font-semibold text-primary">₹{price}</p>
            </div>
          </div>

          <Button
            onClick={handleBookAndPay}
            size="lg"
            className="w-full text-lg py-6 h-auto"
            disabled={
              bookingLoading ||
              !verified ||
              !form.dateISO ||
              !form.timeSlot
            }
          >
            {bookingLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Booking...
              </>
            ) : (
              "Proceed to Payment"
            )}
          </Button>
        </Card>
      </div>
    </KioskLayout>
  );
}












// import { useEffect, useMemo, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import KioskLayout from "@/components/KioskLayout";
// import { Card } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "@/components/ui/select";
// import { Separator } from "@/components/ui/separator";
// import {
//   Activity,
//   Phone,
//   User,
//   Calendar,
//   Clock,
//   AlertCircle,
// } from "lucide-react";
// import { useToast } from "@/hooks/use-toast";
// import { getStoredLanguage, useTranslation } from "@/lib/i18n";

// const API_BASE = (
//   (import.meta.env.VITE_API_BASE_URL as string) || ""
// ).replace(/\/+$/, "");

// // Normalize phone
// const toE164 = (raw: string, countryCode = "+91") => {
//   const digits = (raw || "").replace(/\D/g, "");
//   if (!digits) return "";
//   if (countryCode === "+91") {
//     if (digits.length === 10) return `${countryCode}${digits}`;
//     if (raw.trim().startsWith("+")) return raw.trim();
//     return `${countryCode}${digits}`;
//   }
//   if (raw.trim().startsWith("+")) return raw.trim();
//   return `${countryCode}${digits}`;
// };

// type DiagnosticType = "MRI" | "CT" | "X-Ray" | "USG";

// type DiagnosticsBookingForm = {
//   name: string;
//   phone: string;
//   yearOfBirth: string;
//   dateISO: string;
//   timeSlot: string;
// };

// const priceByDiagnostic: Record<DiagnosticType, number> = {
//   MRI: 5000,
//   CT: 4000,
//   "X-Ray": 800,
//   USG: 1500,
// };

// const defaultSlots = [
//   "09:00",
//   "10:00",
//   "11:00",
//   "12:00",
//   "14:00",
//   "15:00",
//   "16:00",
//   "17:00",
// ];

// export default function DiagnosticsBookingPage() {
//   const navigate = useNavigate();
//   const { t } = useTranslation(getStoredLanguage());
//   const { toast } = useToast();

//   const todayISO = new Date().toISOString().slice(0, 10);

//   const [form, setForm] = useState<DiagnosticsBookingForm>({
//     name: "",
//     phone: "",
//     yearOfBirth: "",
//     dateISO: todayISO,
//     timeSlot: "",
//   });

//   const [patientId, setPatientId] = useState<string | null>(
//     sessionStorage.getItem("kioskPatientId") || null
//   );
//   const [patientPhone, setPatientPhone] = useState<string | null>(
//     sessionStorage.getItem("kioskPhone") || null
//   );

//   // OTP state for walk-in style verification
//   const [otpSent, setOtpSent] = useState(false);
//   const [otpCode, setOtpCode] = useState("");
//   const [otpSessionId, setOtpSessionId] =
//     useState<string | null>(null);
//   const [otpLoading, setOtpLoading] = useState(false);
//   const [verifyLoading, setVerifyLoading] = useState(false);
//   const [verified, setVerified] = useState(false);
//   const [error, setError] = useState<string | null>(null);
//   const [bookingLoading, setBookingLoading] = useState(false);

//   const diagnosticTypeRaw = (sessionStorage.getItem(
//     "kioskDiagnosticType"
//   ) || "MRI") as DiagnosticType;
//   const diagnosticType: DiagnosticType = ["MRI", "CT", "X-Ray", "USG"].includes(
//     diagnosticTypeRaw
//   )
//     ? diagnosticTypeRaw
//     : "MRI";

//   const price = priceByDiagnostic[diagnosticType];

//   // If user landed here directly without choosing a type, push them back
//   useEffect(() => {
//     if (!sessionStorage.getItem("kioskDiagnosticType")) {
//       sessionStorage.setItem("kioskDiagnosticType", "MRI");
//     }
//   }, []);

//   const handleFieldChange = (
//     field: keyof DiagnosticsBookingForm,
//     value: string
//   ) => {
//     setForm((prev) => ({ ...prev, [field]: value }));
//     if (
//       field === "phone" ||
//       field === "name" ||
//       field === "yearOfBirth"
//     ) {
//       setError(null);
//     }
//   };

//   const handleSendOtp = async () => {
//     const digits = (form.phone || "").replace(/\D/g, "");
//     if (
//       !digits ||
//       digits.length < 10 ||
//       !form.name.trim() ||
//       !form.yearOfBirth.trim()
//     ) {
//       setError(
//         t(
//           "diagnosticsBooking.basicDetailsError",
//           "Please enter name, valid mobile number, and year of birth first."
//         )
//       );
//       return;
//     }

//     setOtpLoading(true);
//     setError(null);
//     try {
//       const res = await fetch(
//         `${API_BASE}/api/kiosk/walkins/send-otp`,
//         {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             mobile: digits,
//             countryCode: "+91",
//           }),
//         }
//       );
//       const payload = await res.json().catch(() => ({}));
//       if (!res.ok) {
//         throw new Error(
//           payload?.detail ||
//             `Failed to send OTP (${res.status})`
//         );
//       }

//       setOtpSent(true);
//       setOtpSessionId(payload.otpSessionId || null);
//       toast({
//         title: t("diagnosticsBooking.sendOtp", "OTP Sent"),
//         description:
//           t(
//             "diagnosticsBooking.otpSentTo",
//             "We’ve sent an OTP to"
//           ) + ` ${payload.normalizedPhone || digits}.`,
//       });
//     } catch (e: any) {
//       setError(
//         e?.message ||
//           t(
//             "diagnosticsBooking.sendOtpFailed",
//             "Could not send OTP. Please try again."
//           )
//       );
//     } finally {
//       setOtpLoading(false);
//     }
//   };

//   const handleVerifyAndRegister = async () => {
//     const name = form.name.trim();
//     const digits = (form.phone || "").replace(/\D/g, "");
//     if (!name || !digits || !form.yearOfBirth.trim()) {
//       setError(
//         t(
//           "diagnosticsBooking.detailsRequired",
//           "Please fill name, mobile number and year of birth."
//         )
//       );
//       return;
//     }
//     const code = (otpCode || "").replace(/\D/g, "");
//     if (!otpSent || !code || code.length < 4) {
//       setError(
//         t(
//           "diagnosticsBooking.otpRequired",
//           "Please verify your mobile number using the OTP."
//         )
//       );
//       return;
//     }

//     setVerifyLoading(true);
//     setError(null);
//     try {
//       const res = await fetch(
//         `${API_BASE}/api/kiosk/walkins/register`,
//         {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             name,
//             mobile: digits,
//             yearOfBirth: form.yearOfBirth,
//             gender: "",
//             hasCaregiver: false,
//             countryCode: "+91",
//             otpCode: code,
//             otpSessionId: otpSessionId || undefined,
//           }),
//         }
//       );

//       const payload = await res.json().catch(() => ({}));
//       if (!res.ok) {
//         throw new Error(
//           payload?.detail ||
//             `Registration failed (${res.status})`
//         );
//       }

//       const pid = payload.patientId as string;
//       const normalizedPhone =
//         (payload.normalizedPhone as string) || digits;

//       setPatientId(pid);
//       setPatientPhone(normalizedPhone);
//       sessionStorage.setItem("kioskPatientId", pid);
//       sessionStorage.setItem(
//         "kioskVisitId",
//         payload.kioskVisitId || ""
//       );
//       sessionStorage.setItem("kioskPhone", normalizedPhone);
//       sessionStorage.setItem("kioskFlow", "lab"); // reuse lab payment flow

//       // Set kiosk session cookie
//       fetch(`${API_BASE}/api/kiosk/session/set`, {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         credentials: "include",
//         body: JSON.stringify({ patientId: pid }),
//       }).catch(() => {});

//       setVerified(true);
//       toast({
//         title: t(
//           "diagnosticsBooking.verifiedTitle",
//           "Verified"
//         ),
//         description: payload.created
//           ? t(
//               "diagnosticsBooking.accountCreated",
//               "Account created successfully."
//             )
//           : t(
//               "diagnosticsBooking.existingAccount",
//               "We found your existing account."
//             ),
//       });
//     } catch (e: any) {
//       setError(
//         e?.message ||
//           t(
//             "diagnosticsBooking.registerFailed",
//             "Walk-in registration failed. Please see the front desk."
//           )
//       );
//     } finally {
//       setVerifyLoading(false);
//     }
//   };

//   const handleBookAndPay = async () => {
//     if (!patientId) {
//       setError(
//         t(
//           "diagnosticsBooking.verifyFirst",
//           "Please verify your mobile number first."
//         )
//       );
//       return;
//     }
//     if (!verified) {
//       setError(
//         t(
//           "diagnosticsBooking.completeOtpFirst",
//           "Please complete OTP verification first."
//         )
//       );
//       return;
//     }
//     if (!form.dateISO || !form.timeSlot) {
//       setError(
//         t(
//           "diagnosticsBooking.dateTimeRequired",
//           "Please select date and time slot."
//         )
//       );
//       return;
//     }

//     setBookingLoading(true);
//     setError(null);
//     try {
//       // Use existing lab walk-in booking endpoint,
//       // but treat the selected diagnostic as a "test".
//       const tests = [
//         {
//           id: diagnosticType,
//           name: `${diagnosticType} Scan`,
//           price,
//         },
//       ];

//       const res = await fetch(
//         `${API_BASE}/api/lab/bookings/walkin`,
//         {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           body: JSON.stringify({
//             patientId,
//             phone: patientPhone || form.phone,
//             tests,
//             siteId: "diagnostics",
//           }),
//         }
//       );
//       const data = await res.json().catch(() => ({}));
//       if (!res.ok) {
//         throw new Error(
//           data.detail ||
//             `Booking failed (${res.status})`
//         );
//       }

//       const appointmentId = data.appointmentId as string;

//       // Store a lab-style booking so existing PaymentPage lab flow works
//       const labBooking = {
//         orderedTests: tests,
//         additionalTests: [] as typeof tests,
//         total: price,
//         timestamp: new Date().toISOString(),
//         source: "diagnostics-kiosk",
//         bookingId: appointmentId,
//         phone: patientPhone || form.phone,
//         patientName: form.name.trim(),
//         existingToken: null,
//         hasDoctorVisit: false,
//         appointmentId,
//         patientId,
//       };

//       localStorage.setItem(
//         "medmitra-lab-booking",
//         JSON.stringify(labBooking)
//       );
//       sessionStorage.setItem(
//         "kioskSelectedAppointmentId",
//         appointmentId
//       );
//       sessionStorage.setItem("kioskFlow", "lab"); // PaymentPage will use lab path

//       toast({
//         title: t(
//           "diagnosticsBooking.bookingCreatedTitle",
//           "Diagnostics Booking Created"
//         ),
//         description: t(
//           "diagnosticsBooking.bookingCreatedDesc",
//           `Proceed to payment for ${diagnosticType} scan.`
//         ),
//       });

//       navigate("/payment");
//     } catch (e: any) {
//       setError(
//         e?.message ||
//           t(
//             "diagnosticsBooking.bookingFailed",
//             "Failed to create diagnostics booking. Please try again."
//           )
//       );
//     } finally {
//       setBookingLoading(false);
//     }
//   };

//   const isFormBasicValid =
//     form.name.trim() &&
//     form.phone.replace(/\D/g, "").length >= 10 &&
//     form.yearOfBirth.trim();

//   const slotsForDisplay = defaultSlots;

//   const diagnosticHeading = `${diagnosticType} ${t(
//     "diagnosticsBooking.titlePrefix",
//     "Booking"
//   )}`;

//   return (
//     <KioskLayout
//       title={t(
//         "diagnosticsBooking.pageTitle",
//         "Diagnostics Booking"
//       )}
//       showBack={true}
//       onBack={() => navigate("/diagnostics")}
//     >
//       <div className="max-w-4xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <div className="bg-primary/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
//             <Activity className="h-10 w-10 text-primary" />
//           </div>
//           <h1 className="text-3xl font-bold mb-2">
//             {diagnosticHeading}
//           </h1>
//           <p className="text-muted-foreground">
//             {t(
//               "diagnosticsBooking.subtitle",
//               "Please enter your details, verify your mobile by OTP, and choose a convenient time."
//             )}
//           </p>
//         </div>

//         <Card className="p-6 mb-6">
//           <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
//             <User className="h-5 w-5 text-primary" />
//             {t(
//               "diagnosticsBooking.patientDetailsTitle",
//               "Patient Details"
//             )}
//           </h2>

//           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
//             <div>
//               <Label
//                 htmlFor="name"
//                 className="text-sm font-medium flex items-center gap-2 mb-1"
//               >
//                 <User className="h-4 w-4 text-muted-foreground" />
//                 {t(
//                   "diagnosticsBooking.fullName",
//                   "Full Name"
//                 )}
//               </Label>
//               <Input
//                 id="name"
//                 value={form.name}
//                 onChange={(e) =>
//                   handleFieldChange("name", e.target.value)
//                 }
//                 placeholder={t(
//                   "diagnosticsBooking.fullNamePlaceholder",
//                   "Enter your full name"
//                 )}
//                 className="h-12"
//               />
//             </div>
//             <div>
//               <Label
//                 htmlFor="phone"
//                 className="text-sm font-medium flex items-center gap-2 mb-1"
//               >
//                 <Phone className="h-4 w-4 text-muted-foreground" />
//                 {t(
//                   "diagnosticsBooking.mobileNumber",
//                   "Mobile Number"
//                 )}
//               </Label>
//               <Input
//                 id="phone"
//                 value={form.phone}
//                 onChange={(e) =>
//                   handleFieldChange("phone", e.target.value)
//                 }
//                 placeholder="+91 98765 43210"
//                 className="h-12"
//               />
//             </div>
//             <div>
//               <Label
//                 htmlFor="yob"
//                 className="text-sm font-medium flex items-center gap-2 mb-1"
//               >
//                 <Calendar className="h-4 w-4 text-muted-foreground" />
//                 {t(
//                   "diagnosticsBooking.yearOfBirth",
//                   "Year of Birth"
//                 )}
//               </Label>
//               <Input
//                 id="yob"
//                 value={form.yearOfBirth}
//                 onChange={(e) =>
//                   handleFieldChange(
//                     "yearOfBirth",
//                     e.target.value.replace(/\D/g, "")
//                   )
//                 }
//                 placeholder={t(
//                   "diagnosticsBooking.yearOfBirthPlaceholder",
//                   "e.g. 1990"
//                 )}
//                 maxLength={4}
//                 className="h-12"
//               />
//             </div>
//           </div>

//           {/* OTP Section */}
//           <div className="space-y-3 mb-4">
//             {error && (
//               <div className="flex items-start gap-2 text-sm text-red-600">
//                 <AlertCircle className="h-4 w-4 mt-0.5" />
//                 <span>{error}</span>
//               </div>
//             )}

//             <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
//               {!otpSent ? (
//                 <Button
//                   onClick={handleSendOtp}
//                   size="lg"
//                   disabled={otpLoading || !isFormBasicValid}
//                   className="w-full sm:w-auto"
//                 >
//                   {otpLoading && (
//                     <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
//                   )}
//                   {t(
//                     "diagnosticsBooking.otpSendButton",
//                     "Send OTP"
//                   )}
//                 </Button>
//               ) : (
//                 <>
//                   <div className="flex-1 w-full">
//                     <Label className="text-sm font-medium mb-1 block">
//                       {t(
//                         "diagnosticsBooking.otpEnterLabel",
//                         "Enter OTP sent to your mobile"
//                       )}
//                     </Label>
//                     <Input
//                       value={otpCode}
//                       onChange={(e) =>
//                         setOtpCode(e.target.value)
//                       }
//                       maxLength={6}
//                       placeholder={t(
//                         "diagnosticsBooking.otpPlaceholder",
//                         "4–6 digit OTP"
//                       )}
//                       className="h-12"
//                     />
//                   </div>
//                   <div className="flex flex-col sm:flex-row gap-3">
//                     <Button
//                       onClick={handleVerifyAndRegister}
//                       size="lg"
//                       disabled={
//                         verifyLoading ||
//                         !otpCode.trim() ||
//                         !isFormBasicValid
//                       }
//                       className="w-full sm:w-auto"
//                     >
//                       {verifyLoading && (
//                         <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
//                       )}
//                       {t(
//                         "diagnosticsBooking.otpVerifyButton",
//                         "Verify OTP & Continue"
//                       )}
//                     </Button>
//                     <Button
//                       type="button"
//                       variant="outline"
//                       size="lg"
//                       onClick={handleSendOtp}
//                       disabled={otpLoading}
//                       className="w-full sm:w-auto"
//                     >
//                       {t(
//                         "diagnosticsBooking.otpResendButton",
//                         "Resend OTP"
//                       )}
//                     </Button>
//                   </div>
//                 </>
//               )}
//             </div>
//           </div>

//           <Separator className="my-4" />

//           {/* Date & Time Slot */}
//           <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
//             <Clock className="h-5 w-5 text-primary" />
//             {t("diagnosticsBooking.scheduleTitle", "Schedule")}
//           </h2>

//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
//             <div>
//               <Label
//                 htmlFor="date"
//                 className="text-sm font-medium mb-1"
//               >
//                 {t(
//                   "diagnosticsBooking.preferredDate",
//                   "Preferred Date"
//                 )}
//               </Label>
//               <Input
//                 id="date"
//                 type="date"
//                 value={form.dateISO}
//                 onChange={(e) =>
//                   handleFieldChange("dateISO", e.target.value)
//                 }
//                 className="h-12"
//                 min={todayISO}
//               />
//             </div>
//             <div>
//               <Label className="text-sm font-medium mb-1">
//                 {t(
//                   "diagnosticsBooking.timeSlot",
//                   "Time Slot"
//                 )}
//               </Label>
//               <Select
//                 value={form.timeSlot}
//                 onValueChange={(value) =>
//                   handleFieldChange("timeSlot", value)
//                 }
//               >
//                 <SelectTrigger className="h-12">
//                   <SelectValue
//                     placeholder={t(
//                       "diagnosticsBooking.timeSlotPlaceholder",
//                       "Select time slot"
//                     )}
//                   />
//                 </SelectTrigger>
//                 <SelectContent>
//                   {slotsForDisplay.map((slot) => (
//                     <SelectItem key={slot} value={slot}>
//                       {slot}
//                     </SelectItem>
//                   ))}
//                 </SelectContent>
//               </Select>
//             </div>
//           </div>

//           {/* Summary & Action */}
//           <Separator className="my-4" />
//           <div className="flex items-center justify-between mb-4">
//             <div>
//               <p className="text-sm text-muted-foreground">
//                 {t(
//                   "diagnosticsBooking.serviceLabel",
//                   "Service"
//                 )}
//               </p>
//               <p className="font-medium">
//                 {diagnosticType}{" "}
//                 {t(
//                   "diagnosticsBooking.scanLabel",
//                   "Scan"
//                 )}
//               </p>
//             </div>
//             <div className="text-right">
//               <p className="text-sm text-muted-foreground">
//                 {t(
//                   "diagnosticsBooking.amountLabel",
//                   "Amount"
//                 )}
//               </p>
//               <p className="text-xl font-semibold text-primary">
//                 ₹{price}
//               </p>
//             </div>
//           </div>

//           <Button
//             onClick={handleBookAndPay}
//             size="lg"
//             className="w-full text-lg py-6 h-auto"
//             disabled={
//               bookingLoading ||
//               !verified ||
//               !form.dateISO ||
//               !form.timeSlot
//             }
//           >
//             {bookingLoading ? (
//               <>
//                 <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
//                 {t(
//                   "diagnosticsBooking.bookingInProgress",
//                   "Booking..."
//                 )}
//               </>
//             ) : (
//               t(
//                 "diagnosticsBooking.proceedToPayment",
//                 "Proceed to Payment"
//               )
//             )}
//           </Button>
//         </Card>
//       </div>
//     </KioskLayout>
//   );
// }
