import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Heart, Brain, Bone, Eye, Pill, Plus, MessageSquare, Upload, Mic, MicOff } from "lucide-react";
import KioskLayout from "@/components/KioskLayout";
import { useTranslation, getStoredLanguage } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import DocumentUploadQR from "@/components/DocumentUploadQR";

import useVoiceCapture, { mapUiLangToWhisper } from "@/hooks/useVoiceCapture";

interface ReasonOption {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  category: string;
}

export default function ReasonPage() {
  const navigate = useNavigate();
  const { t } = useTranslation(getStoredLanguage());
  const { toast } = useToast();

  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [customReason, setCustomReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [showDocumentUpload, setShowDocumentUpload] = useState(false);

  const uiLang = getStoredLanguage();                  // e.g. "en", "hi-IN"
  const whisperLang = useMemo(() => mapUiLangToWhisper(uiLang), [uiLang]);

  const reasonOptions: ReasonOption[] = [
    { id: "general-checkup", title: "General Check-up", icon: Heart, category: "General" },
    { id: "fever-cold", title: "Fever / Cold", icon: Heart, category: "General" },
    { id: "headache", title: "Headache", icon: Brain, category: "Neurological" },
    { id: "back-pain", title: "Back Pain", icon: Bone, category: "Orthopedic" },
    { id: "joint-pain", title: "Joint Pain", icon: Bone, category: "Orthopedic" },
    { id: "eye-problem", title: "Eye Problem", icon: Eye, category: "Ophthalmology" },
    { id: "skin-issue", title: "Skin Issue", icon: Heart, category: "Dermatology" },
    { id: "stomach-pain", title: "Stomach Pain", icon: Heart, category: "Gastroenterology" },
    { id: "diabetes", title: "Diabetes Check", icon: Pill, category: "Endocrinology" },
    { id: "blood-pressure", title: "Blood Pressure", icon: Heart, category: "Cardiology" },
    { id: "pregnancy", title: "Pregnancy Related", icon: Heart, category: "Gynecology" },
    { id: "follow-up", title: "Follow-up Visit", icon: Plus, category: "General" }
  ];

  const categories = [...new Set(reasonOptions.map(option => option.category))];

  const toggleReason = (reasonId: string) => {
    setSelectedReasons(prev =>
      prev.includes(reasonId)
        ? prev.filter(id => id !== reasonId)
        : [...prev, reasonId]
    );
  };

  // Voice hook in "oneshot" mode — start() begins capture, stop() returns final transcript.
  const { start, stop, isRecording, isProcessing, error } = useVoiceCapture({
    mode: "oneshot",
    whisperLang,
  });

  // Clean up on unmount/route-change.
  useEffect(() => {
    return () => {
      if (isRecording) {
        // stop safely, ignore returned text on unmount
        stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording]);

  const handleMicClick = async () => {
    if (!isRecording) {
      await start();
      toast({
        title: "Recording Started",
        description: "Please describe your symptoms in your own words.",
      });
    } else {
      const finalText = await stop();
      if (finalText && finalText.trim()) {
        // replace or append? UX chooses append so users can type + voice in parts.
        setCustomReason(prev => (prev ? `${prev}\n${finalText}` : finalText));
      }
      toast({
        title: "Recording Stopped",
        description: "Transcription captured.",
      });
    }
  };

  // inside ReasonPage.tsx
  const API_BASE = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/+$/, "");

  const handleSubmit = async () => {
    if (selectedReasons.length === 0 && !customReason.trim()) {
      toast({ variant: "destructive", title: "Reason Required", description: "Please select at least one reason or describe your condition." });
      return;
    }

    setLoading(true);
    try {
      const patientId = sessionStorage.getItem("kioskPatientId") || "";
      const appointmentId = sessionStorage.getItem("kioskSelectedAppointmentId") || "";

      // Save local (as you already do)
      const visitData = {
        reasons: selectedReasons,
        customReason: customReason.trim(),
        voice: { used: isRecording || Boolean(customReason.trim()), lang: whisperLang || "auto" },
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem("medmitra-visit-reason", JSON.stringify(visitData));

      // Send to backend (attach to appointment)
      if (patientId && appointmentId) {
        await fetch(`${API_BASE}/api/kiosk/appointments/attach`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            appointmentId,
            kiosk: {
              reason: {
                selected: selectedReasons,
                custom: customReason.trim(),
                voice: { used: isRecording || Boolean(customReason.trim()), lang: whisperLang || "auto" },
              }
            }
          }),
          credentials: "include",
        }).catch(() => {});
      }

      // Decide next step:
      // - Walk-in → always go to Payment
      // - Identify → Payment if appointment is unpaid, otherwise Token
      const flow = (sessionStorage.getItem("kioskFlow") || "identify") as "walkin" | "identify";

      let nextPath = "/token";
      if (flow === "walkin") {
        nextPath = "/payment";
      } else {
        // identify flow: inspect selected appointment for payment status
        try {
          const raw = sessionStorage.getItem("kioskSelectedAppointmentRaw");
          if (raw) {
            const appt = JSON.parse(raw);
            const status = String(
              (appt?.payment?.status || appt?.status || "")
            ).toUpperCase();
            const isUnpaid = status === "PENDING" || status === "UNPAID";
            if (isUnpaid) {
              nextPath = "/payment";
            }
          }
        } catch {
          // if something goes wrong, default (/token) is safe
        }
      }

      toast({ title: "Visit Reason Recorded", description: "Proceeding to check-in process." });
      navigate(nextPath);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to save reason", description: e?.message || "Please try again." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <KioskLayout title="Reason for Visit">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <MessageSquare className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-primary mb-4">
            What brings you here today?
          </h1>
          <p className="text-lg text-muted-foreground">
            Please select the reason(s) for your visit to help us serve you better
          </p>
        </div>

        {/* Reason Categories */}
        {categories.map(category => (
          <Card key={category} className="mb-6 p-6">
            <h2 className="text-xl font-semibold mb-4 text-foreground">{category}</h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {reasonOptions
                .filter(option => option.category === category)
                .map(option => {
                  const isSelected = selectedReasons.includes(option.id);
                  const IconComponent = option.icon;

                  return (
                    <Button
                      key={option.id}
                      variant={isSelected ? "default" : "outline"}
                      className={`h-auto p-4 flex flex-col items-center gap-3 transition-all duration-200 ${
                        isSelected ? "shadow-button" : "hover:shadow-card"
                      }`}
                      onClick={() => toggleReason(option.id)}
                    >
                      <IconComponent className="h-6 w-6" />
                      <span className="text-sm font-medium text-center">
                        {option.title}
                      </span>
                      {isSelected && (
                        <Badge variant="secondary" className="text-xs">
                          Selected
                        </Badge>
                      )}
                    </Button>
                  );
                })}
            </div>
          </Card>
        ))}

        {/* Custom Reason */}
        <Card className="mb-8 p-6">
          <h2 className="text-xl font-semibold mb-4 text-foreground">
            Other / Additional Details
          </h2>

          <div className="space-y-4">
            <div className="relative">
              <Textarea
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Please describe your condition or symptoms in your own words..."
                className="min-h-[120px] text-base pr-12"
              />

              <Button
                type="button"
                size="sm"
                variant={isRecording ? "destructive" : "outline"}
                className={`absolute top-3 right-3 ${isRecording ? "animate-pulse" : ""}`}
                onClick={handleMicClick}
                disabled={isProcessing}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mic className="h-4 w-4" />
              <span>
                {isRecording
                  ? (isProcessing ? "Recording… (finalizing…)" : "Recording… Click the mic to stop")
                  : "Click the mic to record and auto-transcribe your voice"}
              </span>
              {error && <span className="text-red-600"> • {error}</span>}
            </div>
          </div>

          <p className="text-sm text-muted-foreground mt-4">
            You can provide additional details about your symptoms, previous treatments,
            or any other relevant information by typing or using voice recording.
          </p>
        </Card>

        {/* Selected Summary */}
        {selectedReasons.length > 0 && (
          <Card className="mb-6 p-4 bg-primary/5 border-primary/20">
            <h3 className="font-medium mb-3">Selected Reasons:</h3>
            <div className="flex flex-wrap gap-2">
              {selectedReasons.map(reasonId => {
                const reason = reasonOptions.find(opt => opt.id === reasonId);
                return (
                  <Badge key={reasonId} variant="default" className="text-sm">
                    {reason?.title}
                  </Badge>
                );
              })}
            </div>
          </Card>
        )}

        {/* Document Upload Section */}
        {!showDocumentUpload ? (
          <Card className="p-6 mb-6 bg-accent/5 border border-accent/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-accent/10 rounded-full p-3">
                  <Upload className="h-6 w-6 text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Upload Medical Documents</h3>
                  <p className="text-sm text-muted-foreground">Share previous reports to help your doctor</p>
                </div>
              </div>
              <Button
                onClick={() => setShowDocumentUpload(true)}
                variant="outline"
                className="border-accent text-accent hover:bg-accent hover:text-accent-foreground"
              >
                Upload Documents
              </Button>
            </div>
          </Card>
        ) : (
          <div className="mb-6">
            {/* Pull the patientId from sessionStorage (set by Identify/Walkin pages) */}
            <DocumentUploadQR
              patientId={sessionStorage.getItem("kioskPatientId") || ""}
              onSkip={() => setShowDocumentUpload(false)}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            onClick={handleSubmit}
            size="lg"
            disabled={loading || (selectedReasons.length === 0 && !customReason.trim())}
            className="flex-1 text-xl py-6 h-auto"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Plus className="h-5 w-5 mr-2" />
                Continue to Check-in
              </>
            )}
          </Button>

          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            size="lg"
            disabled={loading}
            className="text-lg py-6 h-auto"
          >
            {t("common.back")}
          </Button>
        </div>

        {/* Helper Text */}
        <Card className="mt-6 p-4 bg-muted/30 border-0">
          <p className="text-sm text-muted-foreground text-center">
            <strong>Privacy Note:</strong> This information helps our medical staff prepare for your visit
            and ensure you receive appropriate care. All details are kept confidential.
          </p>
        </Card>
      </div>
    </KioskLayout>
  );
}
