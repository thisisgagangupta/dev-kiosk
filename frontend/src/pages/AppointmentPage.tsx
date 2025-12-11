import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  User,
  Stethoscope,
  TestTube,
  MapPin,
  CreditCard,
  ArrowRight,
  Loader2,
} from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const trim = (s?: string) => (s || "").replace(/\/+$/, "");
const API_BASE = trim(import.meta.env.VITE_API_BASE_URL as string);

/* ---------- status helpers (UI-facing) ---------- */

function normalizeStatusLabel(raw: string | undefined | null): string {
  const s = (raw || "").toUpperCase();
  if (["CANCELLED", "CANCELED"].includes(s)) return "CANCELLED";
  if (["PENDING_PAYMENT", "PENDING", "UNPAID"].includes(s)) return "UNPAID";
  if (["PAID", "SUCCESS", "CAPTURED"].includes(s)) return "PAID";
  if (!s) return "BOOKED";
  return s;
}

function isUnpaidStatus(raw: string | undefined | null): boolean {
  const s = (raw || "").toUpperCase();
  return ["PENDING_PAYMENT", "PENDING", "UNPAID"].includes(s);
}

function isCancelledStatus(raw: string | undefined | null): boolean {
  const s = (raw || "").toUpperCase();
  return ["CANCELLED", "CANCELED"].includes(s);
}

/* ---------- types ---------- */

type AppointmentItem = {
  appointmentId: string;
  patientId: string;
  createdAt: string;
  status: string;
  recordType?: "doctor" | "lab" | "appointment" | string;
  clinicName?: string;
  clinicAddress?: string;
  doctorId?: string;
  doctorName?: string;
  specialty?: string;
  consultationType?: string;
  appointmentType?: string;
  dateISO?: string;
  timeSlot?: string;
  fee?: string;
  tests?: Array<{ name?: string; price?: number | string }>;
  collection?: { type?: string; preferredDateISO?: string; preferredSlot?: string };
  appointment_details?: {
    dateISO?: string;
    timeSlot?: string;
    doctorId?: string;
    doctorName?: string;
  };
  payment?: { status?: string; total?: number };
  s3Key?: string | null;

  // group booking metadata (from book-batch)
  groupId?: string;
  groupSize?: number;

  _raw?: any;
};

type AppointmentResponse = {
  items?: AppointmentItem[];
  lastEvaluatedKey?: any;
  patientId?: string;
  patientName?: string;
  normalizedPhone?: string;
};

