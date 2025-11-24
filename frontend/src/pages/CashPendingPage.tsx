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

export default function CashPendingPage() {
  const navigate = useNavigate();
  const [appt, setAppt] = useState<SelectedAppt | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kioskSelectedAppointmentRaw");
      if (raw) {
        const obj = JSON.parse(raw);
        setAppt({
          doctorName: obj.doctorName || obj.appointment_details?.doctorName,
          clinicName: obj.clinicName || obj.appointment_details?.clinicName,
          dateISO: obj.dateISO || obj.appointment_details?.dateISO,
          timeSlot: obj.timeSlot || obj.appointment_details?.timeSlot,
        });
      }
    } catch {
      setAppt(null);
    }
  }, []);

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

          {appt && (
            <div className="mb-6 space-y-2 text-left bg-muted/40 rounded-lg p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Doctor</span>
                <span className="font-medium">{appt.doctorName || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Clinic</span>
                <span className="font-medium">{appt.clinicName || "—"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Date &amp; Time</span>
                <span className="font-medium">
                  {appt.dateISO || "—"}
                  {appt.timeSlot ? ` • ${appt.timeSlot}` : ""}
                </span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The front desk will update your payment status and issue a token after payment.
            </p>
            <Button
              className="w-full"
              size="lg"
              onClick={() => navigate("/start")}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Start
            </Button>
          </div>
        </Card>
      </div>
    </KioskLayout>
  );
}
