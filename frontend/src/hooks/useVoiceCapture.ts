// frontend/src/hooks/useVoiceCapture.ts
import { useCallback, useRef, useState } from "react";
// @ts-ignore: RecordRTC ships its own types
import RecordRTC from "recordrtc";

const SLICE_MS = 5000;      // used only in "stream" mode
const TARGET_RATE = 16000;  // STT-friendly (Whisper/4o-transcribe)

// ----- BEGIN robust API base resolution -----
const runtimeOverride =
  // highest priority: window global (you can inject from index.html if needed)
  (window as any).__API_BASE_URL__ ||
  // or a querystring override: ?api=https://backend.onrender.com
  new URLSearchParams(location.search).get("api") ||
  // or a localStorage override for quick testing
  localStorage.getItem("API_BASE_URL_OVERRIDE") ||
  "";

const rawBase =
  runtimeOverride ||
  (import.meta as any)?.env?.VITE_API_BASE ||
  (import.meta as any)?.env?.VITE_API_BASE_URL ||
  "";

// only allow localhost fallback when you're truly on localhost
const API_BASE_URL = (
  rawBase
).replace(/\/+$/, "");

console.log("[voice] API_BASE_URL:", API_BASE_URL);
if (!API_BASE_URL && location.hostname !== "localhost") {
  console.warn("[voice] Missing API base. Set VITE_API_BASE(_URL) or use ?api= override.");
}
// ----- END robust API base resolution -----


/** Map UI language to ISO-639-1 hints for the STT endpoint. */
export function mapUiLangToWhisper(lang?: string): string | undefined {
  const m: Record<string, string> = {
    en: "en", hi: "hi", bn: "bn", ta: "ta", te: "te",
    mr: "mr", gu: "gu", kn: "kn", ml: "ml", pa: "pa",
  };
  if (!lang) return undefined;
  const lc = lang.toLowerCase();
  return m[lc] ?? m[lc.split("-")[0]];
}

