// import { useEffect, useMemo, useRef, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { Button } from "@/components/ui/button";
// import { Card } from "@/components/ui/card";
// import { Separator } from "@/components/ui/separator";
// import { Badge } from "@/components/ui/badge";
// import { CreditCard, Smartphone, IndianRupee, Check, X, Clock, Receipt } from "lucide-react";
// import KioskLayout from "@/components/KioskLayout";
// import { useTranslation, getStoredLanguage } from "@/lib/i18n";
// import { useToast } from "@/hooks/use-toast";
// import { SERVICE_CATALOG, calcBill, ServiceId } from "@/lib/pricing";

// // ---- Types & globals --------------------------------------------------------
// interface PaymentMethod {
//   id: "upi" | "card";
//   name: string;
//   icon: React.ComponentType<{ className?: string }>;
//   description: string;
// }

// type KioskFlow = "walkin" | "identify" | "lab" | "pharmacy";

// type StoredLabTest = {
//   id: string;
//   name: string;
//   price: number;
// };

// type StoredLabBooking = {
//   orderedTests?: StoredLabTest[];
//   additionalTests?: StoredLabTest[];
//   total?: number;
//   appointmentId?: string;
//   patientId?: string;
//   bookingId?: string;
// };

// type StoredPharmacyBill = {
//   billNumber: string;
//   total: number;
//   patientId: string;
//   hasDoctorVisit?: boolean;
// };

// declare global {
//   interface Window {
//     Razorpay?: any;
//   }
// }

// // ---- Env & constants --------------------------------------------------------
// const runtimeOverride =
//   (window as any).__API_BASE_URL__ ||
//   new URLSearchParams(location.search).get("api") ||
//   localStorage.getItem("API_BASE_URL_OVERRIDE") ||
//   "";

// const API_BASE = (runtimeOverride || (import.meta as any)?.env?.VITE_API_BASE_URL || "").replace(/\/+$/, "");
// const RZP_JS = import.meta.env.VITE_RAZORPAY_CHECKOUT_URL || "https://checkout.razorpay.com/v1/checkout.js";
// const MICRO_TEST = (import.meta.env.VITE_RZP_MICRO_TEST === "true");

// // Small helper to safely load checkout.js once
// async function loadRazorpay(src: string) {
//   return new Promise<void>((resolve, reject) => {
//     if (document.querySelector(`script[src="${src}"]`)) return resolve();
//     const s = document.createElement("script");
//     s.src = src;
//     s.async = true;
//     s.onload = () => resolve();
//     s.onerror = () => reject(new Error("Failed to load Razorpay checkout.js"));
//     document.body.appendChild(s);
//   });
// }

// // Attach payment details into the appointment row's `kiosk` field (no-op if we don't have an appointment)
// async function attachPaymentToAppointment({
//   method,
//   amount,
//   orderId,
//   paymentId,
// }: {
//   method: "upi" | "card" | string;
//   amount: number; // rupees
//   orderId: string;
//   paymentId: string;
// }) {
//   const patientId = sessionStorage.getItem("kioskPatientId") || "";
//   const appointmentId = sessionStorage.getItem("kioskSelectedAppointmentId") || "";

//   if (!patientId || !appointmentId) return;

//   await fetch(`${API_BASE}/api/kiosk/appointments/attach`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     credentials: "include",
//     body: JSON.stringify({
//       patientId,
//       appointmentId,
//       kiosk: {
//         payment: {
//           provider: "razorpay",
//           status: "success",
//           method,
//           amount, // ₹ (display amount)
//           orderId,
//           paymentId,
//           verified: true,
//           verifiedAt: new Date().toISOString(),
//         },
//       },
//     }),
//   }).catch(() => {
//     // Intentionally swallow errors — payment is already verified; we don't block UX on telemetry write
//   });
// }

// // ---- Component --------------------------------------------------------------
// export default function PaymentPage() {
//   const navigate = useNavigate();
//   const { t } = useTranslation(getStoredLanguage());
//   const { toast } = useToast();

//   const flow = (sessionStorage.getItem("kioskFlow") || "identify") as KioskFlow;

//   const [selectedMethod, setSelectedMethod] = useState<PaymentMethod["id"] | "">("");
//   const [loading, setLoading] = useState(false);
//   const [paymentStatus, setPaymentStatus] = useState<"pending" | "processing" | "success" | "failed">("pending");
//   const [transactionId, setTransactionId] = useState<string>("");

//   // guard against double-opens
//   const openingRef = useRef(false);

//   // ---------- Service picker (WALK-IN only) ----------
//   const [selectedServices, setSelectedServices] = useState<ServiceId[]>(() => {
//     const prev = sessionStorage.getItem("walkinSelectedServices");
//     if (!prev) return ["consultation"];
//     try {
//       const arr = JSON.parse(prev) as ServiceId[];
//       return Array.isArray(arr) && arr.length ? arr : ["consultation"];
//     } catch {
//       return ["consultation"];
//     }
//   });

//   const bill = useMemo(() => {
//     const includeRegistration = flow === "walkin";
//     return calcBill(selectedServices, includeRegistration);
//   }, [selectedServices, flow]);

//   useEffect(() => {
//     if (flow === "walkin") {
//       sessionStorage.setItem("walkinSelectedServices", JSON.stringify(selectedServices));
//       sessionStorage.setItem("walkinBill", JSON.stringify(bill));
//     }
//   }, [selectedServices, bill, flow]);

//   // ---------- Lab booking (LAB flow) ----------
//   const labBooking: StoredLabBooking | null = useMemo(() => {
//     if (flow !== "lab") return null;
//     const raw = localStorage.getItem("medmitra-lab-booking");
//     if (!raw) return null;
//     try {
//       const parsed = JSON.parse(raw) as StoredLabBooking;
//       return parsed || null;
//     } catch {
//       return null;
//     }
//   }, [flow]);

//   const labBill = useMemo(() => {
//     if (flow !== "lab" || !labBooking) return null;
//     const ordered = labBooking.orderedTests ?? [];
//     const additional = labBooking.additionalTests ?? [];
//     const orderedTotal = ordered.reduce((sum, t) => sum + (t.price || 0), 0);
//     const additionalTotal = additional.reduce((sum, t) => sum + (t.price || 0), 0);
//     const totalFromTests = orderedTotal + additionalTotal;
//     const total = typeof labBooking.total === "number" && labBooking.total > 0 ? labBooking.total : totalFromTests;
//     return {
//       ordered,
//       additional,
//       orderedTotal,
//       additionalTotal,
//       total,
//     };
//   }, [flow, labBooking]);

//   // ---------- Pharmacy bill (PHARMACY flow) ----------
//   const pharmacyBill: StoredPharmacyBill | null = useMemo(() => {
//     if (flow !== "pharmacy") return null;
//     const raw = localStorage.getItem("medmitra-pharmacy-bill");
//     if (!raw) return null;
//     try {
//       const parsed = JSON.parse(raw) as StoredPharmacyBill;
//       if (!parsed || typeof parsed.total !== "number") return null;
//       return parsed;
//     } catch {
//       return null;
//     }
//   }, [flow]);

//   // We keep only ONE online option for Razorpay (all methods available).
//   const paymentMethods: PaymentMethod[] = [
//     {
//       id: "upi", // used only to trigger the same checkout; we are NOT forcing UPI
//       name: "Pay Online (Razorpay)",
//       icon: Smartphone,
//       description: "UPI, Card, Netbanking & Wallets",
//     },
//   ];

//   const handleToggleService = (id: ServiceId) => {
//     setSelectedServices((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
//   };

