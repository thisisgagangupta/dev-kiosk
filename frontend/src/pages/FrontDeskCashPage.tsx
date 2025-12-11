import { useEffect, useState } from "react";
import KioskLayout from "@/components/KioskLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { IndianRupee, RefreshCw, CheckCircle, Clock, XCircle } from "lucide-react";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/+$/, "");

type CashPendingItem = {
  patientId: string;
  appointmentId: string;
  clinicName?: string;
  doctorName?: string;
  dateISO?: string;
  timeSlot?: string;
  amount?: number;
  status?: string;
  patientName?: string;
};

type TokenResp = {
  tokenNo: string;
  lane: string;
  position: number;
  etaLow: number;
  etaHigh: number;
  confidence: number;
  appointmentId: string;
  patientId: string;
  status: string;
};

function parseSortKey(row: CashPendingItem): number {
  const d = (row.dateISO || "").trim();
  const t = (row.timeSlot || "").trim();
  if (!d) return Number.MAX_SAFE_INTEGER;
  try {
    const [hStr, mStr = "0"] = t ? t.split(":") : ["0", "0"];
    const dt = new Date(`${d}T${hStr.padStart(2, "0")}:${mStr.padStart(2, "0")}:00`);
    const ts = dt.getTime();
    return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function formatDateTime(dateISO?: string, timeSlot?: string): string {
  const d = (dateISO || "").trim();
  const t = (timeSlot || "").trim();
  if (!d && !t) return "—";
  try {
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [hStr, mStr = "0"] = t ? t.split(":") : ["0", "0"];
      const dt = new Date(`${d}T${hStr.padStart(2, "0")}:${mStr.padStart(2, "0")}:00`);
      const datePart = dt.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const timePart = dt.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return t ? `${datePart} • ${timePart}` : datePart;
    }
  } catch {
    // fall back to raw values below
  }
  if (d && t) return `${d} • ${t}`;
  if (d) return d;
  if (t) return t;
  return "—";
}

export default function FrontDeskCashPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<CashPendingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<TokenResp | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/frontdesk/cash-pending`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        throw new Error(data?.detail || `Failed (${res.status})`);
      }

      const todayIso = new Date().toISOString().slice(0, 10);

      const raw: CashPendingItem[] = (data || []) as CashPendingItem[];

      // Filter to today's entries only, then sort by time
      const todays = raw.filter((row) => (row.dateISO || "").slice(0, 10) === todayIso);
      todays.sort((a, b) => parseSortKey(a) - parseSortKey(b));

      setItems(todays);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Failed to load cash queue",
        description: e?.message || "Try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSettleAndIssue = async (row: CashPendingItem) => {
    setIssuingId(row.appointmentId);
    setLastToken(null);
    try {
      // 1) Mark payment as paid (cash)
      const settleRes = await fetch(`${API_BASE}/api/frontdesk/cash/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: row.patientId,
          appointmentId: row.appointmentId,
        }),
      });
      const settleData = await settleRes.json().catch(() => ({}));
      if (!settleRes.ok) {
        throw new Error(settleData?.detail || `Failed to settle (${settleRes.status})`);
      }

      // 2) Issue token (same endpoint kiosk uses)
      const tokenRes = await fetch(`${API_BASE}/api/kiosk/checkin/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: row.patientId,
          appointmentId: row.appointmentId,
        }),
      });
      const tokenData: TokenResp = await tokenRes.json();
      if (!tokenRes.ok) {
        throw new Error((tokenData as any)?.detail || `Token error (${tokenRes.status})`);
      }

      setLastToken(tokenData);
      toast({
        title: "Token Issued",
        description: `Token ${tokenData.tokenNo} issued for patient.`,
      });

      // 3) Remove from local list
      setItems((prev) =>
        prev.filter(
          (i) => !(i.patientId === row.patientId && i.appointmentId === row.appointmentId),
        ),
      );
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Operation failed",
        description: e?.message || "Please try again.",
      });
    } finally {
      setIssuingId(null);
    }
  };

  const handleCancel = async (row: CashPendingItem) => {
    setCancellingId(row.appointmentId);
    try {
      const res = await fetch(`${API_BASE}/api/frontdesk/cash/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: row.patientId,
          appointmentId: row.appointmentId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.detail || `Failed to cancel (${res.status})`);
      }

      // Remove from list after successful cancel
      setItems((prev) =>
        prev.filter(
          (i) => !(i.patientId === row.patientId && i.appointmentId === row.appointmentId),
        ),
      );

      toast({
        title: "Appointment Cancelled",
        description: "The slot has been freed and this entry removed from the cash queue.",
      });
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Cancel failed",
        description: e?.message || "Please try again.",
      });
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <KioskLayout title="Front Desk Cash">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cash Payments Queue</h1>
            <p className="text-sm text-muted-foreground">
              Patients who chose &ldquo;Pay at reception&rdquo; appear here. Collect cash, mark paid,
              and issue a token, or cancel to free the slot.
            </p>
          </div>
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        <Card className="p-4">
          {items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {loading ? "Loading..." : "No pending cash payments for today."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Clinic</TableHead>
                  <TableHead>Doctor</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => {
                  const sortKey = parseSortKey(row); // not used in UI but keeps compiler happy if needed
                  const label = formatDateTime(row.dateISO, row.timeSlot);
                  return (
                    <TableRow key={`${row.patientId}-${row.appointmentId}`}>
                      <TableCell className="text-xs">
                        <div className="font-medium text-sm">
                          {row.patientName?.trim() || "Patient"}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {row.patientId}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                          Appt: {row.appointmentId}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {row.clinicName || "Clinic"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium">
                          {row.doctorName || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">{label}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 text-sm">
                          <IndianRupee className="h-3 w-3" />
                          <span>{row.amount ?? 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          size="sm"
                          disabled={issuingId === row.appointmentId}
                          onClick={() => handleSettleAndIssue(row)}
                        >
                          {issuingId === row.appointmentId ? (
                            <>
                              <Clock className="h-4 w-4 mr-1 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Collect &amp; Issue Token
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive text-destructive hover:bg-destructive/5"
                          disabled={cancellingId === row.appointmentId}
                          onClick={() => handleCancel(row)}
                        >
                          {cancellingId === row.appointmentId ? (
                            <>
                              <Clock className="h-4 w-4 mr-1 animate-spin" />
                              Cancelling...
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-1" />
                              Cancel
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {lastToken && (
          <Card className="p-6 bg-muted/40">
            <h2 className="text-lg font-semibold mb-3">Last Issued Token</h2>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted-foreground">Token Number</div>
                <div className="text-2xl font-bold">{lastToken.tokenNo}</div>
                <div className="text-xs text-muted-foreground">
                  Lane {lastToken.lane} • Position{" "}
                  {lastToken.position === 0 ? "Next" : lastToken.position}
                </div>
              </div>
              <div className="text-right text-sm text-muted-foreground">
                <div>
                  ETA: {lastToken.etaLow}-{lastToken.etaHigh} min
                </div>
                <div>Confidence: {lastToken.confidence}%</div>
              </div>
            </div>
          </Card>
        )}
      </div>
    </KioskLayout>
  );
}
