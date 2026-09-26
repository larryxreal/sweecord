import { useEffect, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { toast } from "sonner";

/** Click to start recording, click again to send. X cancels. */
export function VoiceRecorder({ disabled, onRecorded }: { disabled?: boolean; onRecorded: (b: Blob) => void }) {
  const [recording, setRecording] = useState(false);
  const [secs, setSecs] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      cancelRef.current = false;
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        if (cancelRef.current || !chunks.length) return;
        onRecorded(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      };
      rec.start();
      recRef.current = rec;
      setSecs(0);
      setRecording(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 120_000);
    } catch {
      toast.error("Mikrofona erişilemedi");
    }
  }

  function stop(cancel: boolean) {
    cancelRef.current = cancel;
    recRef.current?.stop();
  }

  if (recording) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <span className="size-2 animate-pulse rounded-full bg-destructive" />
        <span className="tabular-nums text-muted-foreground">
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}
        </span>
        <button type="button" onClick={() => stop(true)} title="İptal" className="text-muted-foreground hover:text-destructive">
          <X className="size-5" />
        </button>
        <button type="button" onClick={() => stop(false)} title="Gönder" className="text-primary">
          <Square className="size-5 fill-current" />
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={start}
      title="Sesli mesaj"
      className="text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
    >
      <Mic className="size-5" />
    </button>
  );
}