//   // Pick/derive an invoice id for this flow
//   const getInvoiceId = () => {
//     return (
//       sessionStorage.getItem("kioskVisitId") ||
//       sessionStorage.getItem("kioskSelectedAppointmentId") ||
//       `WALKIN-${Date.now()}`
//     );
//   };

//   // ---------- Identify-flow amount & breakdown ----------
//   const identifyPricing = useMemo(() => {
//     // Default total if we cannot infer anything from the appointment
//     let total = 605;

//     try {
//       const raw = sessionStorage.getItem("kioskSelectedAppointmentRaw");
//       if (raw) {
//         const appt = JSON.parse(raw);

//         // Prefer canonical amount from appointment.payment.amount if present
//         const paymentAmount = appt?.payment?.amount;
//         if (typeof paymentAmount === "number" && paymentAmount > 0) {
//           total = paymentAmount;
//         } else {
//           // Fallback: fee fields ("₹500", "500", etc.)
//           const feeStr =
//             (appt?.fee as string | undefined) || (appt?.appointment_details?.fee as string | undefined);
//           if (feeStr) {
//             const m = String(feeStr).match(/[\d.]+/);
//             if (m) {
//               const feeNum = Number(m[0]);
//               if (!Number.isNaN(feeNum) && feeNum > 0) {
//                 const reg = 1;
//                 const basePlusReg = feeNum + reg;
//                 const gst = Math.round(basePlusReg * 0.1);
//                 total = basePlusReg + gst;
//               }
//             }
//           }
//         }
//       }
//     } catch {
//       // ignore parse errors, keep default 605
//     }

//     // Breakdown: consultation + registration + GST (10% of both)
//     const registrationFee = 1;
//     const basePlusReg = Math.round(total / 1.1); // approximate pre-tax amount
//     const consultationFee = Math.max(0, basePlusReg - registrationFee);
//     const gst = Math.max(0, total - consultationFee - registrationFee);

//     return {
//       total,
//       consultationFee,
//       registrationFee,
//       gst,
//     };
//   }, []);

//   // Amount (in rupees) rendered on UI; convert to paise for Razorpay Order
//   const uiAmount = useMemo(() => {
//     const real =
//       flow === "walkin"
//         ? bill.total
//         : flow === "lab"
//         ? labBill?.total ?? 0
//         : flow === "pharmacy"
//         ? pharmacyBill?.total ?? 0
//         : identifyPricing.total;
//     return MICRO_TEST ? 1 : real; // force ₹1 when micro-test is ON
//   }, [flow, bill.total, identifyPricing.total, labBill?.total, pharmacyBill?.total]);

//   const payWithRazorpay = async (method: PaymentMethod["id"]) => {
//     if (openingRef.current) return; // prevent double invokes
//     openingRef.current = true;

//     setSelectedMethod(method);
//     setPaymentStatus("processing");
//     setLoading(true);

//     try {
//       const patientId =
//         sessionStorage.getItem("kioskPatientId") ||
//         pharmacyBill?.patientId ||
//         "";

//       const appointmentId =
//         flow === "pharmacy"
//           ? ""
//           : sessionStorage.getItem("kioskSelectedAppointmentId") ||
//             (labBooking?.appointmentId || "");

//       if (!patientId) {
//         throw new Error("Session expired. Please verify your phone again.");
//       }
//       if (flow !== "pharmacy" && !appointmentId) {
//         throw new Error("Missing appointment context. Please book a slot again.");
//       }

//       const amountPaise = Math.round(uiAmount * 100);
//       if (amountPaise <= 0) throw new Error("Invalid amount");

//       const invoiceId =
//         flow === "pharmacy"
//           ? (pharmacyBill?.billNumber || `PHARM-${Date.now()}`)
//           : getInvoiceId();

//       await loadRazorpay(RZP_JS);
//       if (!window.Razorpay) throw new Error("Razorpay SDK not available");

//       const orderUrl =
//         flow === "pharmacy"
//           ? `${API_BASE}/api/billing/razorpay/pharmacy/order`
//           : `${API_BASE}/api/billing/razorpay/order`;

//       const createRes = await fetch(orderUrl, {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//           ...(flow === "pharmacy" ? {} : { "X-Patient-Id": patientId }),
//         },
//         credentials: "include",
//         body: JSON.stringify(
//           flow === "pharmacy"
//             ? {
//                 patientId,
//                 invoice_id: invoiceId,
//                 amount: amountPaise,
//                 currency: "INR",
//                 notes: { flow, patientId },
//                 customer: {
//                   name: "",
//                   email: "",
//                   contact: sessionStorage.getItem("kioskPhone") || "",
//                 },
//               }
//             : {
//                 patientId,
//                 appointmentId,
//                 invoice_id: invoiceId,
//                 amount: amountPaise,
//                 currency: "INR",
//                 notes: { flow, patientId, appointmentId },
//                 customer: {
//                   name: "",
//                   email: "",
//                   contact: sessionStorage.getItem("kioskPhone") || "",
//                 },
//               }
//         ),
//       });

//       if (!createRes.ok) {
//         const txt = await createRes.text().catch(() => "");
//         throw new Error(`Order create failed (${createRes.status}): ${txt || "unknown"}`);
//       }
//       const { key_id, order_id, currency } = await createRes.json();

//       const rzp = new window.Razorpay({
//         key: key_id,
//         order_id,
//         amount: amountPaise,
//         currency: currency || "INR",
//         name: "MedMitra AI",
//         description:
//           flow === "walkin"
//             ? "Walk-in visit payment"
//             : flow === "lab"
//             ? "Lab tests payment"
//             : flow === "pharmacy"
//             ? "Pharmacy payment"
//             : "Consultation payment",
//         prefill: { contact: sessionStorage.getItem("kioskPhone") || "" },
//         notes: { invoice_id: invoiceId },

//         handler: async (resp: any) => {
//           try {
//             const verifyUrl =
//               flow === "pharmacy"
//                 ? `${API_BASE}/api/billing/razorpay/pharmacy/verify`
//                 : `${API_BASE}/api/billing/razorpay/verify`;

//             const verifyRes = await fetch(verifyUrl, {
//               method: "POST",
//               headers: {
//                 "Content-Type": "application/json",
//                 ...(flow === "pharmacy" ? {} : { "X-Patient-Id": patientId }),
//               },
//               credentials: "include",
//               body: JSON.stringify(
//                 flow === "pharmacy"
//                   ? {
//                       patientId,
//                       invoice_id: invoiceId,
//                       razorpay_payment_id: resp.razorpay_payment_id,
//                       razorpay_order_id: resp.razorpay_order_id,
//                       razorpay_signature: resp.razorpay_signature,
//                     }
//                   : {
//                       patientId,
//                       appointmentId,
//                       invoice_id: invoiceId,
//                       razorpay_payment_id: resp.razorpay_payment_id,
//                       razorpay_order_id: resp.razorpay_order_id,
//                       razorpay_signature: resp.razorpay_signature,
//                     }
//               ),
//             });

//             if (!verifyRes.ok) throw new Error("Signature verification failed");

//             setPaymentStatus("success");
//             setTransactionId(resp.razorpay_payment_id || "");

//             sessionStorage.setItem(
//               "lastPayment",
//               JSON.stringify({
//                 flow,
//                 method,
//                 amount: uiAmount,
//                 transactionId: resp.razorpay_payment_id || "",
//                 at: new Date().toISOString(),
//                 bill,
//                 labBill,
//                 pharmacyBill,
//               })
//             );

//             // For pharmacy we don't attach to appointment
//             if (flow !== "pharmacy") {
//               await attachPaymentToAppointment({
//                 method,
//                 amount: uiAmount,
//                 orderId: resp.razorpay_order_id,
//                 paymentId: resp.razorpay_payment_id,
//               });
//             }

