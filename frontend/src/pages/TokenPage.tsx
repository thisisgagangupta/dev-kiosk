import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Printer, QrCode, Clock, CheckCircle, Eye } from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/+$/, "");

type IssueResp = {
  tokenNo: string; lane: string; position: number;
  etaLow: number; etaHigh: number; confidence: number;
  appointmentId: string; patientId: string; status: string;
};

type StatusResp = {
  tokenNo: string; position: number;
  etaLow: number; etaHigh: number; confidence: number;
  status: string;
};

export default function TokenPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<IssueResp | null>(null);
  const [showQR, setShowQR] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const patientId = sessionStorage.getItem("kioskPatientId") || "";
    const appointmentId = sessionStorage.getItem("kioskSelectedAppointmentId") || "";
    if (!patientId || !appointmentId) { navigate("/identify"); return; }

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/kiosk/checkin/issue`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ patientId, appointmentId })
        });
        const data: IssueResp = await res.json();
        if (!res.ok) throw new Error((data as any).detail || `Issue failed (${res.status})`);
        setToken(data);
        localStorage.setItem("medmitra-token", JSON.stringify({
          id: data.tokenNo, number: data.tokenNo, queuePosition: data.position,
          estimatedTime: `${data.etaLow}-${data.etaHigh} min`, confidence: data.confidence
        }));
        toast({ title: "Token Issued", description: `Your token: ${data.tokenNo}` });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Check-in failed", description: e?.message || "Try again" });
        navigate("/error");
      } finally {
        setLoading(false);
      }
    })();

    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [navigate, toast]);

  // Poll live status
  useEffect(() => {
    async function poll() {
      if (!token) return;
      try {
        const r = await fetch(`${API_BASE}/api/queue/status?tokenNo=${encodeURIComponent(token.tokenNo)}`, { cache: "no-store" });
        const s: StatusResp = await r.json();
        if (r.ok) {
          setToken(prev => prev ? { ...prev, position: s.position, etaLow: s.etaLow, etaHigh: s.etaHigh, confidence: s.confidence, status: s.status } : prev);
        }
      } catch { /* ignore transient */ }
    }
    if (token && !pollRef.current) {
      pollRef.current = window.setInterval(poll, 15000);
    }
  }, [token]);

  const handlePrint = () => {
    // integrate your real print service; keeping a simple alert for now
    window.print();
  };

  if (loading || !token) {
    return (
      <KioskLayout title="Token Issued" showBack={false}>
        <div className="max-w-2xl mx-auto text-center py-16 text-muted-foreground">
          <Clock className="h-8 w-8 mx-auto mb-3 animate-pulse" />
          Generating your token…
        </div>
      </KioskLayout>
    );
  }

  const nextSteps = [
    "Find a comfortable seat in the waiting area",
    "Keep your token number visible and ready",
    "Listen for your token number announcement",
    "Proceed to the designated room when called",
  ];

  return (
    <KioskLayout title="Token Issued" showBack={false}>
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="bg-success/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="h-12 w-12 text-success" />
          </div>
          <h1 className="text-3xl font-bold mb-1">Token Issued Successfully!</h1>
          <p className="text-muted-foreground">Your check-in is complete. Please wait for your turn.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="p-8 text-center shadow-kiosk">
            <div className="mb-6">
              <h2 className="text-sm text-muted-foreground mb-2">Your Token Number</h2>
              <div className="text-6xl font-bold text-primary mb-2">{token.tokenNo}</div>
              <Badge variant="outline" className="text-lg px-4 py-2">Queue Position: {token.position === 0 ? "Next!" : token.position}</Badge>
            </div>
            <div className="space-y-4">
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Clock className="h-5 w-5 text-primary" />
                  <span className="font-medium">Estimated Wait Time</span>
                </div>
                <div className="text-2xl font-bold">{token.etaLow}-{token.etaHigh} min</div>
                <div className="mt-3">
                  <div className="flex justify-between text-sm mb-1">
                    <span>Estimate Confidence</span><span>{token.confidence}%</span>
                  </div>
                  <Progress value={token.confidence} className="h-2" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Wait times update as the queue moves.</p>
            </div>
          </Card>

          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Token Actions</h3>
              <div className="space-y-3">
                <Button variant="outline" size="lg" className="w-full justify-start" onClick={handlePrint}>
                  <Printer className="h-5 w-5 mr-3" /> Print Token
                </Button>
                <Button variant="outline" size="lg" className="w-full justify-start" onClick={() => setShowQR(true)}>
                  <QrCode className="h-5 w-5 mr-3" /> Show QR for Staff
                </Button>
                <Button size="lg" className="w-full justify-start" onClick={() => navigate("/queue")}>
                  <Eye className="h-5 w-5 mr-3" /> View Live Queue Status
                </Button>
              </div>
            </Card>
            {showQR && (
              <Card className="p-6">
                <h4 className="font-medium text-center mb-3">Staff Scan QR</h4>
                <div className="bg-muted/30 aspect-square rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <QrCode className="h-24 w-24 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Token: {token.tokenNo}</p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>

        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">What to Expect Next</h3>
          <div className="space-y-2">{nextSteps.map((s,i)=>(
            <div key={i} className="flex items-start gap-3">
              <div className="bg-primary/10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-primary mt-0.5">{i+1}</div>
              <p className="text-sm text-muted-foreground">{s}</p>
            </div>
          ))}</div>
        </Card>
      </div>
    </KioskLayout>
  );
}







// import { useEffect, useRef, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { Button } from "@/components/ui/button";
// import { Card } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Progress } from "@/components/ui/progress";
// import { Printer, QrCode, Clock, CheckCircle, Eye } from "lucide-react";
// import KioskLayout from "@/components/KioskLayout";
// import { useTranslation, getStoredLanguage } from "@/lib/i18n";
// import { useToast } from "@/hooks/use-toast";

// const API_BASE = (
//   (import.meta.env.VITE_API_BASE_URL as string) || ""
// ).replace(/\/+$/, "");

// type IssueResp = {
//   tokenNo: string;
//   lane: string;
//   position: number;
//   etaLow: number;
//   etaHigh: number;
//   confidence: number;
//   appointmentId: string;
//   patientId: string;
//   status: string;
// };

// type StatusResp = {
//   tokenNo: string;
//   position: number;
//   etaLow: number;
//   etaHigh: number;
//   confidence: number;
//   status: string;
// };

// export default function TokenPage() {
//   const navigate = useNavigate();
//   const { t } = useTranslation(getStoredLanguage());
//   const { toast } = useToast();

//   const [loading, setLoading] = useState(true);
//   const [token, setToken] = useState<IssueResp | null>(null);
//   const [showQR, setShowQR] = useState(false);
//   const pollRef = useRef<number | null>(null);

//   useEffect(() => {
//     const patientId = sessionStorage.getItem("kioskPatientId") || "";
//     const appointmentId =
//       sessionStorage.getItem("kioskSelectedAppointmentId") || "";
//     if (!patientId || !appointmentId) {
//       navigate("/identify");
//       return;
//     }

//     (async () => {
//       setLoading(true);
//       try {
//         const res = await fetch(`${API_BASE}/api/kiosk/checkin/issue`, {
//           method: "POST",
//           headers: { "Content-Type": "application/json" },
//           credentials: "include",
//           body: JSON.stringify({ patientId, appointmentId }),
//         });
//         const data: IssueResp = await res.json();
//         if (!res.ok)
//           throw new Error(
//             (data as any).detail || `Issue failed (${res.status})`
//           );
//         setToken(data);
//         localStorage.setItem(
//           "medmitra-token",
//           JSON.stringify({
//             id: data.tokenNo,
//             number: data.tokenNo,
//             queuePosition: data.position,
//             estimatedTime: `${data.etaLow}-${data.etaHigh} min`,
//             confidence: data.confidence,
//           })
//         );
//         toast({
//           title: t("token.issuedToastTitle", "Token Issued"),
//           description: t(
//             "token.issuedToastDesc",
//             "Your token:"
//           ) + ` ${data.tokenNo}`,
//         });
//       } catch (e: any) {
//         toast({
//           variant: "destructive",
//           title: t("token.checkinFailedTitle", "Check-in failed"),
//           description: e?.message || t("token.checkinFailedDesc", "Try again"),
//         });
//         navigate("/error");
//       } finally {
//         setLoading(false);
//       }
//     })();

//     return () => {
//       if (pollRef.current) window.clearInterval(pollRef.current);
//     };
//   }, [navigate, toast, t]);

//   // Poll live status
//   useEffect(() => {
//     async function poll() {
//       if (!token) return;
//       try {
//         const r = await fetch(
//           `${API_BASE}/api/queue/status?tokenNo=${encodeURIComponent(
//             token.tokenNo
//           )}`,
//           { cache: "no-store" }
//         );
//         const s: StatusResp = await r.json();
//         if (r.ok) {
//           setToken((prev) =>
//             prev
//               ? {
//                   ...prev,
//                   position: s.position,
//                   etaLow: s.etaLow,
//                   etaHigh: s.etaHigh,
//                   confidence: s.confidence,
//                   status: s.status,
//                 }
//               : prev
//           );
//         }
//       } catch {
//         // ignore transient
//       }
//     }
//     if (token && !pollRef.current) {
//       pollRef.current = window.setInterval(poll, 15000);
//     }
//   }, [token]);

//   const handlePrint = () => {
//     // integrate your real print service; keeping a simple alert for now
//     window.print();
//   };

//   if (loading || !token) {
//     return (
//       <KioskLayout
//         title={t("token.title", "Token Issued")}
//         showBack={false}
//       >
//         <div className="max-w-2xl mx-auto text-center py-16 text-muted-foreground">
//           <Clock className="h-8 w-8 mx-auto mb-3 animate-pulse" />
//           {t("token.generating", "Generating your token…")}
//         </div>
//       </KioskLayout>
//     );
//   }

//   const nextSteps = [
//     t(
//       "token.nextSteps.0",
//       "Find a comfortable seat in the waiting area"
//     ),
//     t(
//       "token.nextSteps.1",
//       "Keep your token number visible and ready"
//     ),
//     t(
//       "token.nextSteps.2",
//       "Listen for your token number announcement"
//     ),
//     t(
//       "token.nextSteps.3",
//       "Proceed to the designated room when called"
//     ),
//   ];

//   return (
//     <KioskLayout
//       title={t("token.title", "Token Issued")}
//       showBack={false}
//     >
//       <div className="max-w-3xl mx-auto">
//         <div className="text-center mb-8">
//           <div className="bg-success/10 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
//             <CheckCircle className="h-12 w-12 text-success" />
//           </div>
//           <h1 className="text-3xl font-bold mb-1">
//             {t(
//               "token.fullTitle",
//               "Token Issued Successfully!"
//             )}
//           </h1>
//           <p className="text-muted-foreground">
//             {t(
//               "token.subtitle",
//               "Your check-in is complete. Please wait for your turn."
//             )}
//           </p>
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
//           <Card className="p-8 text-center shadow-kiosk">
//             <div className="mb-6">
//               <h2 className="text-sm text-muted-foreground mb-2">
//                 {t(
//                   "token.yourTokenNumber",
//                   "Your Token Number"
//                 )}
//               </h2>
//               <div className="text-6xl font-bold text-primary mb-2">
//                 {token.tokenNo}
//               </div>
//               <Badge
//                 variant="outline"
//                 className="text-lg px-4 py-2"
//               >
//                 {t("token.queuePosition", "Queue Position")}:{" "}
//                 {token.position === 0
//                   ? t("token.nextLabel", "Next!")
//                   : token.position}
//               </Badge>
//             </div>
//             <div className="space-y-4">
//               <div className="bg-muted/30 rounded-lg p-4">
//                 <div className="flex items-center justify-center gap-2 mb-1">
//                   <Clock className="h-5 w-5 text-primary" />
//                   <span className="font-medium">
//                     {t(
//                       "token.estimatedWaitTime",
//                       "Estimated Wait Time"
//                     )}
//                   </span>
//                 </div>
//                 <div className="text-2xl font-bold">
//                   {token.etaLow}-{token.etaHigh} min
//                 </div>
//                 <div className="mt-3">
//                   <div className="flex justify-between text-sm mb-1">
//                     <span>
//                       {t(
//                         "token.estimateConfidence",
//                         "Estimate Confidence"
//                       )}
//                     </span>
//                     <span>{token.confidence}%</span>
//                   </div>
//                   <Progress
//                     value={token.confidence}
//                     className="h-2"
//                   />
//                 </div>
//               </div>
//               <p className="text-xs text-muted-foreground">
//                 {t(
//                   "token.waitTimeNote",
//                   "Wait times update as the queue moves."
//                 )}
//               </p>
//             </div>
//           </Card>

//           <div className="space-y-4">
//             <Card className="p-6">
//               <h3 className="text-lg font-semibold mb-4">
//                 {t("token.tokenActions", "Token Actions")}
//               </h3>
//               <div className="space-y-3">
//                 <Button
//                   variant="outline"
//                   size="lg"
//                   className="w-full justify-start"
//                   onClick={handlePrint}
//                 >
//                   <Printer className="h-5 w-5 mr-3" />{" "}
//                   {t("token.printToken", "Print Token")}
//                 </Button>
//                 <Button
//                   variant="outline"
//                   size="lg"
//                   className="w-full justify-start"
//                   onClick={() => setShowQR(true)}
//                 >
//                   <QrCode className="h-5 w-5 mr-3" />{" "}
//                   {t("token.showQrForStaff", "Show QR for Staff")}
//                 </Button>
//                 <Button
//                   size="lg"
//                   className="w-full justify-start"
//                   onClick={() => navigate("/queue")}
//                 >
//                   <Eye className="h-5 w-5 mr-3" />{" "}
//                   {t(
//                     "token.viewLiveQueueStatus",
//                     "View Live Queue Status"
//                   )}
//                 </Button>
//               </div>
//             </Card>
//             {showQR && (
//               <Card className="p-6">
//                 <h4 className="font-medium text-center mb-3">
//                   {t("token.staffScanQr", "Staff Scan QR")}
//                 </h4>
//                 <div className="bg-muted/30 aspect-square rounded-lg flex items-center justify-center">
//                   <div className="text-center">
//                     <QrCode className="h-24 w-24 text-muted-foreground mx-auto mb-2" />
//                     <p className="text-sm text-muted-foreground">
//                       {t("token.tokenLabel", "Token")}:{" "}
//                       {token.tokenNo}
//                     </p>
//                   </div>
//                 </div>
//               </Card>
//             )}
//           </div>
//         </div>

//         <Card className="p-6">
//           <h3 className="text-lg font-semibold mb-4">
//             {t(
//               "token.whatNextTitle",
//               "What to Expect Next"
//             )}
//           </h3>
//           <div className="space-y-2">
//             {nextSteps.map((s, i) => (
//               <div
//                 key={i}
//                 className="flex items-start gap-3"
//               >
//                 <div className="bg-primary/10 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold text-primary mt-0.5">
//                   {i + 1}
//                 </div>
//                 <p className="text-sm text-muted-foreground">
//                   {s}
//                 </p>
//               </div>
//             ))}
//           </div>
//         </Card>
//       </div>
//     </KioskLayout>
//   );
// }
