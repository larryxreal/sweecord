import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import { slugifyUsername, uploadAvatar, type Profile } from "@/lib/sweecord";

export function ProfileDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profile: Profile;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [status, setStatus] = useState(profile.status);
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setDisplayName(profile.display_name);
    setUsername(profile.username);
    setStatus(profile.status);
    setAvatarUrl(profile.avatar_url);
  }, [open, profile]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Dosya 5 MB'dan küçük olmalı");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(profile.id, file);
      setAvatarUrl(url);
    } catch {
      toast.error("Fotoğraf yüklenemedi");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const name = slugifyUsername(username);
    if (name.length < 3) {
      toast.error("Kullanıcı adı en az 3 karakter olmalı");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        username: name,
        display_name: displayName.trim().slice(0, 40) || name,
        status: status.trim().slice(0, 120),
        avatar_url: avatarUrl,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast.error(
        error.message.includes("duplicate") ? "Bu kullanıcı adı alınmış" : "Profil kaydedilemedi",
      );
      return;
    }
    toast.success("Profil güncellendi");
    onSaved();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profilim</DialogTitle>
          <DialogDescription>Seni diğer üyelerin nasıl göreceğini belirle.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <UserAvatar name={displayName || username} url={avatarUrl} className="size-16" />
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              Fotoğraf yükle
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">PNG veya JPG, en fazla 5 MB.</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="display">Görünen ad</Label>
          <Input id="display" value={displayName} maxLength={40} onChange={(e) => setDisplayName(e.target.value)} className="border-0 bg-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="username">Kullanıcı adı</Label>
          <Input id="username" value={username} maxLength={24} onChange={(e) => setUsername(e.target.value)} className="border-0 bg-input" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Durum</Label>
          <Textarea
            id="status"
            value={status}
            maxLength={120}
            rows={2}
            placeholder="Ne yapıyorsun?"
            onChange={(e) => setStatus(e.target.value)}
            className="resize-none border-0 bg-input"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
