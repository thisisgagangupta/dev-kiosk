// // frontend/src/pages/CashPendingPage.tsx
// import { useEffect, useState } from "react";
// import { useNavigate } from "react-router-dom";
// import KioskLayout from "@/components/KioskLayout";
// import { Card } from "@/components/ui/card";
// import { Button } from "@/components/ui/button";
// import { AlertTriangle, ArrowLeft } from "lucide-react";

// type SelectedAppt = {
//   doctorName?: string;
//   clinicName?: string;
//   dateISO?: string;
//   timeSlot?: string;
// };

// export default function CashPendingPage() {
//   const navigate = useNavigate();
//   const [appt, setAppt] = useState<SelectedAppt | null>(null);

//   useEffect(() => {
//     try {
//       const raw = sessionStorage.getItem("kioskSelectedAppointmentRaw");
//       if (raw) {
//         const obj = JSON.parse(raw);
//         setAppt({
//           doctorName: obj.doctorName || obj.appointment_details?.doctorName,
//           clinicName: obj.clinicName || obj.appointment_details?.clinicName,
//           dateISO: obj.dateISO || obj.appointment_details?.dateISO,
//           timeSlot: obj.timeSlot || obj.appointment_details?.timeSlot,
//         });
//       }
//     } catch {
//       setAppt(null);
//     }
//   }, []);

//   return (
//     <KioskLayout title="Pay at Reception">
//       <div className="max-w-2xl mx-auto">
//         <Card className="p-8 text-center shadow-kiosk">
//           <div className="mb-6 flex flex-col items-center">
//             <AlertTriangle className="h-12 w-12 text-primary mb-3" />
//             <h1 className="text-2xl font-bold mb-2">Please Proceed to Front Desk</h1>
//             <p className="text-muted-foreground">
//               Your visit has been registered. Please pay at the reception to complete your check-in
//               and receive your token number.
//             </p>
//           </div>

//           {appt && (
//             <div className="mb-6 space-y-2 text-left bg-muted/40 rounded-lg p-4">
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">Doctor</span>
//                 <span className="font-medium">{appt.doctorName || "—"}</span>
//               </div>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">Clinic</span>
//                 <span className="font-medium">{appt.clinicName || "—"}</span>
//               </div>
//               <div className="flex justify-between text-sm">
//                 <span className="text-muted-foreground">Date &amp; Time</span>
//                 <span className="font-medium">
//                   {appt.dateISO || "—"}
//                   {appt.timeSlot ? ` • ${appt.timeSlot}` : ""}
//                 </span>
//               </div>
//             </div>
//           )}

//           <div className="space-y-3">
//             <p className="text-sm text-muted-foreground">
//               The front desk will update your payment status and issue a token after payment.
//             </p>
//             <Button
//               className="w-full"
//               size="lg"
//               onClick={() => navigate("/start")}
//             >
//               <ArrowLeft className="h-4 w-4 mr-2" />
//               Back to Start
//             </Button>
//           </div>
//         </Card>
//       </div>
//     </KioskLayout>
//   );
// }










// frontend/src/pages/CashPendingPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import KioskLayout from "@/components/KioskLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowLeft } from "lucide-react";

type SelectedAppt = {
  doctorName?: string;
  clinicName?: string;
  dateISO?: string;
  timeSlot?: string;
};

function parseDateLabel(dateISO?: string, timeSlot?: string) {
  const dateStr = (dateISO || "").trim();
  const timeStr = (timeSlot || "").trim();
  if (!dateStr && !timeStr) return "—";

  try {
    if (dateStr && timeStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [h, m] = (timeStr.split(":") as [string, string?]);
      const d = new Date(`${dateStr}T${h.padStart(2, "0")}:${(m || "00").padStart(2, "0")}:00`);
      const datePart = d.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const timePart = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
      return `${datePart} • ${timePart}`;
    }
  } catch {
    // fall through to raw
  }

  // Fallback: join raw strings if parsing fails
  if (dateStr && timeStr) return `${dateStr} • ${timeStr}`;
  if (dateStr) return dateStr;
  if (timeStr) return timeStr;
  return "—";
}

export default function CashPendingPage() {
  const navigate = useNavigate();
  const [appt, setAppt] = useState<SelectedAppt | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kioskSelectedAppointmentRaw");
      if (!raw) {
        setAppt(null);
        return;
      }

      const obj: any = JSON.parse(raw);

      // Helper to safely pull from a generic object
      const fromTop = (o: any): SelectedAppt => ({
        doctorName: o?.doctorName,
        clinicName: o?.clinicName,
        dateISO: o?.dateISO,
        timeSlot: o?.timeSlot,
      });

      const fromDetails = (o: any): SelectedAppt => {
        const d = o?.appointment_details || {};
        return {
          doctorName: d.doctorName,
          clinicName: d.clinicName,
          dateISO: d.dateISO,
          timeSlot: d.timeSlot,
        };
      };

      const fromFirstAppointmentInBatch = (o: any): SelectedAppt => {
        const first = Array.isArray(o?.appointments) ? o.appointments[0] : null;
        if (!first) return {};
        return {
          doctorName: first.doctorName,
          clinicName: first.clinicName,
          dateISO: first.dateISO,
          timeSlot: first.timeSlot,
        };
      };

      const candidates: SelectedAppt[] = [
        fromTop(obj),
        fromDetails(obj),
        fromFirstAppointmentInBatch(obj),
      ];

      const merged: SelectedAppt = candidates.reduce(
        (acc, cur) => ({
          doctorName: acc.doctorName || cur.doctorName,
          clinicName: acc.clinicName || cur.clinicName,
          dateISO: acc.dateISO || cur.dateISO,
          timeSlot: acc.timeSlot || cur.timeSlot,
        }),
        {} as SelectedAppt,
      );

      // If we still have nothing at all, treat as "no details"
      if (
        !merged.doctorName &&
        !merged.clinicName &&
        !merged.dateISO &&
        !merged.timeSlot
      ) {
        setAppt(null);
      } else {
        setAppt(merged);
      }
    } catch {
      setAppt(null);
    }
  }, []);

  const dateLabel = parseDateLabel(appt?.dateISO, appt?.timeSlot);

  return (
    <KioskLayout title="Pay at Reception">
      <div className="max-w-2xl mx-auto">
        <Card className="p-8 text-center shadow-kiosk">
          <div className="mb-6 flex flex-col items-center">
            <AlertTriangle className="h-12 w-12 text-primary mb-3" />
            <h1 className="text-2xl font-bold mb-2">Please Proceed to Front Desk</h1>
            <p className="text-muted-foreground">
              Your visit has been registered. Please pay at the reception to complete your check-in
              and receive your token number.
            </p>
          </div>

          {appt ? (
            <div className="mb-6 space-y-2 text-left bg-muted/40 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Doctor</span>
                <span className="font-medium">
                  {appt.doctorName?.trim() || "To be assigned at front desk"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Clinic</span>
                <span className="font-medium">
                  {appt.clinicName?.trim() || "Clinic will confirm"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date &amp; Time</span>
                <span className="font-medium">{dateLabel}</span>
              </div>
            </div>
          ) : (
            <div className="mb-6 text-sm text-muted-foreground">
              Appointment details are not available right now, but your visit has been registered.
              The front desk will look up your booking with your phone number.
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The front desk will update your payment status and issue a token after payment.
            </p>
            <Button className="w-full" size="lg" onClick={() => navigate("/start")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Start
            </Button>
          </div>
        </Card>
      </div>
    </KioskLayout>
  );
}
