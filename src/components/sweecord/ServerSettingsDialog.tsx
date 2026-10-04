import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Hash, ImageIcon, Trash2, UserMinus, Volume2 } from "lucide-react";
import { uploadServerImage } from "@/lib/sweecord";

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
import type { Channel, ChannelCategory, ChannelRolePerm, Server, ServerMember, ServerRole } from "@/lib/sweecord";
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
  categories,
  channelPerms = [],
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
  categories: ChannelCategory[];
  channelPerms?: ChannelRolePerm[];
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
    qc.invalidateQueries({ queryKey: ["channel-categories", server.id] });
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
    const { error } = await supabase.rpc("set_member_role", {
      _server_id: server.id,
      _user_id: member.user_id,
      _role_id: role.id,
      _on: !has,
    });
    if (error) {
      toast.error("Rol ataması başarısız");
      return;
    }
    toast.success(has ? "Rol kaldırıldı" : "Rol verildi");
    invalidate();
  }

  async function onImage(e: React.ChangeEvent<HTMLInputElement>, kind: "icon" | "banner"): Promise<void> {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !server) return;
    setBusy(true);
    try {
      const url = await uploadServerImage(server.id, kind, file);
      const patch = kind === "icon" ? { icon_url: url } : { banner_url: url };
      const { error } = await supabase.from("servers").update(patch).eq("id", server.id);
      if (error) throw error;
      toast.success(kind === "icon" ? "Simge güncellendi" : "Banner güncellendi");
      invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Yüklenemedi");
    } finally {
      setBusy(false);
    }
  }

  async function clearImage(kind: "icon" | "banner"): Promise<void> {
    if (!server) return;
    const patch = kind === "icon" ? { icon_url: null } : { banner_url: null };
    const { error } = await supabase.from("servers").update(patch).eq("id", server.id);
    if (error) toast.error("Kaldırılamadı");
    else invalidate();
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

  async function renameCategory(category: ChannelCategory): Promise<void> {
    const input = window.prompt("Kategori adı", category.name);
    if (input === null || !input.trim()) return;
    const { error } = await supabase.from("channel_categories").update({ name: input.trim().slice(0, 50) }).eq("id", category.id);
    if (error) toast.error("Kategori güncellenemedi");
    else invalidate();
  }

  async function deleteCategory(category: ChannelCategory): Promise<void> {
    if (!window.confirm(`"${category.name}" kategorisi silinsin mi? Kanallar kategorisiz kalacak.`)) return;
    const { error } = await supabase.from("channel_categories").delete().eq("id", category.id);
    if (error) toast.error("Kategori silinemedi");
    else invalidate();
  }

  async function moveChannel(channel: Channel, categoryId: string): Promise<void> {
    const { error } = await supabase.from("channels").update({ category_id: categoryId || null }).eq("id", channel.id);
    if (error) toast.error("Kanal taşınamadı");
    else invalidate();
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
                    <Label>Banner ve simge (GIF desteklenir)</Label>
                    <div className="relative overflow-hidden rounded-lg bg-background">
                      {server.banner_url ? (
                        <img src={server.banner_url} alt="" className="h-32 w-full object-cover" />
                      ) : (
                        <div className="h-32 w-full bg-primary/30" />
                      )}
                      <div className="absolute bottom-2 left-3 size-16 overflow-hidden rounded-2xl border-4 border-card bg-card">
                        {server.icon_url ? (
                          <img src={server.icon_url} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center font-semibold">
                            {server.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="secondary" disabled={busy} asChild>
                          <label className="cursor-pointer">
                            <ImageIcon className="size-4" /> Simge yükle
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onImage(e, "icon")} />
                          </label>
                        </Button>
                        <Button size="sm" variant="secondary" disabled={busy} asChild>
                          <label className="cursor-pointer">
                            <ImageIcon className="size-4" /> Banner yükle
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => onImage(e, "banner")} />
                          </label>
                        </Button>
                        {server.icon_url && (
                          <Button size="sm" variant="ghost" onClick={() => clearImage("icon")}>Simgeyi kaldır</Button>
                        )}
                        {server.banner_url && (
                          <Button size="sm" variant="ghost" onClick={() => clearImage("banner")}>Bannerı kaldır</Button>
                        )}
                      </div>
                    )}
                  </div>
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
                          <RoleColorPicker value={r.color} onChange={(c) => updateRole(r.id, { color: c })} />
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
                  {categories.map((category) => (
                    <div key={category.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold">{category.name}</span>
                      {canManageChannels && <>
                        <Button size="sm" variant="ghost" onClick={() => renameCategory(category)}>Yeniden adlandır</Button>
                        <Button size="icon" variant="ghost" aria-label={`${category.name} kategorisini sil`} onClick={() => deleteCategory(category)}><Trash2 className="size-4" /></Button>
                      </>}
                    </div>
                  ))}
                  {channels.map((c) => (
                    <div key={c.id}>
                    <ChannelRow
                      channel={c}
                      roles={roles}
                      perms={channelPerms.filter((p) => p.channel_id === c.id)}
                      canManage={canManageChannels}
                      onRename={() => renameChannel(c)}
                      onDelete={() => deleteChannel(c)}
                      onChanged={() => {
                        invalidate();
                        qc.invalidateQueries({ queryKey: ["channel-perms", server.id] });
                      }}
                    />
                    {canManageChannels && <select aria-label={`${c.name} kategorisi`} value={c.category_id ?? ""} onChange={(e) => moveChannel(c, e.target.value)} className="mb-2 ml-3 rounded border border-border bg-input px-2 py-1 text-xs text-foreground">
                      <option value="">Kategorisiz</option>
                      {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                    </select>}
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
                        {isOwner && roles.length > 0 && (
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

function ChannelRow({
  channel: c,
  roles,
  perms,
  canManage,
  onRename,
  onDelete,
  onChanged,
}: {
  channel: Channel;
  roles: ServerRole[];
  perms: ChannelRolePerm[];
  canManage: boolean;
  onRename: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  async function setEveryone(key: "everyone_view" | "everyone_send", v: boolean) {
    const { error } = await supabase.from("channels").update(key === "everyone_view" ? { everyone_view: v } : { everyone_send: v }).eq("id", c.id);
    if (error) toast.error("İzin kaydedilemedi");
    onChanged();
  }

  async function setRole(roleId: string, key: "can_view" | "can_send", v: boolean) {
    const cur = perms.find((p) => p.role_id === roleId);
    const row = {
      channel_id: c.id,
      role_id: roleId,
      can_view: cur?.can_view ?? false,
      can_send: cur?.can_send ?? false,
    };
    row[key] = v;
    if (key === "can_send" && v) row.can_view = true;
    const { error } = await supabase.from("channel_role_perms").upsert(row, { onConflict: "channel_id,role_id" });
    if (error) toast.error("İzin kaydedilemedi");
    onChanged();
  }

  return (
    <div className="rounded hover:bg-accent/30">
      <div className="flex items-center gap-2 px-2 py-2">
        {c.type === "voice" ? (
          <Volume2 className="size-4 text-muted-foreground" />
        ) : (
          <Hash className="size-4 text-muted-foreground" />
        )}
        <span className="flex-1 truncate text-sm">{c.name}</span>
        {canManage && (
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
              İzinler
            </Button>
            <Button size="sm" variant="ghost" onClick={onRename}>
              Yeniden adlandır
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </>
        )}
      </div>
      {open && canManage && (
        <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
          <p className="text-xs text-muted-foreground">
            Sahip ve "Kanalları yönet" izni olanlar her zaman erişebilir.
          </p>
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-2">
            <span className="text-xs font-bold uppercase text-muted-foreground">Kim</span>
            <span className="text-xs font-bold uppercase text-muted-foreground">Görebilir</span>
            <span className="text-xs font-bold uppercase text-muted-foreground">Yazabilir</span>
            <span>@herkes</span>
            <Switch checked={c.everyone_view} onCheckedChange={(v) => setEveryone("everyone_view", v)} />
            <Switch checked={c.everyone_send} onCheckedChange={(v) => setEveryone("everyone_send", v)} />
            {roles.map((r) => {
              const p = perms.find((x) => x.role_id === r.id);
              return (
                <div key={r.id} className="contents">
                  <span style={{ color: r.color }}>{r.name}</span>
                  <Switch checked={!!p?.can_view} onCheckedChange={(v) => setRole(r.id, "can_view", v)} />
                  <Switch checked={!!p?.can_send} onCheckedChange={(v) => setRole(r.id, "can_send", v)} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const HEX_RE = /^#[0-9a-f]{6}$/i;

/** Discord-like custom color: native picker swatch plus editable HEX; commits on release/blur. */
function RoleColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const custom = !COLORS.includes(value.toLowerCase());
  const commit = (c: string) => {
    const v = c.toLowerCase();
    if (HEX_RE.test(v) && v !== value.toLowerCase()) onChange(v);
    else setDraft(value);
  };
  return (
    <div className="flex items-center gap-1.5">
      <label
        className={cn("relative size-6 cursor-pointer overflow-hidden rounded-full border border-border ring-offset-2 ring-offset-background", custom && "ring-2 ring-foreground")}
        style={{ backgroundColor: HEX_RE.test(draft) ? draft : value }}
        title="Özel renk"
      >
        <input
          type="color"
          aria-label="Özel renk seç"
          value={HEX_RE.test(draft) ? draft : "#99aab5"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <input
        aria-label="HEX renk"
        value={draft}
        maxLength={7}
        onChange={(e) => setDraft(e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(draft); }}
        className="h-6 w-20 rounded border border-border bg-background px-1.5 font-mono text-xs"
      />
    </div>
  );
}
