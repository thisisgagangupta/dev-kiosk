// import { useEffect, useRef, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import { Button } from "@/components/ui/button";
// import { Card } from "@/components/ui/card";
// import { Badge } from "@/components/ui/badge";
// import { Clock, Users, RefreshCw, Eye } from "lucide-react";
// import KioskLayout from "@/components/KioskLayout";

// const API_BASE = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/+$/, "");

// type StatusResp = { tokenNo: string; position: number; etaLow: number; etaHigh: number; confidence: number; status: string; };
// type WallLane = { lane: string; now: string[]; next: string[]; avg_wait: number; };
// type WallResp = { items: WallLane[] };

// export default function QueuePage() {
//   const navigate = useNavigate();
//   const [tokenNo, setTokenNo] = useState<string | null>(null);
//   const [status, setStatus] = useState<StatusResp | null>(null);
//   const [wall, setWall] = useState<WallResp | null>(null);
//   const [loading, setLoading] = useState(true);
//   const pollRef = useRef<number | null>(null);

//   useEffect(() => {
//     const st = localStorage.getItem("medmitra-token");
//     if (!st) { navigate("/token"); return; }
//     try {
//       const obj = JSON.parse(st);
//       setTokenNo(obj?.number || obj?.id || null);
//     } catch { navigate("/token"); }
//   }, [navigate]);

//   async function fetchAll() {
//     if (!tokenNo) return;
//     setLoading(true);
//     try {
//       const s = await fetch(`${API_BASE}/api/queue/status?tokenNo=${encodeURIComponent(tokenNo)}`).then(r => r.json());
//       setStatus(s);
//       const w = await fetch(`${API_BASE}/api/wallboard/now-next`).then(r => r.json()).catch(()=>null);
//       if (w) setWall(w);
//     } finally { setLoading(false); }
//   }

//   useEffect(() => { fetchAll(); }, [tokenNo]);
//   useEffect(() => {
//     if (!pollRef.current) pollRef.current = window.setInterval(fetchAll, 15000);
//     return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
//   }, [tokenNo]);

//   if (!tokenNo) return null;

//   return (
//     <KioskLayout title="Live Queue Status">
//       <div className="max-w-4xl mx-auto">
//         <div className="text-center mb-8">
//           <Users className="h-16 w-16 text-primary mx-auto mb-4" />
//           <h1 className="text-3xl font-bold text-primary">Live Queue Status</h1>
//           <p className="text-lg text-muted-foreground">Real-time updates for your token</p>
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
//           <Card className="lg:col-span-1 p-6 shadow-kiosk">
//             <div className="text-center">
//               <h2 className="text-lg font-semibold mb-4">Your Position</h2>
//               <div className="text-5xl font-bold text-primary mb-2">{tokenNo}</div>
//               <Badge variant="outline" className="text-base px-3 py-1">Token Number</Badge>

//               <div className="mt-6 space-y-3">
//                 <div className="bg-muted/30 rounded-lg p-4">
//                   <div className="text-sm text-muted-foreground">Queue Position</div>
//                   <div className="text-3xl font-bold">{status?.position === 0 ? "Next!" : status?.position ?? "—"}</div>
//                 </div>
//                 <div className="bg-primary/10 rounded-lg p-4">
//                   <div className="flex items-center justify-center gap-2 mb-1"><Clock className="h-4 w-4 text-primary" /><span className="text-sm font-medium">Estimated Time</span></div>
//                   <div className="text-xl font-bold text-primary">{status ? `${status.etaLow}-${status.etaHigh} min` : "—"}</div>
//                 </div>
//               </div>

//               <div className="mt-4">
//                 <Button onClick={fetchAll} variant="outline" size="sm" className="w-full">
//                   <RefreshCw className="h-4 w-4 mr-2" /> Refresh Status
//                 </Button>
//               </div>
//             </div>
//           </Card>

//           <Card className="lg:col-span-2 p-6">
//             <div className="flex items-center justify-between mb-4">
//               <h2 className="text-lg font-semibold">Now / Next</h2>
//               <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Auto-refreshing</div>
//             </div>
//             <div className="space-y-4">
//               {(wall?.items || []).map(l => (
//                 <div key={l.lane} className="p-4 border rounded-lg">
//                   <div className="text-sm text-muted-foreground mb-2">Lane {l.lane}</div>
//                   <div className="flex items-center gap-2 flex-wrap">
//                     <Badge variant="default">Now: {l.now[0] || "—"}</Badge>
//                     <span className="text-sm text-muted-foreground">Next:</span>
//                     {l.next.slice(0,5).map(n => <Badge key={n} variant="secondary">{n}</Badge>)}
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </Card>
//         </div>

//         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//           <Button onClick={() => navigate('/token')} variant="outline" size="lg" className="text-lg py-4 h-auto">
//             <Eye className="h-5 w-5 mr-2" /> View My Token
//           </Button>
//           <Button onClick={() => navigate('/lab')} variant="outline" size="lg" className="text-lg py-4 h-auto">Lab Services</Button>
//           <Button onClick={() => navigate('/help')} variant="outline" size="lg" className="text-lg py-4 h-auto">Need Help?</Button>
//         </div>
//       </div>
//     </KioskLayout>
//   );
// }





