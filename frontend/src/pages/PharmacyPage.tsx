import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Pill,
  Search,
  CreditCard,
  QrCode,
  ShoppingCart,
  Clock,
  CheckCircle,
  User,
  Phone,
  AlertCircle,
  Calendar,
} from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  MockPharmacyService,
  type PharmacyBillItem,
  type PharmacyBillSummary,
} from "@/lib/mock-services";

type VisitMode = "portal" | "walkin";

interface WalkinForm {
  name: string;
  phone: string;
  yearOfBirth: string;
}

interface LocalPharmacyItem extends PharmacyBillItem {
  selected?: boolean; // for walk-in selection
}

// Helper to normalize phone to E.164 (same logic as Identify/Lab pages)
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

const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string) || "").replace(/\/+$/, "");

export default function PharmacyPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const [mode, setMode] = useState<VisitMode | null>(null);

  // Shared state
  const [loading, setLoading] = useState(false);
  const [portalBill, setPortalBill] = useState<PharmacyBillSummary | null>(null);

  // Token state
  const [pickupToken, setPickupToken] = useState<string | null>(null);
  const [tokenSource, setTokenSource] = useState<"doctor" | "pharmacy">("pharmacy");

  // Existing doctor/visit token (if the patient already checked in on this device)
  const existingVisitToken = useMemo(() => {
    try {
      const raw = localStorage.getItem("medmitra-token");
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return obj?.number || obj?.id || null;
    } catch {
      return null;
    }
  }, []);

  // Keep a local view of patientId/phone after OTP flows
  const [patientId, setPatientId] = useState<string | null>(
    sessionStorage.getItem("kioskPatientId") || null
  );
  const [patientPhone, setPatientPhone] = useState<string | null>(
    sessionStorage.getItem("kioskPhone") || null
  );

  // ------------------- helpers -------------------

  const ensureToken = (hasDoctorVisit: boolean) => {
    // Try to reuse doctor/visit token when present and relevant.
    if (hasDoctorVisit && existingVisitToken) {
      setPickupToken(existingVisitToken);
      setTokenSource("doctor");
      return existingVisitToken;
    }

    const token = `PH${Date.now().toString().slice(-3)}`;
    setPickupToken(token);
    setTokenSource("pharmacy");
    return token;
  };

  // ------------------- PORTAL OTP + bill flow -------------------

  const [portalPhone, setPortalPhone] = useState("");
  const [portalOtpSent, setPortalOtpSent] = useState(false);
  const [portalOtpCode, setPortalOtpCode] = useState("");
  const [portalOtpSessionId, setPortalOtpSessionId] = useState<string | null>(null);
  const [portalOtpLoading, setPortalOtpLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const handlePortalSendOtp = async () => {
    const e164 = toE164(portalPhone);
    if (!e164 || e164.length < 12) {
      setPortalError("Please enter a valid mobile number (10 digits).");
      return;
    }
    setPortalOtpLoading(true);
    setPortalError(null);
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
      toast({
        title: "OTP Sent",
        description: `Code sent to ${data.normalizedPhone || e164}`,
      });
    } catch (e: any) {
      setPortalError(e?.message || "Failed to send OTP. Please try again.");
    } finally {
      setPortalOtpLoading(false);
    }
  };

  const handlePortalVerifyOtpAndFetchBill = async () => {
    const code = (portalOtpCode || "").replace(/\D/g, "");
    if (!code || code.length < 4) {
      setPortalError("Please enter the OTP sent to your phone.");
      return;
    }
    setLoading(true);
    setPortalError(null);
    setPickupToken(null);
    try {
      const e164 = toE164(portalPhone);
      // 1) Verify OTP
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

      const pid = data.patientId as string;
      const normalizedPhone = (data.normalizedPhone as string) || e164;

      // Store in session + local state
      setPatientId(pid);
      setPatientPhone(normalizedPhone);
      sessionStorage.setItem("kioskPatientId", pid);
      sessionStorage.setItem("kioskPhone", normalizedPhone);
      sessionStorage.setItem("kioskFlow", "pharmacy");

      // Set kiosk cookie
      fetch(`${API_BASE}/api/kiosk/session/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId: pid }),
      }).catch(() => {});

      // 2) Fetch real bill from backend
      const billRes = await fetch(
        `${API_BASE}/api/pharmacy/bills/by-patient?patientId=${encodeURIComponent(pid)}`
      );
      const billData = await billRes.json().catch(() => ({}));
      if (!billRes.ok) throw new Error(billData.detail || `Failed to fetch bill (${billRes.status})`);

      const bill = (billData.bill as PharmacyBillSummary | null) || null;

      if (!bill) {
        setPortalBill(null);
        toast({
          title: "No Pharmacy Orders",
          description: "We could not find any pharmacy orders for this patient.",
        });
        return;
      }

      // Attach existing visit token if any
      const enriched: PharmacyBillSummary = {
        ...bill,
        existingToken: bill.existingToken || existingVisitToken || undefined,
      };
      setPortalBill(enriched);

      if (enriched.status === "paid") {
        const tok = ensureToken(enriched.hasDoctorVisit);
        toast({
          title: "Bill Paid",
          description: `You can collect medicines with token ${tok}.`,
        });
      } else {
        toast({
          title: "Payment Pending",
          description: "Please complete payment before pickup.",
        });
      }
    } catch (e: any) {
      setPortalError(e?.message || "Something went wrong. Please see the front desk.");
      setPortalBill(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePayPortalBill = () => {
    if (!portalBill || !patientId) return;
    if (portalBill.status !== "pending") {
      toast({
        title: "Already Paid",
        description: "This bill is already marked as paid.",
      });
      return;
    }

    const stored = {
      billNumber: portalBill.billNumber,
      total: portalBill.total,
      patientId,
      hasDoctorVisit: portalBill.hasDoctorVisit,
    };

    localStorage.setItem("medmitra-pharmacy-bill", JSON.stringify(stored));
    sessionStorage.setItem("kioskFlow", "pharmacy");
    navigate("/payment");
  };

  const handleGeneratePickupToken = () => {
    if (!portalBill && mode === "portal") return;
    const tok = ensureToken(!!portalBill?.hasDoctorVisit);
    toast({
      title: "Pickup Token Generated",
      description: `Your pickup token: ${tok}`,
    });
  };

  // ------------------- WALK-IN flow (OTP + registration) -------------------

  const [walkinForm, setWalkinForm] = useState<WalkinForm>({
    name: "",
    phone: "",
    yearOfBirth: "",
  });

  const initialWalkinItems: LocalPharmacyItem[] = [
    {
      id: "WMED001",
      name: "Paracetamol",
      dosage: "500mg",
      quantity: 10,
      price: 25,
      prescribed: false,
      selected: false,
    },
    {
      id: "WMED002",
      name: "Vitamin C",
      dosage: "500mg",
      quantity: 20,
      price: 150,
      prescribed: false,
      selected: false,
    },
    {
      id: "WMED003",
      name: "Cough Syrup",
      dosage: "100ml",
      quantity: 1,
      price: 95,
      prescribed: false,
      selected: false,
    },
    {
      id: "WMED004",
      name: "Antacid",
      dosage: "Tablet",
      quantity: 15,
      price: 80,
      prescribed: false,
      selected: false,
    },
  ];

  const [walkinItems, setWalkinItems] = useState<LocalPharmacyItem[]>(initialWalkinItems);

  const totalWalkinAmount = useMemo(() => {
    return walkinItems
      .filter((i) => i.selected)
      .reduce((sum, i) => sum + i.price, 0);
  }, [walkinItems]);

  const [walkinOtpSent, setWalkinOtpSent] = useState(false);
  const [walkinOtpCode, setWalkinOtpCode] = useState("");
  const [walkinOtpSessionId, setWalkinOtpSessionId] = useState<string | null>(null);
  const [walkinOtpLoading, setWalkinOtpLoading] = useState(false);
  const [walkinLoading, setWalkinLoading] = useState(false);
  const [walkinError, setWalkinError] = useState<string | null>(null);
  const [walkinVerified, setWalkinVerified] = useState(false);

  const handleWalkinSendOtp = async () => {
    const digits = (walkinForm.phone || "").replace(/\D/g, "");
    if (!digits || digits.length < 10) {
      setWalkinError("Please enter a valid 10-digit mobile number.");
      return;
    }
    setWalkinOtpLoading(true);
    setWalkinError(null);
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
      setWalkinOtpSent(true);
      setWalkinOtpSessionId(payload.otpSessionId || null);
      toast({
        title: "OTP Sent",
        description: `We’ve sent an OTP to ${payload.normalizedPhone || digits}.`,
      });
    } catch (e: any) {
      setWalkinError(e?.message || "Could not send OTP. Please try again.");
    } finally {
      setWalkinOtpLoading(false);
    }
  };

  const handleWalkinVerifyAndRegister = async () => {
    const name = walkinForm.name.trim();
    const digits = (walkinForm.phone || "").replace(/\D/g, "");
    if (!name || !digits || !walkinForm.yearOfBirth) {
      setWalkinError("Please fill name, mobile and year of birth.");
      return;
    }
    const code = (walkinOtpCode || "").replace(/\D/g, "");
    if (!walkinOtpSent || !code || code.length < 4) {
      setWalkinError("Please verify your mobile number using the OTP.");
      return;
    }

    setWalkinLoading(true);
    setWalkinError(null);
    try {
      const res = await fetch(`${API_BASE}/api/kiosk/walkins/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mobile: digits,
          yearOfBirth: walkinForm.yearOfBirth,
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

      const pid = payload.patientId as string;
      const normalizedPhone = (payload.normalizedPhone as string) || digits;

      setPatientId(pid);
      setPatientPhone(normalizedPhone);
      sessionStorage.setItem("kioskPatientId", pid);
      sessionStorage.setItem("kioskVisitId", payload.kioskVisitId || "");
      sessionStorage.setItem("kioskPhone", normalizedPhone);
      sessionStorage.setItem("kioskFlow", "pharmacy");

      fetch(`${API_BASE}/api/kiosk/session/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId: pid }),
      }).catch(() => {});

      setWalkinVerified(true);
      toast({
        title: "Walk-in Verified",
        description: payload.created
          ? "Account created successfully."
          : "We found your existing account.",
      });
    } catch (e: any) {
      setWalkinError(e?.message || "Walk-in registration failed. Please see the front desk.");
    } finally {
      setWalkinLoading(false);
    }
  };

  const handleWalkinItemToggle = (id: string) => {
    setWalkinItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: !i.selected } : i))
    );
  };

  const handleConfirmWalkinBill = () => {
    const cleanedName = walkinForm.name.trim();
    const cleanedPhone = walkinForm.phone.trim();
    if (!cleanedName || !cleanedPhone || !walkinForm.yearOfBirth) {
      toast({
        variant: "destructive",
        title: "Details Required",
        description: "Please enter name, mobile number and year of birth.",
      });
      return;
    }
    if (!walkinVerified) {
      toast({
        variant: "destructive",
        title: "OTP Required",
        description: "Please verify your mobile number using OTP first.",
      });
      return;
    }
    if (totalWalkinAmount <= 0) {
      toast({
        variant: "destructive",
        title: "No Medicines Selected",
        description: "Please select at least one medicine to proceed.",
      });
      return;
    }

    const tok = ensureToken(Boolean(existingVisitToken));
    toast({
      title: "Walk-in Bill Created",
      description: `Please pay at the counter and show token ${tok}.`,
    });
  };

  const handleWalkinMarkPaid = () => {
    if (!pickupToken) {
      const tok = ensureToken(Boolean(existingVisitToken));
      setPickupToken(tok);
    }
    toast({
      title: "Payment Complete",
      description: `Use token ${pickupToken} at the pharmacy counter.`,
    });
  };

  // ------------------- render helpers -------------------

  const renderTokenSummary = () => {
    if (!pickupToken) return null;
    return (
      <Card className="mt-4 p-4 bg-muted/30 border-0">
        <h4 className="font-medium mb-2 flex items-center gap-2">
          <QrCode className="h-4 w-4" />
          Pickup Token
        </h4>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Token Number</div>
            <div className="text-2xl font-bold">{pickupToken}</div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Source: {tokenSource === "doctor" ? "Doctor Visit" : "Pharmacy"}</div>
            <div>Show this at the pharmacy counter</div>
          </div>
        </div>
      </Card>
    );
  };

  // ------------------- JSX -------------------

  return (
    <KioskLayout title="Pharmacy Services">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Pill className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary mb-4">
            Pharmacy Services
          </h1>
          <p className="text-lg text-muted-foreground">
            Pay for your prescription and generate pickup token
          </p>
        </div>

        {/* Mode selection */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            How are you visiting today?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className={`p-4 cursor-pointer border-2 ${
                mode === "portal"
                  ? "border-primary shadow-md"
                  : "border-transparent hover:border-primary/50"
              }`}
              onClick={() => {
                setMode("portal");
                setPickupToken(null);
              }}
            >
              <div className="flex items-start gap-3">
                <QrCode className="h-6 w-6 text-primary mt-1" />
                <div>
                  <h3 className="font-semibold">I booked medicines on app/portal</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    We’ll verify your phone, fetch your pharmacy bill and let you pay.
                  </p>
                </div>
              </div>
            </Card>

            <Card
              className={`p-4 cursor-pointer border-2 ${
                mode === "walkin"
                  ? "border-primary shadow-md"
                  : "border-transparent hover:border-primary/50"
              }`}
              onClick={() => {
                setMode("walkin");
                setPickupToken(null);
              }}
            >
              <div className="flex items-start gap-3">
                <User className="h-6 w-6 text-primary mt-1" />
                <div>
                  <h3 className="font-semibold">I walked in to buy medicines</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    We’ll verify your mobile by OTP and create a quick bill.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </Card>

        {/* PORTAL FLOW */}
        {mode === "portal" && (
          <>
            <Card className="p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Verify Mobile & Fetch Bill
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium flex items-center gap-2 mb-1">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Mobile Number
                  </label>
                  <Input
                    value={portalPhone}
                    onChange={(e) => {
                      setPortalPhone(e.target.value);
                      setPortalError(null);
                    }}
                    placeholder="+91 98765 43210"
                    className="h-12"
                  />
                </div>

                {portalError && (
                  <div className="flex items-start gap-2 text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 mt-0.5" />
                    <span>{portalError}</span>
                  </div>
                )}

                {!portalOtpSent ? (
                  <Button
                    onClick={handlePortalSendOtp}
                    size="lg"
                    disabled={portalOtpLoading || !portalPhone.trim()}
                    className="w-full sm:w-auto"
                  >
                    {portalOtpLoading && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    )}
                    Send OTP
                  </Button>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium mb-1 block">
                        Enter OTP sent to your mobile
                      </label>
                      <Input
                        value={portalOtpCode}
                        onChange={(e) => setPortalOtpCode(e.target.value)}
                        maxLength={6}
                        placeholder="4–6 digit OTP"
                        className="h-12"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={handlePortalVerifyOtpAndFetchBill}
                        size="lg"
                        disabled={loading || !portalOtpCode.trim()}
                        className="w-full sm:w-auto"
                      >
                        {loading && (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        )}
                        Verify & Fetch Bill
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={handlePortalSendOtp}
                        disabled={portalOtpLoading}
                        className="w-full sm:w-auto"
                      >
                        Resend OTP
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* Bill Details */}
            {portalBill && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                {/* Bill Items */}
                <Card className="lg:col-span-2 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Prescription Details</h2>
                    <Badge
                      variant={portalBill.status === "paid" ? "default" : "destructive"}
                      className="text-sm px-3 py-1"
                    >
                      {portalBill.status === "paid" ? "Paid" : "Payment Pending"}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bill Number:</span>
                      <span className="font-mono">{portalBill.billNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Patient:</span>
                      <span>{portalBill.patientName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Phone:</span>
                      <span>{portalBill.phone}</span>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-3">
                    {portalBill.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground">{item.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {item.dosage} × {item.quantity} units
                          </p>
                          {item.prescribed && (
                            <Badge variant="outline" className="mt-1 text-xs">
                              Doctor Prescribed
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold text-foreground">
                            ₹{item.price}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Payment Summary & Actions */}
                <div className="space-y-6">
                  {/* Bill Summary */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Bill Summary</h3>

                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-muted-foreground">
                          Medicines ({portalBill.items.length} items)
                        </span>
                        <span>₹{portalBill.total}</span>
                      </div>

                      <Separator />

                      <div className="flex justify-between text-lg font-semibold">
                        <span>Total Amount</span>
                        <span className="text-primary">₹{portalBill.total}</span>
                      </div>
                    </div>
                  </Card>

                  {/* Actions */}
                  <Card className="p-6">
                    <h3 className="text-lg font-semibold mb-4">Actions</h3>

                    <div className="space-y-3">
                      {portalBill.status === "pending" ? (
                        <Button
                          onClick={handlePayPortalBill}
                          size="lg"
                          disabled={loading}
                          className="w-full justify-start"
                        >
                          <CreditCard className="h-5 w-5 mr-2" />
                          Pay Now via Kiosk
                        </Button>
                      ) : (
                        <div className="text-center py-4">
                          <CheckCircle className="h-12 w-12 text-success mx-auto mb-2" />
                          <p className="font-medium text-success">
                            Payment Complete
                          </p>
                        </div>
                      )}

                      <Button
                        onClick={handleGeneratePickupToken}
                        variant="outline"
                        size="lg"
                        disabled={portalBill.status === "pending"}
                        className="w-full justify-start"
                      >
                        <QrCode className="h-5 w-5 mr-2" />
                        {portalBill.status === "pending"
                          ? "Generate Token After Payment"
                          : "Generate / Show Pickup Token"}
                      </Button>
                    </div>
                  </Card>
                </div>
              </div>
            )}

            {renderTokenSummary()}
          </>
        )}

        {/* WALK-IN FLOW */}
        {mode === "walkin" && (
          <>
            <Card className="p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Walk-in Details
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="md:col-span-1">
                  <label className="text-sm font-medium flex items-center gap-2 mb-1">
                    <User className="h-4 w-4 text-muted-foreground" />
                    Name
                  </label>
                  <Input
                    value={walkinForm.name}
                    onChange={(e) =>
                      setWalkinForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Full name"
                    className="h-12"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm font-medium flex items-center gap-2 mb-1">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    Mobile Number
                  </label>
                  <Input
                    value={walkinForm.phone}
                    onChange={(e) =>
                      setWalkinForm((p) => ({ ...p, phone: e.target.value }))
                    }
                    placeholder="+91 98765 43210"
                    className="h-12"
                  />
                </div>
                <div className="md:col-span-1">
                  <label className="text-sm font-medium flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    Year of Birth
                  </label>
                  <Input
                    value={walkinForm.yearOfBirth}
                    onChange={(e) =>
                      setWalkinForm((p) => ({
                        ...p,
                        yearOfBirth: e.target.value.replace(/\D/g, ""),
                      }))
                    }
                    placeholder="e.g. 1990"
                    maxLength={4}
                    className="h-12"
                  />
                </div>
              </div>

              {walkinError && (
                <div className="flex items-start gap-2 text-sm text-red-600 mb-2">
                  <AlertCircle className="h-4 w-4 mt-0.5" />
                  <span>{walkinError}</span>
                </div>
              )}

              {existingVisitToken && (
                <Card className="mt-2 p-3 bg-primary/5 border-primary/20">
                  <p className="text-xs text-muted-foreground">
                    We’ll reuse your existing visit token{" "}
                    <span className="font-semibold">{existingVisitToken}</span>{" "}
                    for pharmacy pickup.
                  </p>
                </Card>
              )}

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                {!walkinOtpSent ? (
                  <Button
                    onClick={handleWalkinSendOtp}
                    size="lg"
                    disabled={
                      walkinOtpLoading ||
                      !walkinForm.phone.trim() ||
                      !walkinForm.name.trim() ||
                      !walkinForm.yearOfBirth.trim()
                    }
                    className="w-full sm:w-auto"
                  >
                    {walkinOtpLoading && (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    )}
                    Send OTP
                  </Button>
                ) : (
                  <>
                    <div className="flex-1">
                      <label className="text-sm font-medium mb-1 block">
                        Enter OTP sent to your mobile
                      </label>
                      <Input
                        value={walkinOtpCode}
                        onChange={(e) => setWalkinOtpCode(e.target.value)}
                        maxLength={6}
                        placeholder="4–6 digit OTP"
                        className="h-12"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        onClick={handleWalkinVerifyAndRegister}
                        size="lg"
                        disabled={
                          walkinLoading ||
                          !walkinOtpCode.trim() ||
                          !walkinForm.name.trim() ||
                          !walkinForm.phone.trim() ||
                          !walkinForm.yearOfBirth.trim()
                        }
                        className="w-full sm:w-auto"
                      >
                        {walkinLoading && (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        )}
                        Verify OTP & Continue
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="lg"
                        onClick={handleWalkinSendOtp}
                        disabled={walkinOtpLoading}
                        className="w-full sm:w-auto"
                      >
                        Resend OTP
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </Card>

            {/* Medicine selection */}
            <Card className="p-6 mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Pill className="h-5 w-5 text-primary" />
                Select Medicines
              </h2>

              <div className="space-y-3">
                {walkinItems.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover:bg-muted/40"
                  >
                    <div>
                      <div className="font-medium">{item.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {item.dosage} · Qty {item.quantity}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">₹{item.price}</span>
                      <input
                        type="checkbox"
                        className="h-5 w-5"
                        checked={!!item.selected}
                        onChange={() => handleWalkinItemToggle(item.id)}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </Card>

            {/* Summary & actions */}
            <Card className="p-6 mb-4">
              <h3 className="text-lg font-semibold mb-3">Walk-in Bill Summary</h3>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">
                  Selected items
                </span>
                <span>{walkinItems.filter((i) => i.selected).length}</span>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <span>Total Amount</span>
                <span className="text-primary">₹{totalWalkinAmount}</span>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={handleConfirmWalkinBill}
                  size="lg"
                  className="flex-1"
                  disabled={
                    totalWalkinAmount <= 0 ||
                    !walkinForm.name.trim() ||
                    !walkinForm.phone.trim() ||
                    !walkinForm.yearOfBirth.trim()
                  }
                >
                  Confirm &amp; Generate Token
                </Button>
                <Button
                  onClick={handleWalkinMarkPaid}
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  disabled={totalWalkinAmount <= 0}
                >
                  Mark Payment Done
                </Button>
              </div>
            </Card>

            {renderTokenSummary()}
          </>
        )}

        {/* Pharmacy Information */}
        <Card className="p-6 bg-gradient-subtle mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <Pill className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Pharmacy Location</h4>
              <p className="text-sm text-muted-foreground">Ground Floor - Main Building</p>
            </div>

            <div className="text-center">
              <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <Clock className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Working Hours</h4>
              <p className="text-sm text-muted-foreground">8:00 AM - 9:00 PM</p>
            </div>

            <div className="text-center">
              <div className="bg-primary/10 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-primary" />
              </div>
              <h4 className="font-medium mb-1">Licensed Pharmacy</h4>
              <p className="text-sm text-muted-foreground">Certified & Quality Assured</p>
            </div>
          </div>
        </Card>

        {/* Help Section */}
        <Card className="mt-6 p-4 bg-muted/30 border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Need help finding your prescription?</p>
              <p className="text-sm text-muted-foreground">
                Contact our pharmacy staff or visit the front desk for assistance.
              </p>
            </div>

            <Button onClick={() => navigate("/help")} variant="outline">
              Get Help
            </Button>
          </div>
        </Card>
      </div>
    </KioskLayout>
  );
}
