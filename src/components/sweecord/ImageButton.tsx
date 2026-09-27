import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { uploadChatImage } from "@/lib/sweecord";

export function ImageButton({
  userId,
  disabled,
  onUploaded,
}: {
  userId: string;
  disabled?: boolean;
  onUploaded: (url: string) => void | Promise<void>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          try {
            await onUploaded(await uploadChatImage(userId, f));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Fotoğraf yüklenemedi");
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        type="button"
        title="Fotoğraf gönder"
        disabled={disabled || busy}
        onClick={() => ref.current?.click()}
        className="text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
      </button>
    </>
  );
}