/** Downsample any audio Blob to PCM16 mono 16k WAV. */
async function downsampleTo16kMonoWav(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const AudioCtx =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ac = new AudioCtx();

  const srcBuf = await ac.decodeAudioData(arrayBuf);

  // Render to 16k mono
  const offline = new OfflineAudioContext(
    1,
    Math.ceil(srcBuf.duration * TARGET_RATE),
    TARGET_RATE
  );

  // downmix to mono buffer at src rate
  const monoSrc = offline.createBuffer(1, srcBuf.length, srcBuf.sampleRate);
  const mdata = monoSrc.getChannelData(0);
  const L = srcBuf.getChannelData(0);
  if (srcBuf.numberOfChannels > 1) {
    const R = srcBuf.getChannelData(1);
    for (let i = 0; i < L.length; i++) mdata[i] = (L[i] + R[i]) / 2;
  } else {
    mdata.set(L);
  }
  const node = offline.createBufferSource();
  node.buffer = monoSrc;
  node.connect(offline.destination);
  node.start(0);

  const rendered = await offline.startRendering();

  // Encode PCM16LE WAV
  const data = rendered.getChannelData(0);
  const bytesPerSample = 2;
  const blockAlign = 1 * bytesPerSample;
  const byteRate = TARGET_RATE * blockAlign;

  const buffer = new ArrayBuffer(44 + data.length * bytesPerSample);
  const view = new DataView(buffer);

  function writeString(v: DataView, off: number, s: string) {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  }
  let off = 0;
  writeString(view, off, "RIFF"); off += 4;
  view.setUint32(off, 36 + data.length * 2, true); off += 4;
  writeString(view, off, "WAVE"); off += 4;
  writeString(view, off, "fmt "); off += 4;
  view.setUint32(off, 16, true); off += 4; // PCM header size
  view.setUint16(off, 1, true);  off += 2; // PCM
  view.setUint16(off, 1, true);  off += 2; // mono
  view.setUint32(off, TARGET_RATE, true); off += 4;
  view.setUint32(off, byteRate, true);    off += 4;
  view.setUint16(off, blockAlign, true);  off += 2;
  view.setUint16(off, 16, true);          off += 2; // bits
  writeString(view, off, "data"); off += 4;
  view.setUint32(off, data.length * 2, true); off += 4;
  for (let i = 0; i < data.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

// ---------------- Types ----------------
type Mode = "oneshot" | "stream";

type UseVoiceCaptureOpts = {
  mode?: Mode;
  /** Streaming mode only: called per transcribed slice. */
  onText?: (segmentText: string) => void;
  /** Language hint passed to backend as ?lang=xx. */
  whisperLang?: string;
  /** Optional: upload each chunk (stream mode) for archival. */
  audioSink?: (chunk: Blob, seq: number) => Promise<void>;
};

type UseVoiceCaptureReturn = {
  start: () => Promise<void>;
  /** 
   * stop(): 
   *  - returns the FINAL transcript string in "oneshot" mode
   *  - returns undefined in "stream" mode 
   */
  stop: () => Promise<string | undefined>;
  isRecording: boolean;
  isProcessing: boolean;
  error: string;
};

// --------------- Hook -------------------
export default function useVoiceCapture({
  mode = "oneshot",
  onText,
  whisperLang,
  audioSink,
}: UseVoiceCaptureOpts): UseVoiceCaptureReturn {
  const recorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const seqRef = useRef<number>(0);
  const fullBlobRef = useRef<Blob | null>(null); // oneshot

  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>("");

  const start = useCallback(async () => {
    setError("");
    seqRef.current = 0;
    fullBlobRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (mode === "stream") {
        const recorder = new (RecordRTC as any)(stream, {
          type: "audio",
          mimeType: "audio/wav",
          recorderType: (RecordRTC as any).StereoAudioRecorder,
          timeSlice: SLICE_MS,
          ondataavailable: async (blob: Blob) => {
            if (!blob || blob.size < 1024) return;
            setIsProcessing(true);
            try {
              const wav16k = await downsampleTo16kMonoWav(blob);

              if (audioSink) {
                await audioSink(wav16k, seqRef.current);
              }

              // STT
            const fd = new FormData();
            fd.append("file", wav16k, `seg_${seqRef.current}.wav`);
            const qs = whisperLang ? `?lang=${encodeURIComponent(whisperLang)}` : "";
            const resp = await fetch(`${API_BASE_URL}/api/transcribe-audio${qs}`, {
              method: "POST",
              body: fd,
            });
            if (!resp.ok) {
              const txt = await resp.text().catch(() => "");
              throw new Error(
                `STT ${resp.status} at ${API_BASE_URL}/api/transcribe-audio: ${txt || "not found"}`
              );
            }
            const json = (await resp.json()) as { transcript?: string };
            const segText = (json.transcript || "").trim();
            if (segText) onText?.(segText);
            seqRef.current += 1;

            } catch (e: any) {
              console.error(e);
              setError(e?.message || "Transcription failed.");
            } finally {
              setIsProcessing(false);
            }
          },
        });
        recorderRef.current = recorder;
        recorder.startRecording();
      } else {
        // ONESHOT: no timeSlice. We capture a single blob at stop.
        const recorder = new (RecordRTC as any)(stream, {
          type: "audio",
          mimeType: "audio/wav",
          recorderType: (RecordRTC as any).StereoAudioRecorder,
        });
        recorderRef.current = recorder;
        recorder.startRecording();
      }

      setIsRecording(true);
    } catch (e: any) {
      console.error("Mic error:", e);
      setError("Could not access microphone.");
    }
  }, [audioSink, mode, onText, whisperLang]);

  const stop = useCallback(async (): Promise<string | undefined> => {
    setIsRecording(false);

    let finalText: string | undefined;

    try {
      if (recorderRef.current) {
        await new Promise<void>((resolve) => {
          try {
            recorderRef.current.stopRecording(async () => {
              if (mode === "oneshot") {
                try {
                  const raw: Blob = recorderRef.current.getBlob();
                  fullBlobRef.current = raw;

                  setIsProcessing(true);
                  const wav16k = await downsampleTo16kMonoWav(raw);

                  const fd = new FormData();
                  fd.append("file", wav16k, "full.wav");
                  const qs = whisperLang ? `?lang=${encodeURIComponent(whisperLang)}` : "";
                  const resp = await fetch(`${API_BASE_URL}/api/transcribe-audio${qs}`, {
                    method: "POST",
                    body: fd,
                  });
                  if (!resp.ok) {
                    const txt = await resp.text().catch(() => "");
                    throw new Error(
                      `STT ${resp.status} at ${API_BASE_URL}/api/transcribe-audio: ${txt || "not found"}`
                    );
                  }
                  const json = (await resp.json()) as { transcript?: string };
                  finalText = (json.transcript || "").trim();

                } catch (e: any) {
                  console.error(e);
                  setError(e?.message || "Transcription failed.");
                } finally {
                  setIsProcessing(false);
                }
              }
              resolve();
            });
          } catch {
            // ignore
            resolve();
          }
        });
      }
    } finally {
      // cleanup media
      recorderRef.current?.destroy?.();
      recorderRef.current = null;
      streamRef.current?.getTracks()?.forEach((t) => t.stop());
      streamRef.current = null;
    }

    // In stream mode we have already emitted segments via onText
    return finalText;
  }, [mode, whisperLang]);

  return { start, stop, isRecording, isProcessing, error };
}
