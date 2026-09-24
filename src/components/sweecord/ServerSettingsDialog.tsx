import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Hash, Trash2, UserMinus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import type { Channel, Server, ServerMember, ServerRole } from "@/lib/sweecord";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

type Member = ServerMember;

type Section = "overview" | "roles" | "channels" | "members";

const COLORS = ["#99aab5", "#1abc9c", "#2ecc71", "#3498db", "#9b59b6", "#e91e63", "#f1c40f", "#e67e22", "#e74c3c"];
const PERMS: { key: "manage_channels" | "manage_messages" | "kick_members"; label: string }[] = [
  { key: "manage_channels", label: "Kanalları yönet" },
  { key: "manage_messages", label: "Mesajları yönet" },
  { key: "kick_members", label: "Üyeleri at" },
];

export function ServerSettingsDialog({
  open,
  onOpenChange,
  server,
  channels,
  members,
  roles,
  isOwner,
  canKick,
  canManageChannels,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: Server | null;
  channels: Channel[];
  members: Member[];
  roles: ServerRole[];
  isOwner: boolean;
  canKick: boolean;
  canManageChannels: boolean;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("overview");
  const [name, setName] = useState(server?.name ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(server?.name ?? "");
  }, [server?.id, server?.name]);

  if (!server) return null;

  function invalidate() {
    if (!server) return;
    qc.invalidateQueries({ queryKey: ["servers"] });
    qc.invalidateQueries({ queryKey: ["channels", server.id] });
    qc.invalidateQueries({ queryKey: ["members", server.id] });
    qc.invalidateQueries({ queryKey: ["roles", server.id] });
  }

  async function createRole(): Promise<void> {
    if (!server) return;
    const { error } = await supabase
      .from("server_roles")
      .insert({ server_id: server.id, name: "yeni rol", position: roles.length });
    if (error) {
      toast.error("Rol oluşturulamadı");
      return;
    }
    invalidate();
  }

  async function updateRole(id: string, patch: Partial<ServerRole>): Promise<void> {
    const { error } = await supabase.from("server_roles").update(patch).eq("id", id);
    if (error) {
      toast.error("Rol güncellenemedi");
      return;
    }
    invalidate();
  }

  async function renameRole(role: ServerRole): Promise<void> {
    const input = window.prompt("Rol adı", role.name);
    if (input === null) return;
    const clean = input.trim().slice(0, 32);
    if (!clean) return;
    await updateRole(role.id, { name: clean });
  }

  async function deleteRole(role: ServerRole): Promise<void> {
    if (!window.confirm(`"${role.name}" rolü silinsin mi?`)) return;
    const { error } = await supabase.from("server_roles").delete().eq("id", role.id);
    if (error) {
      toast.error("Rol silinemedi");
      return;
    }
    invalidate();
  }

  async function toggleMemberRole(member: Member, role: ServerRole): Promise<void> {
    if (!server) return;
    const has = member.role_ids.includes(role.id);
    const { error } = has
      ? await supabase.from("member_roles").delete().eq("user_id", member.user_id).eq("role_id", role.id)
      : await supabase.from("member_roles").insert({ server_id: server.id, user_id: member.user_id, role_id: role.id });
    if (error) {
      toast.error("Rol ataması başarısız");
      return;
    }
    invalidate();
  }

  async function saveName(): Promise<void> {
    if (!server) return;
    const clean = name.trim().slice(0, 50);
    if (clean.length < 2) {
      toast.error("Sunucu adı en az 2 karakter olmalı");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("servers").update({ name: clean }).eq("id", server.id);
    setBusy(false);
    if (error) {
      toast.error("Kaydedilemedi");
      return;
    }
    toast.success("Sunucu adı güncellendi");
    invalidate();
  }

  async function renameChannel(channel: Channel): Promise<void> {
    const input = window.prompt("Yeni kanal adı", channel.name);
    if (input === null) return;
    const clean = input.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9çğıöşü_-]/g, "").slice(0, 30);
    if (clean.length < 2) {
      toast.error("Kanal adı en az 2 karakter olmalı");
      return;
    }
    const { error } = await supabase.from("channels").update({ name: clean }).eq("id", channel.id);
    if (error) {
      toast.error("Kanal güncellenemedi");
      return;
    }
    toast.success("Kanal güncellendi");
    invalidate();
  }

  async function deleteChannel(channel: Channel): Promise<void> {
    if (!window.confirm(`#${channel.name} kanalı ve mesajları silinsin mi?`)) return;
    const { error } = await supabase.from("channels").delete().eq("id", channel.id);
    if (error) {
      toast.error("Kanal silinemedi");
      return;
    }
    toast.success("Kanal silindi");
    invalidate();
  }

  async function kick(member: Member): Promise<void> {
    if (!server) return;
    const label = member.profiles?.display_name || member.profiles?.username || "Üye";
    if (!window.confirm(`${label} sunucudan atılsın mı?`)) return;
    const { error } = await supabase
      .from("server_members")
      .delete()
      .eq("server_id", server.id)
      .eq("user_id", member.user_id);
    if (error) {
      toast.error("Üye çıkarılamadı");
      return;
    }
    toast.success("Üye sunucudan çıkarıldı");
    invalidate();
  }

  async function deleteServer(): Promise<void> {
    if (!server) return;
    if (!window.confirm(`"${server.name}" sunucusu kalıcı olarak silinsin mi?`)) return;
    const { error } = await supabase.from("servers").delete().eq("id", server.id);
    if (error) {
      toast.error("Sunucu silinemedi");
      return;
    }
    toast.success("Sunucu silindi");
    onOpenChange(false);
    onDeleted();
  }

  const sections: { key: Section; label: string }[] = [
    { key: "overview", label: "Genel Bakış" },
    { key: "roles", label: "Roller" },
    { key: "channels", label: "Kanallar" },
    { key: "members", label: "Üyeler" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden bg-card p-0 sm:max-w-3xl">
        <div className="flex max-h-[85vh]">
          <nav className="hidden w-48 shrink-0 flex-col gap-1 bg-sidebar p-3 sm:flex">
            <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Sunucu ayarları
            </p>
            {sections.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  "rounded px-2 py-1.5 text-left text-sm transition-colors",
                  section === s.key
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 p-6">
            <DialogHeader className="pb-4 text-left">
              <DialogTitle>{server.name}</DialogTitle>
              <DialogDescription>
                {isOwner ? "Sunucunu buradan yönet." : "Sunucu bilgilerini görüntüle."}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh] pr-2">
              {section === "overview" && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="srv-name">Sunucu adı</Label>
                    <div className="flex gap-2">
                      <Input
                        id="srv-name"
                        value={name}
                        maxLength={50}
                        disabled={!isOwner}
                        onChange={(e) => setName(e.target.value)}
                        className="border-0 bg-input"
                      />
                      {isOwner && (
                        <Button onClick={saveName} disabled={busy}>
                          Kaydet
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Davet kodu</Label>
                    <div className="flex items-center gap-2 rounded-md bg-input px-3 py-2">
                      <code className="flex-1 font-mono text-sm">{server.invite_code}</code>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(server.invite_code);
                          toast.success("Kod kopyalandı");
                        }}
                      >
                        <Copy className="size-4" /> Kopyala
                      </Button>
                    </div>
                  </div>

                  {isOwner && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-destructive">Tehlikeli bölge</Label>
                        <p className="text-sm text-muted-foreground">
                          Sunucuyu silersen tüm kanallar ve mesajlar kalıcı olarak kaybolur.
                        </p>
                        <Button variant="destructive" onClick={deleteServer}>
                          <Trash2 className="size-4" /> Sunucuyu sil
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {section === "roles" && (
                <div className="space-y-3">
                  {isOwner && (
                    <Button size="sm" onClick={createRole}>
                      Rol oluştur
                    </Button>
                  )}
                  {roles.length === 0 && <p className="text-sm text-muted-foreground">Henüz rol yok.</p>}
                  {roles.map((r) => (
                    <div key={r.id} className="space-y-3 rounded-md bg-background p-3">
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className="flex-1 truncate text-sm font-semibold" style={{ color: r.color }}>
                          {r.name}
                        </span>
                        {isOwner && (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => renameRole(r)}>
                              Yeniden adlandır
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => deleteRole(r)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                      {isOwner && (
                        <div className="flex flex-wrap gap-1.5">
                          {COLORS.map((c) => (
                            <button
                              key={c}
                              onClick={() => updateRole(r.id, { color: c })}
                              aria-label={`Renk ${c}`}
                              className={cn("size-6 rounded-full ring-offset-2 ring-offset-background", r.color === c && "ring-2 ring-foreground")}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                      )}
                      <div className="space-y-2">
                        {PERMS.map((perm) => (
                          <label key={perm.key} className="flex items-center justify-between text-sm">
                            {perm.label}
                            <Switch
                              checked={r[perm.key]}
                              disabled={!isOwner}
                              onCheckedChange={(v) => updateRole(r.id, { [perm.key]: v })}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {section === "channels" && (
                <div className="space-y-1">
                  {channels.map((c) => (
                    <div key={c.id} className="flex items-center gap-2 rounded px-2 py-2 hover:bg-accent/50">
                      <Hash className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate text-sm">{c.name}</span>
                      {canManageChannels && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => renameChannel(c)}>
                            Yeniden adlandır
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => deleteChannel(c)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                  {channels.length === 0 && (
                    <p className="text-sm text-muted-foreground">Henüz kanal yok.</p>
                  )}
                </div>
              )}

              {section === "members" && (
                <div className="space-y-1">
                  {members.map((m) => {
                    const label = m.profiles?.display_name || m.profiles?.username || "Üye";
                    return (
                      <div key={m.user_id} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-accent/50">
                        <UserAvatar name={label} url={m.profiles?.avatar_url ?? null} className="size-9" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{label}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {m.role === "owner" ? "Sunucu sahibi" : `@${m.profiles?.username}`}
                          </p>
                        </div>
                        {isOwner && m.role !== "owner" && roles.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {roles.map((r) => {
                              const on = m.role_ids.includes(r.id);
                              return (
                                <button
                                  key={r.id}
                                  onClick={() => toggleMemberRole(m, r)}
                                  className={cn("rounded px-1.5 py-0.5 text-xs", on ? "bg-accent" : "text-muted-foreground opacity-60 hover:opacity-100")}
                                  style={on ? { color: r.color } : undefined}
                                >
                                  {r.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {canKick && m.role !== "owner" && (
                          <Button size="icon" variant="ghost" onClick={() => kick(m)} title="Sunucudan at">
                            <UserMinus className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
