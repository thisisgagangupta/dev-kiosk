import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import KioskLayout from "@/components/KioskLayout";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Stethoscope, MapPin, Star, Clock, AlertTriangle, Users,
  CheckCircle2, Calendar as CalendarIcon, XCircle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getStoredLanguage, useTranslation } from "@/lib/i18n";
import { Separator } from "@/components/ui/separator";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/+$/, "");

/* ----------------- helpers ----------------- */

function pad2(n: number) { return String(n).padStart(2, "0"); }

/** Strict HH:mm -> HH:mm; also best-effort normalize things like "9:0", "9:00 AM" */
function normalizeHHMM(raw: string): string {
  if (!raw) return raw;
  const s = raw.trim().toUpperCase();
  // Handle "HH:mm AM/PM" quickly
  const ampm = s.endsWith("AM") || s.endsWith("PM") ? s.slice(-2) : "";
  const core = ampm ? s.slice(0, -2).trim() : s;
  const parts = core.split(":").map(x => x.trim()).filter(Boolean);
  let h = parseInt(parts[0] || "0", 10);
  let m = parseInt(parts[1] || "0", 10);
  if (ampm) {
    if (ampm === "AM") { if (h === 12) h = 0; }
    else { if (h !== 12) h += 12; }
  }
  if (Number.isNaN(h) || Number.isNaN(m)) return raw;
  if (h < 0 || h > 23 || m < 0 || m > 59) return raw;
  return `${pad2(h)}:${pad2(m)}`;
}

const HHMM_RE = /^\d{2}:\d{2}$/;

function toSortedUniqueHHMM(list: string[]): string[] {
  // normalize + keep only strict HH:mm
  const norm = list.map((s) => normalizeHHMM(s)).filter((s) => HHMM_RE.test(s));
  const uniq = Array.from(new Set(norm));
  // sort on a COPY (eslint/immutability-friendly)
  return [...uniq].sort(compareHHMM);
}


function generateQuarterHourSlots(start = "08:00", end = "20:00"): string[] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const out: string[] = [];
  for (let h = sh; h < eh || (h === eh && (em ?? 0) > 0); h++) {
    for (let m of [0, 15, 30, 45]) {
      if (h === sh && m < sm) continue;
      if (h > eh || (h === eh && m >= (em || 0))) break;
      out.push(`${pad2(h)}:${pad2(m)}`);
    }
  }
  return out;
}

function dateToLocalYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function filterPastSlots(date: Date, all: string[]) {
  const today = new Date();
  const same = today.toDateString() === date.toDateString();
  if (!same) return all;
  const curH = today.getHours(), curM = today.getMinutes();
  return all.filter((t) => {
    const [h, m] = t.split(":").map(Number);
    return h > curH || (h === curH && m > curM);
  });
}

function compareHHMM(a: string, b: string) {
  if (a === b) return 0;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  if (ah !== bh) return ah - bh;
  return am - bm;
}

/* ---------- demo doctors list (replace with API when ready) ---------- */
type Doctor = { id: string; name: string; specialty: string; clinicName: string; rating?: number; qualifications?: string; };
const DOCTORS: Doctor[] = [
  { id: "1", name: "Dr. Michael Chen", specialty: "General Medicine", clinicName: "MedMitra Downtown Clinic", rating: 4.8, qualifications: "MBBS, MD" },
  { id: "2", name: "Dr. Priya Sharma",  specialty: "General Medicine", clinicName: "MedMitra Central Clinic",   rating: 4.6, qualifications: "MBBS, MD" },
];

