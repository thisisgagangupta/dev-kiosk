import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, QrCode } from "lucide-react";
import QRCode from "qrcode";

/**
 * Props are optional. If patientId is not provided as a prop,
 * this component will use sessionStorage.kioskPatientId set by Identify/Walkin flows.
 */
interface DocumentUploadQRProps {
  patientId?: string;
  /** not used in the target URL, but kept for future; safe to ignore */
  appointmentId?: string;
  onSkip?: () => void;
}

/** Base of the patient portal; can be overridden via Vite env */
const PORTAL_BASE =
  (import.meta.env.VITE_PATIENT_PORTAL_BASE as string)?.replace(/\/+$/, "") ||
  "https://patient-portal.medmitra-ai.com";

/** Build the final url for records page */
function buildRecordsUrl(pid: string) {
  const u = new URL(`${PORTAL_BASE}/records`);
  u.searchParams.set("pid", pid);
  return u.toString();
}

export default function DocumentUploadQR({
  patientId,
  appointmentId, // future use
  onSkip,
}: DocumentUploadQRProps) {
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Resolve the patient id: prop wins; else sessionStorage
  const resolvedPid = useMemo(() => {
    const fromSession = sessionStorage.getItem("kioskPatientId") || "";
    return (patientId || fromSession || "").trim();
  }, [patientId]);

  const uploadURL = useMemo(() => {
    return resolvedPid ? buildRecordsUrl(resolvedPid) : "";
  }, [resolvedPid]);

  useEffect(() => {
    let isMounted = true;
  
    async function resolvePidAndGenerate() {
      setLoading(true);
      try {
        let pid = resolvedPid;
  
        // If not in sessionStorage/props, try backend cookie session
        if (!pid) {
          try {
            const API_BASE = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/+$/, "");
            const res = await fetch(`${API_BASE}/api/kiosk/session/me`, {
              credentials: "include",
            });
            if (res.ok) {
              const j = await res.json();
              if (j?.patientId) pid = String(j.patientId);
            }
          } catch {
            // ignore
          }
        }
  
        const finalUrl = pid ? buildRecordsUrl(pid) : "";
        if (!finalUrl) {
          if (isMounted) setQrCodeDataURL("");
          return;
        }
  
        const dataURL = await QRCode.toDataURL(finalUrl, {
          width: 256,
          margin: 2,
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        if (isMounted) setQrCodeDataURL(dataURL);
      } catch (err) {
        console.error("Failed to generate QR code:", err);
        if (isMounted) setQrCodeDataURL("");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
  
    resolvePidAndGenerate();
    return () => {
      isMounted = false;
    };
  }, [resolvedPid]);
  

  const noPid = !resolvedPid;

  return (
    <Card className="p-6 bg-gradient-to-br from-accent/5 to-primary/5 border-dashed border-2 border-accent/30">
      <div className="text-center space-y-4">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <div className="bg-accent/10 rounded-full p-3">
            <Upload className="h-6 w-6 text-accent" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-foreground">Upload Medical Documents</h3>
            <p className="text-sm text-muted-foreground">Lab reports, prescriptions, imaging</p>
          </div>
        </div>

        {/* QR / Placeholder */}
        <div className="bg-white p-4 rounded-lg inline-block shadow-sm">
          {loading ? (
            <div className="w-64 h-64 bg-muted animate-pulse rounded flex items-center justify-center">
              <QrCode className="h-12 w-12 text-muted-foreground" />
            </div>
          ) : noPid ? (
            <div className="w-64 h-64 rounded flex items-center justify-center p-4">
              <p className="text-sm text-muted-foreground">
                Please verify your phone or register to generate your upload QR.
              </p>
            </div>
          ) : (
            <img
              src={qrCodeDataURL}
              alt="QR code for uploading documents"
              className="w-64 h-64"
            />
          )}
        </div>

        {/* Instructions */}
        {!noPid ? (
          <>
            <div className="space-y-2">
              <p className="text-lg font-medium text-foreground">
                Scan with your phone to upload documents
              </p>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>• Previous lab reports</p>
                <p>• Current prescriptions</p>
                <p>• Medical imaging (X-rays, scans)</p>
                <p>• Any relevant medical documents</p>
              </div>
            </div>

            {/* Deep-link preview (optional, helps staff) */}
            <div className="text-xs text-muted-foreground break-all">
              {uploadURL}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              We couldn’t detect a patient profile for this session.
            </p>
            <p className="text-sm text-muted-foreground">
              Use <strong>“I have an appointment”</strong> or <strong>“Walk-in patient”</strong> to identify yourself first.
            </p>
          </div>
        )}

        {/* Benefits */}
        <div className="bg-success/10 rounded-lg p-3 text-sm">
          <div className="flex items-start gap-2">
            <FileText className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-success font-medium">Help your doctor provide better care</p>
              <p className="text-success/80">Upload documents for faster consultation</p>
            </div>
          </div>
        </div>

        {/* Skip Option */}
        {onSkip && (
          <Button
            onClick={onSkip}
            variant="ghost"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Skip for now — Upload later
          </Button>
        )}
      </div>
    </Card>
  );
}