//             setTimeout(() => navigate("/token"), 1200);
//           } catch (e: any) {
//             setPaymentStatus("failed");
//             toast({
//               variant: "destructive",
//               title: "Verification Failed",
//               description: e?.message || "Please try again.",
//             });
//           } finally {
//             setLoading(false);
//             openingRef.current = false;
//           }
//         },

//         modal: {
//           ondismiss: () => {
//             setPaymentStatus("pending");
//             setSelectedMethod("");
//             setLoading(false);
//             openingRef.current = false;
//           },
//         },

//         theme: { color: "#1E293B" },
//       });

//       rzp.on("payment.failed", (resp: any) => {
//         setPaymentStatus("failed");
//         setSelectedMethod("");
//         setLoading(false);
//         openingRef.current = false;
//         toast({
//           variant: "destructive",
//           title: "Payment Failed",
//           description: resp?.error?.description || "Payment was not completed.",
//         });
//       });

//       rzp.open();
//     } catch (err: any) {
//       console.error(err);
//       setPaymentStatus("failed");
//       toast({
//         variant: "destructive",
//         title: "Payment Error",
//         description: err?.message || "Could not start payment",
//       });
//       setLoading(false);
//       openingRef.current = false;
//     }
//   };

//   const handleRetry = () => {
//     setPaymentStatus("pending");
//     setSelectedMethod("");
//     setTransactionId("");
//   };

//   // NEW: record pay-later cash in DB and DO NOT issue token on kiosk
//   const handleSkip = async () => {
//     try {
//       setLoading(true);
//       const patientId =
//         sessionStorage.getItem("kioskPatientId") ||
//         pharmacyBill?.patientId ||
//         "";
//       const appointmentId =
//         flow === "pharmacy"
//           ? ""
//           : sessionStorage.getItem("kioskSelectedAppointmentId") ||
//             (labBooking?.appointmentId || "");

//       if (patientId && appointmentId && flow !== "pharmacy") {
//         await fetch(`${API_BASE}/api/kiosk/appointments/attach`, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           credentials: "include",
//           body: JSON.stringify({
//             patientId,
//             appointmentId,
//             kiosk: {
//               payment: {
//                 mode: "pay_later",
//                 status: "unpaid",
//                 channel: "front-desk",
//                 amount: uiAmount,
//                 notedAt: new Date().toISOString(),
//               },
//             },
//           }),
//         }).catch(() => {});
//       }
//     } finally {
//       setLoading(false);
//       // No token generation here; front desk will handle cash & token
//       navigate("/cash-pending");
//     }
//   };

//   const handlePrintReceipt = async () => {
//     if (transactionId) {
//       toast({
//         title: "Receipt Printing",
//         description: "Your receipt will be printed at the front desk.",
//       });
//     }
//   };

//   // ---------- Success / Failed UIs ----------
//   if (paymentStatus === "success") {
//     return (
//       <KioskLayout title="Payment Successful" showBack={false}>
//         <div className="max-w-2xl mx-auto text-center">
//           <div className="mb-8">
//             <div className="bg-success/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
//               <Check className="h-12 w-12 text-success" />
//             </div>
//             <h1 className="text-3xl font-bold text-success mb-4">Payment Successful!</h1>
//             <p className="text-lg text-muted-foreground">Your payment has been processed successfully</p>
//           </div>

//           <Card className="p-6 mb-6">
//             <div className="space-y-4">
//               <div className="flex justify-between items-center">
//                 <span className="text-muted-foreground">Amount Paid</span>
//                 <span className="text-2xl font-bold text-foreground">₹{uiAmount}</span>
//               </div>
//               <div className="flex justify-between items-center">
//                 <span className="text-muted-foreground">Transaction ID</span>
//                 <Badge variant="outline" className="font-mono">
//                   {transactionId}
//                 </Badge>
//               </div>
//               <div className="flex justify-between items-center">
//                 <span className="text-muted-foreground">Payment Method</span>
//                 <span className="capitalize">{selectedMethod}</span>
//               </div>
//               <div className="flex justify-between items-center">
//                 <span className="text-muted-foreground">Date & Time</span>
//                 <span>{new Date().toLocaleString()}</span>
//               </div>
//             </div>
//           </Card>

//           <div className="flex gap-4">
//             <Button onClick={handlePrintReceipt} variant="outline" size="lg" className="flex-1 text-lg py-4 h-auto">
//               <Receipt className="h-5 w-5 mr-2" /> Print Receipt
//             </Button>
//             <Button onClick={() => navigate("/token")} size="lg" className="flex-1 text-lg py-4 h-auto">
//               Continue
//             </Button>
//           </div>

//           <Card className="mt-6 p-4 bg-muted/30 border-0">
//             <p className="text-sm text-muted-foreground">
//               Proceeding to token generation in <Clock className="inline h-4 w-4" /> ~1–2 seconds...
//             </p>
//           </Card>
//         </div>
//       </KioskLayout>
//     );
//   }

//   if (paymentStatus === "failed") {
//     return (
//       <KioskLayout title="Payment Failed">
//         <div className="max-w-2xl mx-auto text-center">
//           <div className="mb-8">
//             <div className="bg-destructive/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
//               <X className="h-12 w-12 text-destructive" />
//             </div>
//             <h1 className="text-3xl font-bold text-destructive mb-4">Payment Failed</h1>
//             <p className="text-lg text-muted-foreground mb-6">
//               We couldn't process your payment. Please try again or contact our front desk for assistance.
//             </p>
//             <div className="flex gap-4">
//               <Button onClick={handleRetry} size="lg" className="flex-1 text-xl py-6 h-auto">
//                 Try Again
//               </Button>
//               <Button
//                 onClick={() => navigate("/help")}
//                 variant="outline"
//                 size="lg"
//                 className="flex-1 text-lg py-4 h-auto"
//               >
//                 Get Help
//               </Button>
//             </div>
//           </div>
//         </div>
//       </KioskLayout>
//     );
//   }

//   // ---------- Main Payment page ----------
//   return (
//     <KioskLayout title="Payment">
//       <div className="max-w-3xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-8">
//           <IndianRupee className="h-16 w-16 text-primary mx-auto mb-4" />
//           <h1 className="text-3xl font-bold text-primary mb-4">Payment Summary</h1>
//           <p className="text-lg text-muted-foreground">
//             {flow === "walkin"
//               ? "Please select your services and complete the payment"
//               : flow === "lab"
//               ? "Please review your lab charges and complete the payment"
//               : flow === "pharmacy"
//               ? "Please review your pharmacy charges and complete the payment"
//               : "Please review your charges and complete the payment"}
//           </p>
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
//           {/* Bill Summary */}
//           <Card className="p-6">
//             <h2 className="text-xl font-semibold mb-4">Bill Details</h2>

//             {flow === "walkin" ? (
//               <>
//                 <div className="space-y-2 mb-3">
//                   {selectedServices.map((sid) => {
//                     const svc = SERVICE_CATALOG.find((s) => s.id === sid);
//                     return (
//                       <div key={sid} className="flex justify-between">
//                         <span className="text-muted-foreground">{svc?.name}</span>
//                         <span>₹{svc?.price}</span>
//                       </div>
//                     );
//                   })}
//                 </div>

//                 <div className="flex justify-between">
//                   <span className="text-muted-foreground">Registration Fee</span>
//                   <span>₹{bill.registrationFee}</span>
//                 </div>

