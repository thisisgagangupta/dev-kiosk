import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Users, RefreshCw, Eye } from "lucide-react";
import KioskLayout from "@/components/KioskLayout";

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

// NEW: tokenTimes maps tokenNo → "HH:mm"
type WallLane = {
  lane: string;
  now: string[];
  next: string[];
  avg_wait: number;
  tokenTimes?: Record<string, string>;
};
type WallResp = { items: WallLane[] };

export default function QueuePage() {
  const navigate = useNavigate();
  const [tokenNo, setTokenNo] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusResp | null>(null); // kept for compatibility, not shown
  const [wall, setWall] = useState<WallResp | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<number | null>(null);

  // Read token from localStorage
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
      // keep status fetch so other assumptions stay intact (even though we don't display it here)
      const s = await fetch(
        `${API_BASE}/api/queue/status?tokenNo=${encodeURIComponent(tokenNo)}`
      ).then((r) => r.json());
      setStatus(s);

      const w = await fetch(`${API_BASE}/api/wallboard/now-next`)
        .then((r) => r.json())
        .catch(() => null);
      if (w) setWall(w);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenNo]);

  useEffect(() => {
    if (!pollRef.current) {
      pollRef.current = window.setInterval(fetchAll, 15000);
    }
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenNo]);

  if (!tokenNo) return null;

  const lanes = wall?.items || [];

  return (
    <KioskLayout title="Live Queue Status">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary">Live Queue Status</h1>
          <p className="text-lg text-muted-foreground">
            Real-time view of all tokens currently in the queue
          </p>
        </div>

        {/* Wallboard-style view */}
        <Card className="p-6 mb-8 shadow-kiosk">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">Now / Next</h2>
              <p className="text-sm text-muted-foreground">
                This view mirrors what&apos;s shown on the queue wallboard.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Auto-refreshing</span>
              </div>
              <Button
                onClick={fetchAll}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Clock className="h-6 w-6 mx-auto mb-3 animate-pulse" />
              Updating queue…
            </div>
          ) : lanes.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              No active tokens in the queue right now.
            </div>
          ) : (
            <div className="space-y-4">
              {lanes.map((lane) => {
                const nowToken = lane.now[0] || "—";
                const nowTime =
                  (lane.tokenTimes && lane.tokenTimes[nowToken]) || "";

                return (
                  <div
                    key={lane.lane}
                    className="p-4 border rounded-lg bg-muted/40 flex flex-col gap-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          Lane
                        </span>
                        <Badge
                          variant="secondary"
                          className="px-3 py-1 text-sm"
                        >
                          {lane.lane}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Avg consult: {lane.avg_wait} min
                      </span>
                    </div>

                    {/* Now token */}
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          Now
                        </span>
                        <div className="flex flex-col items-center">
                          <Badge
                            variant="default"
                            className="text-2xl px-6 py-2 rounded-full"
                          >
                            {nowToken}
                          </Badge>
                          {nowTime && (
                            <span className="text-xs text-muted-foreground mt-1">
                              {nowTime}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Next tokens */}
                      <div className="flex flex-col md:items-start gap-2">
                        <span className="text-sm text-muted-foreground">
                          Next
                        </span>
                        <div className="flex flex-wrap gap-3">
                          {lane.next.length === 0 ? (
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          ) : (
                            lane.next.slice(0, 10).map((n) => {
                              const t =
                                (lane.tokenTimes && lane.tokenTimes[n]) || "";
                              return (
                                <div
                                  key={n}
                                  className="flex flex-col items-center min-w-[3rem]"
                                >
                                  <Badge
                                    variant="secondary"
                                    className="text-lg px-4 py-2 rounded-full"
                                  >
                                    {n}
                                  </Badge>
                                  {t && (
                                    <span className="text-[11px] text-muted-foreground mt-1">
                                      {t}
                                    </span>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Footer actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button
            onClick={() => navigate("/token")}
            variant="outline"
            size="lg"
            className="text-lg py-4 h-auto"
          >
            <Eye className="h-5 w-5 mr-2" /> View My Token
          </Button>
          <Button
            onClick={() => navigate("/lab")}
            variant="outline"
            size="lg"
            className="text-lg py-4 h-auto"
          >
            Lab Services
          </Button>
          <Button
            onClick={() => navigate("/help")}
            variant="outline"
            size="lg"
            className="text-lg py-4 h-auto"
          >
            Need Help?
          </Button>
        </div>
      </div>
    </KioskLayout>
  );
}