export default function WalkinSlotPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation(getStoredLanguage());

  const patientId = sessionStorage.getItem("kioskPatientId") || "";
  const phone     = sessionStorage.getItem("kioskPhone") || "";
  const groupSize = Math.max(1, Number(sessionStorage.getItem("kioskGroupSize") || "1"));

  const [selectedDoctorId, setSelectedDoctorId] = useState<string>(DOCTORS[0]?.id || "");
  const doctor = useMemo(() => DOCTORS.find(d => d.id === selectedDoctorId)!, [selectedDoctorId]);

  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [booked, setBooked] = useState<string[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);

  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSlots = useMemo(() => generateQuarterHourSlots("08:00", "20:00"), []);
  const availableSlots = useMemo(() => {
    if (!selectedDate) return [];
    const futureOnly = filterPastSlots(selectedDate, allSlots);
    // ↓ show ONLY free slots
    const bookedSet = new Set(booked.map(normalizeHHMM));
    return futureOnly.filter((s) => !bookedSet.has(s));
  }, [selectedDate, allSlots, booked]);

  // guard: identity
  useEffect(() => {
    if (!patientId) {
      toast({ variant: "destructive", title: "Session Expired", description: "Please verify again." });
      navigate("/identify");
    }
  }, [patientId, navigate, toast]);

  // availability fetch + polling
  const pollingRef = useRef<number | null>(null);
  useEffect(() => {
    let aborted = false;
    const fetchAvailability = async () => {
      if (!selectedDate || !doctor) return;
      setLoading(true); setError(null);
      try {
        const date = dateToLocalYYYYMMDD(selectedDate);
        const url = new URL(`${API_BASE}/api/appointments/availability`);
        url.searchParams.set("type", "doctor");
        url.searchParams.set("resourceId", doctor.id);
        url.searchParams.set("date", date);
        const res = await fetch(url.toString(), { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || `Failed to load availability (${res.status})`);
        if (!aborted) {
          // normalize to strict HH:mm once here
          const normalized = (data.booked || []).map((s: string) => normalizeHHMM(s));
          setBooked(toSortedUniqueHHMM(data.booked || []));
          // remove any user-selected slot that just became booked
          setSelectedSlots((prev) => prev.filter((s) => !normalized.includes(s)));
        }
      } catch (e: any) {
        if (!aborted) { setError(e?.message || "Failed to load availability"); setBooked([]); }
      } finally {
        if (!aborted) setLoading(false);
      }
    };
    fetchAvailability();
    if (pollingRef.current) window.clearInterval(pollingRef.current);
    pollingRef.current = window.setInterval(fetchAvailability, 30000);
    const onFocus = () => fetchAvailability();
    window.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      aborted = true;
      if (pollingRef.current) { window.clearInterval(pollingRef.current); pollingRef.current = null; }
      window.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [doctor, selectedDate]);

  // also prune selection if booked list changes due to race
  useEffect(() => {
    setSelectedSlots((prev) => prev.filter((s) => !booked.includes(s)));
  }, [booked]);

  function toggleSlot(slot: string) {
    if (selectedSlots.includes(slot)) {
      setSelectedSlots(selectedSlots.filter((s) => s !== slot));
      return;
    }
    if (selectedSlots.length >= groupSize) {
      toast({
        variant: "destructive",
        title: `You can select up to ${groupSize} slot${groupSize > 1 ? "s" : ""}`,
        description: "Deselect a time to pick another.",
      });
      return;
    }
    setSelectedSlots([...selectedSlots, slot].sort(compareHHMM));
  }

  async function handleBook() {
    if (!patientId || !doctor || !selectedDate || selectedSlots.length === 0) return;
    if (selectedSlots.length !== groupSize) {
      toast({
        variant: "destructive",
        title: `Please select ${groupSize} slot${groupSize > 1 ? "s" : ""}`,
        description: `Currently selected: ${selectedSlots.length}`,
      });
      return;
    }

    setBooking(true); setError(null);
    try {
      const dateISO = dateToLocalYYYYMMDD(selectedDate);

      // single vs batch
      if (selectedSlots.length === 1) {
        const payload = {
          patientId,
          contact: { phone, name: "" },
          appointment_details: {
            dateISO,
            timeSlot: selectedSlots[0],
            clinicName: doctor.clinicName,
            specialty: doctor.specialty,
            doctorId: doctor.id,
            doctorName: doctor.name,
            consultationType: "in-person",
            appointmentType: "walkin",
            symptoms: "", fee: "", languages: [],
          },
          source: "kiosk",
        };
        const res = await fetch(`${API_BASE}/api/appointments/book`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          await refreshAfterRace(dateISO);
          toast({ variant: "destructive", title: "Slot Unavailable", description: data.detail || "Please pick another slot." });
          setBooking(false);
          return;
        }
        if (!res.ok) throw new Error(data.detail || `Booking failed (${res.status})`);

        const enriched = {
          ...data,
          doctorName: doctor.name,
          clinicName: doctor.clinicName,
          dateISO,
          timeSlot: selectedSlots[0],
          appointment_details: {
            ...payload.appointment_details,
          },
        };

        // stash for downstream pages
        const apptId = data.appointmentId as string;
        sessionStorage.setItem("kioskSelectedAppointmentId", apptId);
        sessionStorage.setItem(
          "kioskSelectedAppointmentRaw",
          JSON.stringify(enriched),
        );
      } else {
        const payload = {
          patientId,
          contact: { phone, name: "" },
          appointment_details: {
            dateISO,
            clinicName: doctor.clinicName,
            specialty: doctor.specialty,
            doctorId: doctor.id,
            doctorName: doctor.name,
            consultationType: "in-person",
            appointmentType: "walkin",
            symptoms: "",
            fee: "",
            languages: [],
          },
          timeSlots: selectedSlots, // free (not necessarily consecutive)
          source: "kiosk",
        };
        const res = await fetch(`${API_BASE}/api/appointments/book-batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 409) {
          await refreshAfterRace(dateISO);
          const bad = (data.conflicts || []).join(", ");
          toast({
            variant: "destructive",
            title: "Some slots just got taken",
            description: bad ? `Conflicts: ${bad}` : "Pick different times.",
          });
          setBooking(false);
          return;
        }
        if (!res.ok) throw new Error(data.detail || `Batch booking failed (${res.status})`);

        const first = Array.isArray(data.appointments) ? data.appointments[0] : null;
        if (first?.appointmentId) {
          sessionStorage.setItem("kioskSelectedAppointmentId", first.appointmentId);
        }

        // Enrich the first appointment with doctor/clinic/date/time information
        const enrichedFirst = first
          ? {
              ...first,
              doctorName: doctor.name,
              clinicName: doctor.clinicName,
              dateISO,
              timeSlot: first.timeSlot || selectedSlots[0],
              appointment_details: {
                ...payload.appointment_details,
                dateISO,
                timeSlot: first.timeSlot || selectedSlots[0],
              },
              groupId: first.groupId ?? data.groupId,
              groupSize: first.groupSize ?? data.groupSize,
            }
          : null;

        sessionStorage.setItem(
          "kioskSelectedAppointmentRaw",
          JSON.stringify(enrichedFirst ?? data),
        );
      }

      sessionStorage.setItem("kioskFlow", "walkin");
      toast({
        title: "Appointment(s) Booked",
        description:
          selectedSlots.length > 1
            ? `Booked ${selectedSlots.length} slot(s).`
            : "Booking confirmed.",
      });
      navigate("/reason");
    } catch (e: any) {
      setError(e?.message || "Failed to book appointment");
    } finally {
      setBooking(false);
    }
  }

  async function refreshAfterRace(dateISO: string) {
    try {
      const url = new URL(`${API_BASE}/api/appointments/availability`);
      url.searchParams.set("type", "doctor");
      url.searchParams.set("resourceId", doctor.id);
      url.searchParams.set("date", dateISO);
      const r2 = await fetch(url.toString());
      const d2 = await r2.json().catch(() => ({}));
      const normalized = (d2.booked || []).map((s: string) => normalizeHHMM(s));
      setBooked(normalized);
      setSelectedSlots((prev) => prev.filter((s) => !normalized.includes(s)));
    } catch {}
  }

  const earliest = availableSlots[0];
  const canBook = !!doctor && !!selectedDate && selectedSlots.length === groupSize && !booking;

  return (
    <KioskLayout title="Book Walk-in Appointment">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-3">Book Your Walk-in Appointment</h1>
          <p className="text-lg text-muted-foreground">
            {groupSize > 1
              ? `Select ${groupSize} separate time slot${groupSize > 1 ? "s" : ""} for your group`
              : "Select your preferred doctor, date, and time slot"}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Card className="mb-6 border-destructive bg-destructive/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                <div>
                  <p className="font-semibold text-destructive">Booking Error</p>
                  <p className="text-sm text-destructive/90 mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Doctor + Date + Slots */}
          <div className="lg:col-span-2 space-y-6">
            {/* 1. Doctor */}
            <Card className="shadow-md">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">1</span>
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    <Stethoscope className="h-5 w-5" />
                    Choose Your Doctor
                  </CardTitle>
                </div>
                <CardDescription>Select from available walk-in doctors</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="doctor-select" className="text-base">Available Doctors</Label>
                  <Select value={selectedDoctorId} onValueChange={(v) => { setSelectedDoctorId(v); setSelectedSlots([]); }}>
                    <SelectTrigger id="doctor-select" className="h-12">
                      <SelectValue placeholder="Choose a doctor" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCTORS.map((d) => (
                        <SelectItem key={d.id} value={d.id} className="py-3">
                          <div className="flex flex-col">
                            <span className="font-medium">{d.name}</span>
                            <span className="text-xs text-muted-foreground">{d.specialty}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {doctor && (
                  <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="font-medium">{doctor.clinicName}</p>
                        <p className="text-sm text-muted-foreground">{doctor.specialty}</p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-center gap-4 text-sm">
                      {doctor.rating && (
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                          <span className="font-medium">{doctor.rating}</span>
                          <span className="text-muted-foreground">Rating</span>
                        </div>
                      )}
                      {doctor.qualifications && (
                        <div className="text-muted-foreground">
                          {doctor.qualifications}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {groupSize > 1 && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <Users className="h-5 w-5 text-primary" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Group Booking</p>
                      <p className="text-xs text-muted-foreground">
                        Select {groupSize} separate time slots for your group.
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-base px-3 py-1">
                      {groupSize}
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 2. Date */}
            <Card className="shadow-md">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-bold text-primary">2</span>
                  </div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarIcon className="h-5 w-5" />
                    Select Date
                  </CardTitle>
                </div>
                <CardDescription>Pick your preferred appointment date</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex justify-center">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(d) => { setSelectedSlots([]); setSelectedDate(d || new Date()); }}
                    className="rounded-md border"
                    disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 3. Time Slots */}
            <Card className="shadow-md">
              <CardHeader className="space-y-1 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">3</span>
                    </div>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Choose Time Slot{groupSize > 1 ? "s" : ""}
                    </CardTitle>
                  </div>
                  {earliest && (
                    <Badge variant="outline" className="gap-1">
                      <Clock className="h-3 w-3" />
                      Next: {earliest}
                    </Badge>
                  )}
                </div>
                <CardDescription>
                  {selectedDate ? `Available slots for ${dateToLocalYYYYMMDD(selectedDate)}` : "Select a date first"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Clock className="h-12 w-12 animate-pulse mb-3" />
                    <p className="text-lg font-medium">Loading available slots...</p>
                    <p className="text-sm">Please wait</p>
                  </div>
                ) : availableSlots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <AlertTriangle className="h-12 w-12 mb-3" />
                    <p className="text-lg font-medium">No slots available</p>
                    <p className="text-sm">Please try a different date</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
                      {availableSlots.map((slot) => {
                        const selected = selectedSlots.includes(slot);
                        return (
                          <Button
                            key={slot}
                            variant={selected ? "default" : "outline"}
                            className={`h-14 text-base font-medium relative ${selected ? "ring-2 ring-primary ring-offset-2" : ""}`}
                            onClick={() => toggleSlot(slot)}
                          >
                            {slot}
                            {selected && (
                              <CheckCircle2 className="h-3 w-3 absolute -top-1 -right-1 text-primary" />
                            )}
                          </Button>
                        );
                      })}
                    </div>

                    {selectedSlots.length > 0 && (
                      <div className="p-4 rounded-lg bg-muted/50 border">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                          <div className="flex-1 space-y-2">
                            <p className="font-semibold">
                              Selected ({selectedSlots.length}/{groupSize})
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {selectedSlots.map((s, idx) => (
                                <Badge key={s} variant="secondary" className="text-sm">
                                  {idx + 1}. {s}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setSelectedSlots([])} className="text-destructive">
                            <XCircle className="h-4 w-4 mr-1" />
                            Clear
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Summary & Actions */}
          <div className="lg:col-span-1">
            <div className="sticky top-4 space-y-4">
              <Card className="shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg">Booking Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 pb-3 border-b">
                      <Stethoscope className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Doctor</p>
                        <p className="font-medium text-sm break-words">{doctor?.name || "—"}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 pb-3 border-b">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Clinic</p>
                        <p className="text-sm break-words">{doctor?.clinicName || "—"}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 pb-3 border-b">
                      <CalendarIcon className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Date</p>
                        <p className="font-medium text-sm">
                          {selectedDate ? dateToLocalYYYYMMDD(selectedDate) : "Not selected"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 pb-3 border-b">
                      <Clock className="h-4 w-4 text-muted-foreground mt-1" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground mb-1">Selected Time{selectedSlots.length > 1 ? "s" : ""}</p>
                        {selectedSlots.length ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedSlots.map((s, idx) => (
                              <Badge key={s} variant="secondary">{idx + 1}. {s}</Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm">None</p>
                        )}
                      </div>
                    </div>

                    {groupSize > 1 && (
                      <div className="flex items-start gap-3">
                        <Users className="h-4 w-4 text-muted-foreground mt-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground mb-1">Group Size</p>
                          <Badge variant="secondary">{groupSize} people</Badge>
                        </div>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Button className="w-full h-12 text-base font-semibold" size="lg" onClick={handleBook} disabled={!canBook}>
                      {booking ? (
                        <>
                          <Clock className="h-4 w-4 animate-spin" />
                          Booking...
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          {groupSize > 1 ? `Book ${groupSize} Slots` : "Confirm & Continue"}
                        </>
                      )}
                    </Button>

                    <Button variant="outline" className="w-full h-11" onClick={() => navigate("/walkin")} disabled={booking}>
                      Back to Walk-in Options
                    </Button>
                  </div>

                  {selectedSlots.length !== groupSize && (
                    <p className="text-xs text-center text-muted-foreground">
                      Please select {groupSize} slot{groupSize > 1 ? "s" : ""} to continue
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardContent className="pt-6">
                  <div className="text-center space-y-2">
                    <p className="text-sm font-medium">Need Assistance?</p>
                    <p className="text-xs text-muted-foreground">
                      Staff members are available at the reception desk for help
                    </p>
                    <Button variant="link" size="sm" onClick={() => navigate("/help")}>
                      Get Help
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </KioskLayout>
  );
}