//                 <Separator className="my-3" />
//                 <div className="flex justify-between">
//                   <span className="text-muted-foreground">Subtotal</span>
//                   <span>₹{bill.subtotal}</span>
//                 </div>
//                 <div className="flex justify-between">
//                   <span className="text-muted-foreground">GST (10%)</span>
//                   <span>₹{bill.tax}</span>
//                 </div>
//                 <Separator className="my-3" />
//                 <div className="flex justify-between text-lg font-semibold">
//                   <span>Total Amount</span>
//                   <span className="text-primary">₹{bill.total}</span>
//                 </div>
//               </>
//             ) : flow === "lab" ? (
//               <div className="space-y-3">
//                 {labBill && (
//                   <>
//                     {labBill.ordered.length > 0 && (
//                       <>
//                         <p className="text-sm font-medium text-muted-foreground mb-1">Doctor-Ordered Tests</p>
//                         <div className="space-y-1 mb-2">
//                           {labBill.ordered.map((t) => (
//                             <div key={t.id} className="flex justify-between text-sm">
//                               <span className="text-muted-foreground">{t.name}</span>
//                               <span>₹{t.price}</span>
//                             </div>
//                           ))}
//                         </div>
//                         <div className="flex justify-between mb-3">
//                           <span className="text-xs text-muted-foreground">Subtotal (Ordered)</span>
//                           <span className="text-xs">₹{labBill.orderedTotal}</span>
//                         </div>
//                         <Separator className="my-2" />
//                       </>
//                     )}

//                     {labBill.additional.length > 0 && (
//                       <>
//                         <p className="text-sm font-medium text-muted-foreground mb-1">Additional Tests</p>
//                         <div className="space-y-1 mb-2">
//                           {labBill.additional.map((t) => (
//                             <div key={t.id} className="flex justify-between text-sm">
//                               <span className="text-muted-foreground">{t.name}</span>
//                               <span>₹{t.price}</span>
//                             </div>
//                           ))}
//                         </div>
//                         <div className="flex justify-between mb-3">
//                           <span className="text-xs text-muted-foreground">Subtotal (Additional)</span>
//                           <span className="text-xs">₹{labBill.additionalTotal}</span>
//                         </div>
//                         <Separator className="my-2" />
//                       </>
//                     )}

//                     <div className="flex justify-between text-lg font-semibold">
//                       <span>Total Amount</span>
//                       <span className="text-primary">₹{labBill.total}</span>
//                     </div>
//                   </>
//                 )}

//                 {!labBill && (
//                   <p className="text-sm text-muted-foreground">
//                     No lab booking details found. Please go back and select your tests again.
//                   </p>
//                 )}
//               </div>
//             ) : flow === "pharmacy" ? (
//               <div className="space-y-3">
//                 {pharmacyBill ? (
//                   <>
//                     <div className="flex justify-between">
//                       <span className="text-muted-foreground">Bill Number</span>
//                       <span className="font-mono">{pharmacyBill.billNumber}</span>
//                     </div>
//                     <Separator className="my-3" />
//                     <div className="flex justify-between text-lg font-semibold">
//                       <span>Total Amount</span>
//                       <span className="text-primary">₹{pharmacyBill.total}</span>
//                     </div>
//                   </>
//                 ) : (
//                   <p className="text-sm text-muted-foreground">
//                     No pharmacy bill found. Please go back and fetch the bill again.
//                   </p>
//                 )}
//               </div>
//             ) : (
//               <div className="space-y-3">
//                 <div className="flex justify-between">
//                   <span className="text-muted-foreground">Consultation Fee</span>
//                   <span>₹{identifyPricing.consultationFee}</span>
//                 </div>
//                 <div className="flex justify-between">
//                   <span className="text-muted-foreground">Registration Fee</span>
//                   <span>₹{identifyPricing.registrationFee}</span>
//                 </div>
//                 <div className="flex justify-between">
//                   <span className="text-muted-foreground">GST (10%)</span>
//                   <span>₹{identifyPricing.gst}</span>
//                 </div>
//                 <Separator />
//                 <div className="flex justify-between text-lg font-semibold">
//                   <span>Total Amount</span>
//                   <span className="text-primary">₹{identifyPricing.total}</span>
//                 </div>
//               </div>
//             )}
//           </Card>

//           {/* Payment Methods / Service Picker */}
//           <Card className="p-6">
//             <h2 className="text-xl font-semibold mb-4">
//               {flow === "walkin"
//                 ? "Choose How You Want to Pay"
//                 : "Choose How You Want to Pay"}
//             </h2>

//             {flow === "walkin" && (
//               <div className="mb-6 space-y-3">
//                 {SERVICE_CATALOG.filter((s) => s.selectable).map((svc) => (
//                   <label
//                     key={svc.id}
//                     className="flex items-center justify-between border rounded-md px-4 py-3 cursor-pointer"
//                   >
//                     <div>
//                       <div className="font-medium">{svc?.name}</div>
//                       {svc?.description && (
//                         <div className="text-sm text-muted-foreground">{svc.description}</div>
//                       )}
//                     </div>
//                     <div className="flex items-center gap-4">
//                       <span className="text-sm text-muted-foreground">₹{svc?.price}</span>
//                       <input
//                         type="checkbox"
//                         className="h-5 w-5"
//                         checked={selectedServices.includes(svc.id)}
//                         onChange={() => handleToggleService(svc.id)}
//                       />
//                     </div>
//                   </label>
//                 ))}
//                 <p className="text-xs text-muted-foreground">
//                   Registration fee is automatically applied for walk-ins.
//                 </p>
//                 <Separator className="my-4" />
//               </div>
//             )}

//             {paymentStatus === "processing" ? (
//               <div className="text-center py-8">
//                 <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
//                   <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
//                 </div>
//                 <h3 className="text-lg font-medium mb-2">Processing Payment...</h3>
//                 <p className="text-sm text-muted-foreground">
//                   Please wait while we process your {selectedMethod || "selected"} payment
//                 </p>
//               </div>
//             ) : (
//               <div className="space-y-4">
//                 {paymentMethods.map((method) => {
//                   const IconComponent = method.icon;
//                   return (
//                     <Button
//                       key={method.id}
//                       variant="outline"
//                       className="w-full h-auto p-4 flex items-center gap-4 hover:shadow-card transition-all disabled:opacity-60"
//                       onClick={() => payWithRazorpay(method.id)}
//                       disabled={
//                         loading ||
//                         (flow === "walkin" && selectedServices.length === 0) ||
//                         (flow === "lab" && (!labBill || labBill.total <= 0)) ||
//                         (flow === "pharmacy" && (!pharmacyBill || pharmacyBill.total <= 0))
//                       }
//                     >
//                       <div className="bg-primary/10 rounded-full p-2">
//                         <IconComponent className="h-6 w-6 text-primary" />
//                       </div>
//                       <div className="flex-1 text-left">
//                         <h3 className="font-medium">{method.name}</h3>
//                         <p className="text-sm text-muted-foreground">{method.description}</p>
//                       </div>
//                     </Button>
//                   );
//                 })}

//                 {/* Pay at Reception (Cash) */}
//                 <Button
//                   variant="outline"
//                   className="w-full h-auto p-4 flex items-start gap-4 hover:shadow-card transition-all disabled:opacity-60 whitespace-normal text-left"
//                   onClick={handleSkip}
//                   disabled={
//                     loading ||
//                     (flow === "walkin" && selectedServices.length === 0) ||
//                     (flow === "lab" && (!labBill || labBill.total <= 0)) ||
//                     (flow === "pharmacy" && (!pharmacyBill || pharmacyBill.total <= 0))
//                   }
//                 >
//                   <div className="bg-primary/10 rounded-full p-2">
//                     <IndianRupee className="h-6 w-6 text-primary" />
//                   </div>
//                   <div className="flex-1 text-left">
//                     <h3 className="text-sm font-medium md:text-base">Pay at Reception (Cash)</h3>
//                     <p className="text-xs md:text-sm text-muted-foreground">
//                       Pay in cash at the front desk and get your token
//                     </p>
//                   </div>
//                 </Button>
//               </div>
//             )}
//           </Card>
//         </div>