import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, RefreshCw, Eye } from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";

const API_BASE = (
  (import.meta.env.VITE_API_BASE_URL as string) || ""
).replace(/\/+$/, "");

type StatusResp = {
  tokenNo: string;
  position: number;
  etaLow: number;
  etaHigh: number;
  confidence: number;
  status: string;
};
type WallLane = {
  lane: string;
  now: string[];
  next: string[];
  avg_wait: number;
};
type WallResp = { items: WallLane[] };

export default function QueuePage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());

  const [tokenNo, setTokenNo] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [wall, setWall] = useState<WallResp | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const st = localStorage.getItem("medmitra-token");
    if (!st) {
      navigate("/token");
      return;
    }
    try {
      const obj = JSON.parse(st);
      setTokenNo(obj?.number || obj?.id || null);
    } catch {
      navigate("/token");
    }
  }, [navigate]);

  async function fetchAll() {
    if (!tokenNo) return;
    setLoading(true);
    try {
      const s = await fetch(
        `${API_BASE}/api/queue/status?tokenNo=${encodeURIComponent(
          tokenNo
        )}`
      ).then((r) => r.json());
      setStatus(s);
      const w = await fetch(
        `${API_BASE}/api/wallboard/now-next`
      )
        .then((r) => r.json())
        .catch(() => null);
      if (w) setWall(w);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, [tokenNo]);
  useEffect(() => {
    if (!pollRef.current)
      pollRef.current = window.setInterval(fetchAll, 15000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [tokenNo]);

  if (!tokenNo) return null;

  return (
    <KioskLayout
      title={t("queue.title", "Live Queue Status")}
    >
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary">
            {t("queue.title", "Live Queue Status")}
          </h1>
          <p className="text-lg text-muted-foreground">
            {t(
              "queue.subtitle",
              "Real-time updates for your token"
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-1 p-6 shadow-kiosk">
            <div className="text-center">
              <h2 className="text-lg font-semibold mb-4">
                {t("queue.yourPosition", "Your Position")}
              </h2>
              <div className="text-5xl font-bold text-primary mb-2">
                {tokenNo}
              </div>
              <Badge
                variant="outline"
                className="text-base px-3 py-1"
              >
                {t("queue.tokenNumber", "Token Number")}
              </Badge>

              <div className="mt-6 space-y-3">
                <div className="bg-muted/30 rounded-lg p-4">
                  <div className="text-sm text-muted-foreground">
                    {t(
                      "queue.queuePositionLabel",
                      "Queue Position"
                    )}
                  </div>
                  <div className="text-3xl font-bold">
                    {status?.position === 0
                      ? t("queue.nextLabel", "Next!")
                      : status?.position ?? "—"}
                  </div>
                </div>
                <div className="bg-primary/10 rounded-lg p-4">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">
                      {t(
                        "queue.estimatedTime",
                        "Estimated Time"
                      )}
                    </span>
                  </div>
                  <div className="text-xl font-bold text-primary">
                    {status
                      ? `${status.etaLow}-${status.etaHigh} min`
                      : "—"}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <Button
                  onClick={fetchAll}
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={loading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />{" "}
                  {t("queue.refreshStatus", "Refresh Status")}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="lg:col-span-2 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {t("queue.nowNextTitle", "Now / Next")}
              </h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                {t("queue.autoRefreshing", "Auto-refreshing")}
              </div>
            </div>
            <div className="space-y-4">
              {(wall?.items || []).map((l) => (
                <div
                  key={l.lane}
                  className="p-4 border rounded-lg"
                >
                  <div className="text-sm text-muted-foreground mb-2">
                    {t("queue.laneLabel", "Lane")} {l.lane}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="default">
                      {t("queue.nowLabel", "Now")}:{" "}
                      {l.now[0] || "—"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {t("queue.nextLabelShort", "Next:")}
                    </span>
                    {l.next.slice(0, 5).map((n) => (
                      <Badge
                        key={n}
                        variant="secondary"
                      >
                        {n}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            onClick={() => navigate("/token")}
            variant="outline"
            size="lg"
            className="text-lg py-4 h-auto"
          >
            <Eye className="h-5 w-5 mr-2" />{" "}
            {t("queue.viewMyToken", "View My Token")}
          </Button>
          <Button
            onClick={() => navigate("/lab")}
            variant="outline"
            size="lg"
            className="text-lg py-4 h-auto"
          >
            {t("queue.labServices", "Lab Services")}
          </Button>
          <Button
            onClick={() => navigate("/help")}
            variant="outline"
            size="lg"
            className="text-lg py-4 h-auto"
          >
            {t("queue.needHelp", "Need Help?")}
          </Button>
        </div>
      </div>
    </KioskLayout>
  );
}