export default function AppointmentPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AppointmentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const patientId = sessionStorage.getItem("kioskPatientId") || "";
  const phone = sessionStorage.getItem("kioskPhone") || "";

  const [patientName, setPatientName] = useState<string | null>(
    sessionStorage.getItem("kioskPatientName")
  );

  // --- helpers to parse dates/times and build sortable keys ---

  // Parse "14:30" or "2:30 PM" → minutes since midnight. Returns null if unparseable.
  const parseTimeToMinutes = (t?: string | null): number | null => {
    const raw = (t || "").trim();
    if (!raw) return null;

    // 24h "HH:mm"
    const m24 = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (m24) {
      const hh = Number(m24[1]);
      const mm = Number(m24[2]);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) return hh * 60 + mm;
      return null;
    }

    // 12h "h:mm AM/PM" (case-insensitive)
    const m12 = /^(\d{1,2}):(\d{2})\s*([APap][Mm])$/.exec(raw);
    if (m12) {
      let hh = Number(m12[1]);
      const mm = Number(m12[2]);
      const ampm = m12[3].toUpperCase();
      if (!(hh >= 1 && hh <= 12 && mm >= 0 && mm <= 59)) return null;
      if (ampm === "AM") {
        if (hh === 12) hh = 0;
      } else {
        if (hh !== 12) hh += 12;
      }
      return hh * 60 + mm;
    }

    return null;
  };

  // YYYY-MM-DD → Date (local)
  const parseDateOnly = (d?: string | null): Date | null => {
    const ds = (d || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ds)) return null;
    const dt = new Date(`${ds}T00:00:00`);
    if (isNaN(dt.getTime())) return null;
    return dt;
  };

  // Normalize to a uniform view for UI + filtering/sorting.
  const normalized = useMemo(() => {
    return (items || []).map((it) => {
      const apptDate =
        it.appointment_details?.dateISO ||
        it.dateISO ||
        it.collection?.preferredDateISO ||
        "";
      const apptTime =
        it.appointment_details?.timeSlot ||
        it.timeSlot ||
        it.collection?.preferredSlot ||
        "";
      const doctorNm =
        it.appointment_details?.doctorName ||
        it.doctorName ||
        "";
      const recordKind = (it.recordType ||
        (it.tests?.length ? "lab" : doctorNm ? "doctor" : "appointment")) as AppointmentItem["recordType"];

      // raw status from payment or appointment item
      const rawStatus = (it.payment?.status || it.status || "BOOKED").toUpperCase();

      return {
        ...it,
        _kind: recordKind,
        _date: apptDate, // YYYY-MM-DD (expected)
        _time: apptTime, // "HH:mm" or "h:mm AM/PM"
        _doctor: doctorNm,
        _status: rawStatus,
        _isUnpaid: isUnpaidStatus(rawStatus),
      } as any;
    });
  }, [items]);

  // Build comparable keys and filter out strictly-past dates (keep today and future).
  const upcoming = useMemo(() => {
    // Start of today (local) for date-only comparison
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Map each record to sortable key: (date, timeMinutes) and filter
    const mapped = normalized
      .map((a: any) => {
        const d = parseDateOnly(a._date || a.dateISO);
        const minutes = parseTimeToMinutes(a._time || a.timeSlot);
        return {
          rec: a,
          dateObj: d, // may be null for malformed; we drop those
          timeMin: minutes ?? -1, // if time unknown, put at start of that day
        };
      })
      .filter((m) => {
        if (!m.dateObj) return false; // drop malformed dates
        // Keep today and future; filter out strictly past dates
        return m.dateObj.getTime() >= todayStart.getTime();
      });

    // Sort by date asc, then time asc (-1 means "unknown time" -> will appear first for that day)
    mapped.sort((a, b) => {
      const ad = a.dateObj!.getTime();
      const bd = b.dateObj!.getTime();
      if (ad !== bd) return ad - bd;
      return a.timeMin - b.timeMin;
    });

    return mapped.map((m) => m.rec as AppointmentItem & any);
  }, [normalized, parseDateOnly, parseTimeToMinutes]);

  useEffect(() => {
    const goIdentify = () => navigate("/identify");

    const fetchByPatientId = async (
      pid: string
    ): Promise<AppointmentResponse> => {
      const res = await fetch(
        `${API_BASE}/api/appointments/${encodeURIComponent(pid)}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Failed (${res.status})`);
      return data as AppointmentResponse;
    };

    const fetchByPhone = async (
      mobile: string
    ): Promise<AppointmentResponse> => {
      const url = new URL(`${API_BASE}/api/appointments/by-phone`);
      url.searchParams.set("phone", mobile);
      url.searchParams.set("countryCode", "+91");
      const res = await fetch(url.toString());
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || `Failed (${res.status})`);
      if (data.patientId)
        sessionStorage.setItem("kioskPatientId", data.patientId);
      return data as AppointmentResponse;
    };

    (async () => {
      try {
        setLoading(true);
        setError(null);

        let out: AppointmentResponse = {};
        if (patientId) {
          out = await fetchByPatientId(patientId);
        } else if (phone) {
          out = await fetchByPhone(phone);
        } else {
          return goIdentify();
        }

        const list: AppointmentItem[] = (out.items || []).map(
          (it: any) => it
        );
        setItems(list);

        const pn = out.patientName || null;
        if (pn) {
          setPatientName(pn);
          sessionStorage.setItem("kioskPatientName", pn);
        }

        // Toast if nothing upcoming (we filter on render via `upcoming`)
        if (!list.length) {
          toast({
            title: "No Appointments Found",
            description:
              "We didn’t find any active bookings for this number.",
          });
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load appointments");
      } finally {
        setLoading(false);
      }
    })();
  }, [patientId, phone, navigate, toast]);

  // ---- always go to Reason page; Reason decides Payment vs Token ----
  const handleProceed = (chosen: AppointmentItem) => {
    sessionStorage.setItem(
      "kioskSelectedAppointmentId",
      chosen.appointmentId
    );
    sessionStorage.setItem(
      "kioskSelectedAppointmentRaw",
      JSON.stringify(chosen)
    );

    // Let ReasonPage inspect payment status & flow and choose /payment or /token.
    navigate("/reason");
  };

  const handleNotYou = () => {
    sessionStorage.removeItem("kioskPatientId");
    sessionStorage.removeItem("kioskPhone");
    sessionStorage.removeItem("kioskPatientName");
    navigate("/identify");
  };

  const headerLine = (() => {
    if (patientName || phone) {
      return (
        <>
          Showing bookings for{" "}
          <strong>
            {patientName ? patientName : ""}
            {patientName && phone ? " · " : ""}
            {phone ? phone : ""}
          </strong>
        </>
      );
    }
    return "Your upcoming bookings";
  })();

  return (
    <KioskLayout title="Appointment Details">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">
            {t("appointment.title")}
          </h1>
          <p className="text-lg text-muted-foreground">{headerLine}</p>
        </div>

        {/* Loading / Error */}
        {loading && (
          <Card className="p-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin inline-block mb-3" />
            <div className="text-muted-foreground">
              Fetching your appointments…
            </div>
          </Card>
        )}
        {!loading && error && (
          <Card className="p-6 text-center border-destructive/40">
            <div className="text-destructive font-medium mb-2">
              Failed to load
            </div>
            <div className="text-sm text-muted-foreground">{error}</div>
            <div className="mt-4">
              <Button onClick={() => window.location.reload()} size="lg">
                Retry
              </Button>
            </div>
          </Card>
        )}

        {/* No results */}
        {!loading && !error && upcoming.length === 0 && (
          <Card className="p-8 text-center">
            <div className="text-lg">No upcoming appointments.</div>
            <div className="text-sm text-muted-foreground mt-1">
              If you recently booked, please wait a moment or contact the
              front desk.
            </div>
            <div className="mt-6">
              <Button onClick={() => navigate("/walkin")} size="lg">
                Start a Walk-in Visit
              </Button>
            </div>
          </Card>
        )}

        {/* Appointments list (today + future, chronological) */}
        <div className="grid grid-cols-1 gap-6">
          {upcoming.map((a: any) => {
            const isLab = a.recordType === "lab";
            const displayTime = a.timeSlot || a._time || "--:--";
            const displayDate = a.dateISO || a._date || "—";

            const rawStatus = (a._status || a.status || "").toUpperCase();
            const displayStatus = normalizeStatusLabel(rawStatus);
            const isCancelled = isCancelledStatus(rawStatus);
            const unpaid = isUnpaidStatus(rawStatus);

            const isGroup = Boolean(a.groupId || a._raw?.groupId);
            const groupSize = a.groupSize ?? a._raw?.groupSize;

            const patientLabel = (() => {
              const base = patientName || "Patient";
              if (isGroup && groupSize && groupSize > 1) {
                return `${base} (Group of ${groupSize})`;
              }
              if (isGroup) {
                return `${base} (Group)`;
              }
              return base;
            })();

            return (
              <Card key={a.appointmentId} className="p-6 shadow-kiosk">
                <div className="flex flex-col gap-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-full p-3 bg-primary/10">
                        {isLab ? (
                          <TestTube className="h-6 w-6 text-primary" />
                        ) : (
                          <Stethoscope className="h-6 w-6 text-primary" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-xl font-semibold text-foreground">
                            {isLab
                              ? "Lab Tests"
                              : a._doctor || a.specialty || "Consultation"}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {displayStatus}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {a.clinicName || a.clinicAddress ? (
                            <>
                              {a.clinicName || "Clinic"}
                              {a.clinicName && a.clinicAddress ? " · " : ""}
                              {a.clinicAddress}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2 text-foreground">
                        <Clock className="h-4 w-4" />
                        <span className="text-lg font-medium">
                          {displayTime}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {displayDate}
                      </div>
                    </div>
                  </div>

                  {/* Details row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span>{patientLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{a.clinicName || a.clinicAddress || "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="h-4 w-4" />
                      <span>
                        {unpaid ? "Unpaid" : "Paid / NA"}
                        {a.fee
                          ? ` · ₹${a.fee}`
                          : a.payment?.total
                          ? ` · ₹${a.payment.total}`
                          : ""}
                      </span>
                    </div>
                  </div>

                  {/* Tests preview for lab */}
                  {a.recordType === "lab" && (a.tests?.length ?? 0) > 0 && (
                    <div className="text-sm text-muted-foreground">
                      Tests:{" "}
                      {a.tests!
                        .slice(0, 3)
                        .map((t: any) => t?.name || "Test")
                        .join(", ")}
                      {a.tests!.length > 3
                        ? ` +${a.tests!.length - 3} more`
                        : ""}
                    </div>
                  )}

                  <div className="flex justify-end">
                    {!isCancelled && (
                      <Button
                        size="lg"
                        className="px-6"
                        onClick={() => handleProceed(a)}
                      >
                        Continue <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Footer actions */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleNotYou}
            className="w-full sm:w-auto"
          >
            Not you? Change number
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate("/walkin")}
            className="w-full sm:w-auto"
          >
            Start a Walk-in Visit
          </Button>
        </div>
      </div>
    </KioskLayout>
  );
}