//         {/* Skip (mostly Identify / Lab portal already paid at desk) */}
//         <Card className="mt-6 p-4 bg-muted/30 border-0">
//           <div className="flex items-center justify-between">
//             <div>
//               <p className="font-medium">Already paid?</p>
//               <p className="text-sm text-muted-foreground">
//                 Skip payment if you've already settled the bill at the front desk
//               </p>
//             </div>
//             <Button onClick={handleSkip} variant="outline" disabled={loading}>
//               Skip Payment
//             </Button>
//           </div>
//         </Card>
//       </div>
//     </KioskLayout>
//   );
// }







import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Smartphone,
  IndianRupee,
  Check,
  X,
  Clock,
  Receipt,
} from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { SERVICE_CATALOG, calcBill, ServiceId } from "@/lib/pricing";

// ---- Types & globals --------------------------------------------------------
interface PaymentMethod {
  id: "upi" | "card";
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

type KioskFlow = "walkin" | "identify" | "lab" | "pharmacy";

type StoredLabTest = {
  id: string;
  name: string;
  price: number;
};

type StoredLabBooking = {
  orderedTests?: StoredLabTest[];
  additionalTests?: StoredLabTest[];
  total?: number;
  appointmentId?: string;
  patientId?: string;
  bookingId?: string;
};

type StoredPharmacyBill = {
  billNumber: string;
  total: number;
  patientId: string;
  hasDoctorVisit?: boolean;
};

declare global {
  interface Window {
    Razorpay?: any;
  }
}

// ---- Env & constants --------------------------------------------------------
const runtimeOverride =
  (window as any).__API_BASE_URL__ ||
  new URLSearchParams(location.search).get("api") ||
  localStorage.getItem("API_BASE_URL_OVERRIDE") ||
  "";

const API_BASE = (
  runtimeOverride ||
  (import.meta as any)?.env?.VITE_API_BASE_URL ||
  ""
).replace(/\/+$/, "");
const RZP_JS =
  import.meta.env.VITE_RAZORPAY_CHECKOUT_URL ||
  "https://checkout.razorpay.com/v1/checkout.js";
const MICRO_TEST = import.meta.env.VITE_RZP_MICRO_TEST === "true";

// Small helper to safely load checkout.js once
async function loadRazorpay(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () =>
      reject(new Error("Failed to load Razorpay checkout.js"));
    document.body.appendChild(s);
  });
}

// Attach payment details into the appointment row's `kiosk` field (no-op if we don't have an appointment)
async function attachPaymentToAppointment({
  method,
  amount,
  orderId,
  paymentId,
}: {
  method: "upi" | "card" | string;
  amount: number; // rupees
  orderId: string;
  paymentId: string;
}) {
  const patientId = sessionStorage.getItem("kioskPatientId") || "";
  const appointmentId =
    sessionStorage.getItem("kioskSelectedAppointmentId") || "";

  if (!patientId || !appointmentId) return;

  await fetch(`${API_BASE}/api/kiosk/appointments/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      patientId,
      appointmentId,
      kiosk: {
        payment: {
          provider: "razorpay",
          status: "success",
          method,
          amount, // ₹ (display amount)
          orderId,
          paymentId,
          verified: true,
          verifiedAt: new Date().toISOString(),
        },
      },
    }),
  }).catch(() => {
    // Intentionally swallow errors — payment is already verified; we don't block UX on telemetry write
  });
}

// ---- Component --------------------------------------------------------------
export default function PaymentPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const flow = (sessionStorage.getItem("kioskFlow") ||
    "identify") as KioskFlow;

  const [selectedMethod, setSelectedMethod] = useState<
    PaymentMethod["id"] | ""
  >("");
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<
    "pending" | "processing" | "success" | "failed"
  >("pending");
  const [transactionId, setTransactionId] = useState<string>("");

  // guard against double-opens
  const openingRef = useRef(false);

  // ---------- Service picker (WALK-IN only) ----------
  const [selectedServices, setSelectedServices] = useState<ServiceId[]>(() => {
    const prev = sessionStorage.getItem("walkinSelectedServices");
    if (!prev) return ["consultation"];
    try {
      const arr = JSON.parse(prev) as ServiceId[];
      return Array.isArray(arr) && arr.length ? arr : ["consultation"];
    } catch {
      return ["consultation"];
    }
  });

  const bill = useMemo(() => {
    const includeRegistration = flow === "walkin";
    return calcBill(selectedServices, includeRegistration);
  }, [selectedServices, flow]);

  useEffect(() => {
    if (flow === "walkin") {
      sessionStorage.setItem(
        "walkinSelectedServices",
        JSON.stringify(selectedServices)
      );
      sessionStorage.setItem("walkinBill", JSON.stringify(bill));
    }
  }, [selectedServices, bill, flow]);

  // ---------- Lab booking (LAB flow) ----------
  const labBooking: StoredLabBooking | null = useMemo(() => {
    if (flow !== "lab") return null;
    const raw = localStorage.getItem("medmitra-lab-booking");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredLabBooking;
      return parsed || null;
    } catch {
      return null;
    }
  }, [flow]);

  const labBill = useMemo(() => {
    if (flow !== "lab" || !labBooking) return null;
    const ordered = labBooking.orderedTests ?? [];
    const additional = labBooking.additionalTests ?? [];
    const orderedTotal = ordered.reduce(
      (sum, t) => sum + (t.price || 0),
      0
    );
    const additionalTotal = additional.reduce(
      (sum, t) => sum + (t.price || 0),
      0
    );
    const totalFromTests = orderedTotal + additionalTotal;
    const total =
      typeof labBooking.total === "number" && labBooking.total > 0
        ? labBooking.total
        : totalFromTests;
    return {
      ordered,
      additional,
      orderedTotal,
      additionalTotal,
      total,
    };
  }, [flow, labBooking]);

  // ---------- Pharmacy bill (PHARMACY flow) ----------
  const pharmacyBill: StoredPharmacyBill | null = useMemo(() => {
    if (flow !== "pharmacy") return null;
    const raw = localStorage.getItem("medmitra-pharmacy-bill");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredPharmacyBill;
      if (!parsed || typeof parsed.total !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }, [flow]);

  // We keep only ONE online option for Razorpay (all methods available).
  const paymentMethods: PaymentMethod[] = [
    {
      id: "upi", // used only to trigger the same checkout; we are NOT forcing UPI
      name: t("payment.methodOnlineName", "Pay Online (Razorpay)"),
      icon: Smartphone,
      description: t(
        "payment.methodOnlineDesc",
        "UPI, Card, Netbanking & Wallets"
      ),
    },
  ];

  const handleToggleService = (id: ServiceId) => {
    setSelectedServices((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id]
    );
  };

  // Pick/derive an invoice id for this flow
  const getInvoiceId = () => {
    return (
      sessionStorage.getItem("kioskVisitId") ||
      sessionStorage.getItem("kioskSelectedAppointmentId") ||
      `WALKIN-${Date.now()}`
    );
  };

  // ---------- Identify-flow amount & breakdown ----------
  const identifyPricing = useMemo(() => {
    // Default total if we cannot infer anything from the appointment
    let total = 605;

    try {
      const raw = sessionStorage.getItem(
        "kioskSelectedAppointmentRaw"
      );
      if (raw) {
        const appt = JSON.parse(raw);

        // Prefer canonical amount from appointment.payment.amount if present
        const paymentAmount = appt?.payment?.amount;
        if (
          typeof paymentAmount === "number" &&
          paymentAmount > 0
        ) {
          total = paymentAmount;
        } else {
          // Fallback: fee fields ("₹500", "500", etc.)
          const feeStr =
            (appt?.fee as string | undefined) ||
            (appt?.appointment_details?.fee as string | undefined);
          if (feeStr) {
            const m = String(feeStr).match(/[\d.]+/);
            if (m) {
              const feeNum = Number(m[0]);
              if (!Number.isNaN(feeNum) && feeNum > 0) {
                const reg = 1;
                const basePlusReg = feeNum + reg;
                const gst = Math.round(basePlusReg * 0.1);
                total = basePlusReg + gst;
              }
            }
          }
        }
      }
    } catch {
      // ignore parse errors, keep default 605
    }

    // Breakdown: consultation + registration + GST (10% of both)
    const registrationFee = 1;
    const basePlusReg = Math.round(total / 1.1); // approximate pre-tax amount
    const consultationFee = Math.max(0, basePlusReg - registrationFee);
    const gst = Math.max(
      0,
      total - consultationFee - registrationFee
    );

    return {
      total,
      consultationFee,
      registrationFee,
      gst,
    };
  }, []);

  // Amount (in rupees) rendered on UI; convert to paise for Razorpay Order
  const uiAmount = useMemo(() => {
    const real =
      flow === "walkin"
        ? bill.total
        : flow === "lab"
        ? labBill?.total ?? 0
        : flow === "pharmacy"
        ? pharmacyBill?.total ?? 0
        : identifyPricing.total;
    return MICRO_TEST ? 1 : real; // force ₹1 when micro-test is ON
  }, [
    flow,
    bill.total,
    identifyPricing.total,
    labBill?.total,
    pharmacyBill?.total,
  ]);

  const payWithRazorpay = async (method: PaymentMethod["id"]) => {
    if (openingRef.current) return; // prevent double invokes
    openingRef.current = true;

    setSelectedMethod(method);
    setPaymentStatus("processing");
    setLoading(true);

    try {
      const patientId =
        sessionStorage.getItem("kioskPatientId") ||
        pharmacyBill?.patientId ||
        "";

      const appointmentId =
        flow === "pharmacy"
          ? ""
          : sessionStorage.getItem(
              "kioskSelectedAppointmentId"
            ) ||
            labBooking?.appointmentId ||
            "";

      if (!patientId) {
        throw new Error(
          t(
            "common.sessionExpiredDesc",
            "Session expired. Please verify your phone again."
          )
        );
      }
      if (flow !== "pharmacy" && !appointmentId) {
        throw new Error(
          t(
            "payment.missingAppointmentContext",
            "Missing appointment context. Please book a slot again."
          )
        );
      }

      const amountPaise = Math.round(uiAmount * 100);
      if (amountPaise <= 0)
        throw new Error(
          t("payment.invalidAmount", "Invalid amount")
        );

      const invoiceId =
        flow === "pharmacy"
          ? pharmacyBill?.billNumber ||
            `PHARM-${Date.now()}`
          : getInvoiceId();

      await loadRazorpay(RZP_JS);
      if (!window.Razorpay)
        throw new Error(
          t(
            "payment.sdkNotAvailable",
            "Razorpay SDK not available"
          )
        );

      const orderUrl =
        flow === "pharmacy"
          ? `${API_BASE}/api/billing/razorpay/pharmacy/order`
          : `${API_BASE}/api/billing/razorpay/order`;

      const createRes = await fetch(orderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(flow === "pharmacy"
            ? {}
            : { "X-Patient-Id": patientId }),
        },
        credentials: "include",
        body: JSON.stringify(
          flow === "pharmacy"
            ? {
                patientId,
                invoice_id: invoiceId,
                amount: amountPaise,
                currency: "INR",
                notes: { flow, patientId },
                customer: {
                  name: "",
                  email: "",
                  contact:
                    sessionStorage.getItem("kioskPhone") || "",
                },
              }
            : {
                patientId,
                appointmentId,
                invoice_id: invoiceId,
                amount: amountPaise,
                currency: "INR",
                notes: { flow, patientId, appointmentId },
                customer: {
                  name: "",
                  email: "",
                  contact:
                    sessionStorage.getItem("kioskPhone") || "",
                },
              }
        ),
      });

      if (!createRes.ok) {
        const txt = await createRes.text().catch(() => "");
        throw new Error(
          `Order create failed (${createRes.status}): ${
            txt || "unknown"
          }`
        );
      }
      const { key_id, order_id, currency } =
        await createRes.json();

      const rzp = new window.Razorpay({
        key: key_id,
        order_id,
        amount: amountPaise,
        currency: currency || "INR",
        name: "MedMitra AI",
        description:
          flow === "walkin"
            ? "Walk-in visit payment"
            : flow === "lab"
            ? "Lab tests payment"
            : flow === "pharmacy"
            ? "Pharmacy payment"
            : "Consultation payment",
        prefill: {
          contact: sessionStorage.getItem("kioskPhone") || "",
        },
        notes: { invoice_id: invoiceId },

        handler: async (resp: any) => {
          try {
            const verifyUrl =
              flow === "pharmacy"
                ? `${API_BASE}/api/billing/razorpay/pharmacy/verify`
                : `${API_BASE}/api/billing/razorpay/verify`;

            const verifyRes = await fetch(verifyUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(flow === "pharmacy"
                  ? {}
                  : { "X-Patient-Id": patientId }),
              },
              credentials: "include",
              body: JSON.stringify(
                flow === "pharmacy"
                  ? {
                      patientId,
                      invoice_id: invoiceId,
                      razorpay_payment_id:
                        resp.razorpay_payment_id,
                      razorpay_order_id:
                        resp.razorpay_order_id,
                      razorpay_signature:
                        resp.razorpay_signature,
                    }
                  : {
                      patientId,
                      appointmentId,
                      invoice_id: invoiceId,
                      razorpay_payment_id:
                        resp.razorpay_payment_id,
                      razorpay_order_id:
                        resp.razorpay_order_id,
                      razorpay_signature:
                        resp.razorpay_signature,
                    }
              ),
            });

            if (!verifyRes.ok)
              throw new Error(
                t(
                  "payment.verificationFailed",
                  "Signature verification failed"
                )
              );

            setPaymentStatus("success");
            setTransactionId(
              resp.razorpay_payment_id || ""
            );

            sessionStorage.setItem(
              "lastPayment",
              JSON.stringify({
                flow,
                method,
                amount: uiAmount,
                transactionId:
                  resp.razorpay_payment_id || "",
                at: new Date().toISOString(),
                bill,
                labBill,
                pharmacyBill,
              })
            );

            // For pharmacy we don't attach to appointment
            if (flow !== "pharmacy") {
              await attachPaymentToAppointment({
                method,
                amount: uiAmount,
                orderId: resp.razorpay_order_id,
                paymentId: resp.razorpay_payment_id,
              });
            }

            setTimeout(() => navigate("/token"), 1200);
          } catch (e: any) {
            setPaymentStatus("failed");
            toast({
              variant: "destructive",
              title: t(
                "payment.failedTitle",
                "Payment Failed"
              ),
              description:
                e?.message ||
                t(
                  "payment.failedSubtitle",
                  "We couldn't process your payment. Please try again or contact our front desk for assistance."
                ),
            });
          } finally {
            setLoading(false);
            openingRef.current = false;
          }
        },

        modal: {
          ondismiss: () => {
            setPaymentStatus("pending");
            setSelectedMethod("");
            setLoading(false);
            openingRef.current = false;
          },
        },

        theme: { color: "#1E293B" },
      });

      rzp.on("payment.failed", (resp: any) => {
        setPaymentStatus("failed");
        setSelectedMethod("");
        setLoading(false);
        openingRef.current = false;
        toast({
          variant: "destructive",
          title: t("payment.failedTitle", "Payment Failed"),
          description:
            resp?.error?.description ||
            t(
              "payment.failedSubtitle",
              "We couldn't process your payment. Please try again or contact our front desk for assistance."
            ),
        });
      });

      rzp.open();
    } catch (err: any) {
      console.error(err);
      setPaymentStatus("failed");
      toast({
        variant: "destructive",
        title: t(
          "payment.errors.paymentErrorTitle",
          "Payment Error"
        ),
        description:
          err?.message ||
          t(
            "payment.errors.paymentErrorDesc",
            "Could not start payment"
          ),
      });
      setLoading(false);
      openingRef.current = false;
    }
  };

  const handleRetry = () => {
    setPaymentStatus("pending");
    setSelectedMethod("");
    setTransactionId("");
  };

  // NEW: record pay-later cash in DB and DO NOT issue token on kiosk
  const handleSkip = async () => {
    try {
      setLoading(true);
      const patientId =
        sessionStorage.getItem("kioskPatientId") ||
        pharmacyBill?.patientId ||
        "";
      const appointmentId =
        flow === "pharmacy"
          ? ""
          : sessionStorage.getItem(
              "kioskSelectedAppointmentId"
            ) ||
            labBooking?.appointmentId ||
            "";

      if (patientId && appointmentId && flow !== "pharmacy") {
        await fetch(
          `${API_BASE}/api/kiosk/appointments/attach`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              patientId,
              appointmentId,
              kiosk: {
                payment: {
                  mode: "pay_later",
                  status: "unpaid",
                  channel: "front-desk",
                  amount: uiAmount,
                  notedAt: new Date().toISOString(),
                },
              },
            }),
          }
        ).catch(() => {});
      }
    } finally {
      setLoading(false);
      // No token generation here; front desk will handle cash & token
      navigate("/cash-pending");
    }
  };

  const handlePrintReceipt = async () => {
    if (transactionId) {
      toast({
        title: t(
          "payment.receiptPrintingTitle",
          "Receipt Printing"
        ),
        description: t(
          "payment.receiptPrintingDesc",
          "Your receipt will be printed at the front desk."
        ),
      });
    }
  };

  // ---------- Success / Failed UIs ----------
  if (paymentStatus === "success") {
    return (
      <KioskLayout
        title={t("payment.successTitle", "Payment Successful")}
        showBack={false}
      >
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <div className="bg-success/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <Check className="h-12 w-12 text-success" />
            </div>
            <h1 className="text-3xl font-bold text-success mb-4">
              {t("payment.successTitle", "Payment Successful!")}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t(
                "payment.successSubtitle",
                "Your payment has been processed successfully"
              )}
            </p>
          </div>

          <Card className="p-6 mb-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t("payment.amountPaid", "Amount Paid")}
                </span>
                <span className="text-2xl font-bold text-foreground">
                  ₹{uiAmount}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t(
                    "payment.transactionId",
                    "Transaction ID"
                  )}
                </span>
                <Badge
                  variant="outline"
                  className="font-mono"
                >
                  {transactionId}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t(
                    "payment.paymentMethod",
                    "Payment Method"
                  )}
                </span>
                <span className="capitalize">
                  {selectedMethod}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {t(
                    "payment.dateTime",
                    "Date & Time"
                  )}
                </span>
                <span>{new Date().toLocaleString()}</span>
              </div>
            </div>
          </Card>

          <div className="flex gap-4">
            <Button
              onClick={handlePrintReceipt}
              variant="outline"
              size="lg"
              className="flex-1 text-lg py-4 h-auto"
            >
              <Receipt className="h-5 w-5 mr-2" />{" "}
              {t("payment.printReceipt", "Print Receipt")}
            </Button>
            <Button
              onClick={() => navigate("/token")}
              size="lg"
              className="flex-1 text-lg py-4 h-auto"
            >
              {t("payment.continue", "Continue")}
            </Button>
          </div>

          <Card className="mt-6 p-4 bg-muted/30 border-0">
            <p className="text-sm text-muted-foreground">
              {t(
                "payment.autoTokenHint",
                "Proceeding to token generation in ~1–2 seconds..."
              )}{" "}
              <Clock className="inline h-4 w-4" />
            </p>
          </Card>
        </div>
      </KioskLayout>
    );
  }

  if (paymentStatus === "failed") {
    return (
      <KioskLayout
        title={t("payment.failedTitle", "Payment Failed")}
      >
        <div className="max-w-2xl mx-auto text-center">
          <div className="mb-8">
            <div className="bg-destructive/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
              <X className="h-12 w-12 text-destructive" />
            </div>
            <h1 className="text-3xl font-bold text-destructive mb-4">
              {t("payment.failedTitle", "Payment Failed")}
            </h1>
            <p className="text-lg text-muted-foreground mb-6">
              {t(
                "payment.failedSubtitle",
                "We couldn't process your payment. Please try again or contact our front desk for assistance."
              )}
            </p>
            <div className="flex gap-4">
              <Button
                onClick={handleRetry}
                size="lg"
                className="flex-1 text-xl py-6 h-auto"
              >
                {t("payment.tryAgain", "Try Again")}
              </Button>
              <Button
                onClick={() => navigate("/help")}
                variant="outline"
                size="lg"
                className="flex-1 text-lg py-4 h-auto"
              >
                {t("payment.getHelp", "Get Help")}
              </Button>
            </div>
          </div>
        </div>
      </KioskLayout>
    );
  }

  // ---------- Main Payment page ----------
  return (
    <KioskLayout title={t("payment.title", "Payment")}>
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <IndianRupee className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary mb-4">
            {t("payment.title", "Payment Summary")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {flow === "walkin"
              ? t(
                  "payment.subtitleWalkin",
                  "Please select your services and complete the payment"
                )
              : flow === "lab"
              ? t(
                  "payment.subtitleLab",
                  "Please review your lab charges and complete the payment"
                )
              : flow === "pharmacy"
              ? t(
                  "payment.subtitlePharmacy",
                  "Please review your pharmacy charges and complete the payment"
                )
              : t(
                  "payment.subtitleIdentify",
                  "Please review your charges and complete the payment"
                )}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bill Summary */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">
              {t("payment.billDetails", "Bill Details")}
            </h2>

            {flow === "walkin" ? (
              <>
                <div className="space-y-2 mb-3">
                  {selectedServices.map((sid) => {
                    const svc = SERVICE_CATALOG.find(
                      (s) => s.id === sid
                    );
                    return (
                      <div
                        key={sid}
                        className="flex justify-between"
                      >
                        <span className="text-muted-foreground">
                          {svc?.name}
                        </span>
                        <span>₹{svc?.price}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t(
                      "payment.registrationFee",
                      "Registration Fee"
                    )}
                  </span>
                  <span>₹{bill.registrationFee}</span>
                </div>

                <Separator className="my-3" />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("payment.subtotal", "Subtotal")}
                  </span>
                  <span>₹{bill.subtotal}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("payment.gst", "GST (10%)")}
                  </span>
                  <span>₹{bill.tax}</span>
                </div>
                <Separator className="my-3" />
                <div className="flex justify-between text-lg font-semibold">
                  <span>
                    {t("payment.totalAmount", "Total Amount")}
                  </span>
                  <span className="text-primary">
                    ₹{bill.total}
                  </span>
                </div>
              </>
            ) : flow === "lab" ? (
              <div className="space-y-3">
                {labBill && (
                  <>
                    {labBill.ordered.length > 0 && (
                      <>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          {t(
                            "payment.labDoctorOrdered",
                            "Doctor-Ordered Tests"
                          )}
                        </p>
                        <div className="space-y-1 mb-2">
                          {labBill.ordered.map((tst) => (
                            <div
                              key={tst.id}
                              className="flex justify-between text-sm"
                            >
                              <span className="text-muted-foreground">
                                {tst.name}
                              </span>
                              <span>₹{tst.price}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between mb-3">
                          <span className="text-xs text-muted-foreground">
                            {t(
                              "payment.labSubtotalOrdered",
                              "Subtotal (Ordered)"
                            )}
                          </span>
                          <span className="text-xs">
                            ₹{labBill.orderedTotal}
                          </span>
                        </div>
                        <Separator className="my-2" />
                      </>
                    )}

                    {labBill.additional.length > 0 && (
                      <>
                        <p className="text-sm font-medium text-muted-foreground mb-1">
                          {t(
                            "payment.labAdditionalTests",
                            "Additional Tests"
                          )}
                        </p>
                        <div className="space-y-1 mb-2">
                          {labBill.additional.map((tst) => (
                            <div
                              key={tst.id}
                              className="flex justify-between text-sm"
                            >
                              <span className="text-muted-foreground">
                                {tst.name}
                              </span>
                              <span>₹{tst.price}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between mb-3">
                          <span className="text-xs text-muted-foreground">
                            {t(
                              "payment.labSubtotalAdditional",
                              "Subtotal (Additional)"
                            )}
                          </span>
                          <span className="text-xs">
                            ₹{labBill.additionalTotal}
                          </span>
                        </div>
                        <Separator className="my-2" />
                      </>
                    )}

                    <div className="flex justify-between text-lg font-semibold">
                      <span>
                        {t(
                          "payment.totalAmount",
                          "Total Amount"
                        )}
                      </span>
                      <span className="text-primary">
                        ₹{labBill.total}
                      </span>
                    </div>
                  </>
                )}

                {!labBill && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "payment.noLabBill",
                      "No lab booking details found. Please go back and select your tests again."
                    )}
                  </p>
                )}
              </div>
            ) : flow === "pharmacy" ? (
              <div className="space-y-3">
                {pharmacyBill ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t(
                          "payment.pharmacyBillNumber",
                          "Bill Number"
                        )}
                      </span>
                      <span className="font-mono">
                        {pharmacyBill.billNumber}
                      </span>
                    </div>
                    <Separator className="my-3" />
                    <div className="flex justify-between text-lg font-semibold">
                      <span>
                        {t(
                          "payment.totalAmount",
                          "Total Amount"
                        )}
                      </span>
                      <span className="text-primary">
                        ₹{pharmacyBill.total}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "payment.noPharmacyBill",
                      "No pharmacy bill found. Please go back and fetch the bill again."
                    )}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t(
                      "payment.consultationFee",
                      "Consultation Fee"
                    )}
                  </span>
                  <span>
                    ₹{identifyPricing.consultationFee}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t(
                      "payment.registrationFee",
                      "Registration Fee"
                    )}
                  </span>
                  <span>
                    ₹{identifyPricing.registrationFee}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t("payment.gst", "GST (10%)")}
                  </span>
                  <span>₹{identifyPricing.gst}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-semibold">
                  <span>
                    {t(
                      "payment.totalAmount",
                      "Total Amount"
                    )}
                  </span>
                  <span className="text-primary">
                    ₹{identifyPricing.total}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Payment Methods / Service Picker */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">
              {t(
                "payment.chooseHowToPay",
                "Choose How You Want to Pay"
              )}
            </h2>

            {flow === "walkin" && (
              <div className="mb-6 space-y-3">
                {SERVICE_CATALOG.filter((s) => s.selectable).map(
                  (svc) => (
                    <label
                      key={svc.id}
                      className="flex items-center justify-between border rounded-md px-4 py-3 cursor-pointer"
                    >
                      <div>
                        <div className="font-medium">
                          {svc?.name}
                        </div>
                        {svc?.description && (
                          <div className="text-sm text-muted-foreground">
                            {svc.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
                          ₹{svc?.price}
                        </span>
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={selectedServices.includes(
                            svc.id
                          )}
                          onChange={() =>
                            handleToggleService(svc.id)
                          }
                        />
                      </div>
                    </label>
                  )
                )}
                <p className="text-xs text-muted-foreground">
                  {t(
                    "payment.walkinServicesNote",
                    "Registration fee is automatically applied for walk-ins."
                  )}
                </p>
                <Separator className="my-4" />
              </div>
            )}

            {paymentStatus === "processing" ? (
              <div className="text-center py-8">
                <div className="bg-primary/10 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
                <h3 className="text-lg font-medium mb-2">
                  {t(
                    "payment.processingTitle",
                    "Processing Payment..."
                  )}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    "payment.processingSubtitle",
                    "Please wait while we process your payment"
                  )}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {paymentMethods.map((method) => {
                  const IconComponent = method.icon;
                  return (
                    <Button
                      key={method.id}
                      variant="outline"
                      className="w-full h-auto p-4 flex items-center gap-4 hover:shadow-card transition-all disabled:opacity-60"
                      onClick={() =>
                        payWithRazorpay(method.id)
                      }
                      disabled={
                        loading ||
                        (flow === "walkin" &&
                          selectedServices.length === 0) ||
                        (flow === "lab" &&
                          (!labBill ||
                            labBill.total <= 0)) ||
                        (flow === "pharmacy" &&
                          (!pharmacyBill ||
                            pharmacyBill.total <= 0))
                      }
                    >
                      <div className="bg-primary/10 rounded-full p-2">
                        <IconComponent className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-medium">
                          {method.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {method.description}
                        </p>
                      </div>
                    </Button>
                  );
                })}

                {/* Pay at Reception (Cash) */}
                <Button
                  variant="outline"
                  className="w-full h-auto p-4 flex items-start gap-4 hover:shadow-card transition-all disabled:opacity-60 whitespace-normal text-left"
                  onClick={handleSkip}
                  disabled={
                    loading ||
                    (flow === "walkin" &&
                      selectedServices.length === 0) ||
                    (flow === "lab" &&
                      (!labBill ||
                        labBill.total <= 0)) ||
                    (flow === "pharmacy" &&
                      (!pharmacyBill ||
                        pharmacyBill.total <= 0))
                  }
                >
                  <div className="bg-primary/10 rounded-full p-2">
                    <IndianRupee className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="text-sm font-medium md:text-base">
                      {t(
                        "payment.payAtReceptionTitle",
                        "Pay at Reception (Cash)"
                      )}
                    </h3>
                    <p className="text-xs md:text-sm text-muted-foreground">
                      {t(
                        "payment.payAtReceptionDesc",
                        "Pay in cash at the front desk and get your token"
                      )}
                    </p>
                  </div>
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Skip (mostly Identify / Lab portal already paid at desk) */}
        <Card className="mt-6 p-4 bg-muted/30 border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {t("payment.alreadyPaidTitle", "Already paid?")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  "payment.alreadyPaidDesc",
                  "Skip payment if you've already settled the bill at the front desk"
                )}
              </p>
            </div>
            <Button
              onClick={handleSkip}
              variant="outline"
              disabled={loading}
            >
              {t("payment.skipPaymentButton", "Skip Payment")}
            </Button>
          </div>
        </Card>
      </div>
    </KioskLayout>
  );
}
