import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Hash,
  Plus,
  Settings,
  LogOut,
  Copy,
  Users,
  Trash2,
  MessagesSquare,
  SendHorizonal,
  DoorOpen,
  Volume2,
} from "lucide-react";

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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import { ProfileDialog } from "@/components/sweecord/ProfileDialog";
import { FriendsPanel } from "@/components/sweecord/FriendsPanel";
import { ServerSettingsDialog } from "@/components/sweecord/ServerSettingsDialog";
import { MemberProfileDialog } from "@/components/sweecord/MemberProfileDialog";
import { DMPanel } from "@/components/sweecord/DMPanel";
import { VoiceRecorder } from "@/components/sweecord/VoiceRecorder";
import { ImageButton } from "@/components/sweecord/ImageButton";
import { VoiceRoom } from "@/components/sweecord/VoiceRoom";
import {
  formatTime,
  initials,
  slugifyUsername,
  uploadVoice,
  type Channel,
  type ChannelRolePerm,
  type Message,
  type Profile,
  type Server,
  type ServerMember,
  type ServerRole,
} from "@/lib/sweecord";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Sohbet — SweeCord" },
      { name: "description", content: "Sunucularını, kanallarını ve sohbetlerini yönet." },
      { property: "og:title", content: "Sohbet — SweeCord" },
      { property: "og:description", content: "Sunucularını, kanallarını ve sohbetlerini yönet." },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [serverId, setServerId] = useState<string | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [channelOpen, setChannelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  /* ---------------- profile ---------------- */
  const profileQuery = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (data) return data as Profile;

      const meta = (user.user_metadata ?? {}) as { username?: string; display_name?: string };
      const base = slugifyUsername(meta.username ?? user.email?.split("@")[0] ?? "kullanici") || "kullanici";
      const candidate = `${base}${Math.floor(Math.random() * 9000 + 1000)}`;
      const { data: created, error: insErr } = await supabase
        .from("profiles")
        .insert({
          id: user.id,
          username: base.length >= 3 ? base : candidate,
          display_name: meta.display_name?.trim() || base,
        })
        .select("*")
        .single();
      if (insErr) {
        const { data: retry } = await supabase
          .from("profiles")
          .insert({ id: user.id, username: candidate, display_name: meta.display_name?.trim() || base })
          .select("*")
          .single();
        if (retry) return retry as Profile;
        throw insErr;
      }
      return created as Profile;
    },
  });
  const profile = profileQuery.data;

  /* ---------------- servers ---------------- */
  const serversQuery = useQuery({
    queryKey: ["servers", user.id],
    queryFn: async (): Promise<Server[]> => {
      const { data, error } = await supabase.from("servers").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Server[];
    },
  });
  const servers = useMemo(() => serversQuery.data ?? [], [serversQuery.data]);
  const activeServer = servers.find((s) => s.id === serverId) ?? null;
  const [dmUser, setDmUser] = useState<Profile | null>(null);
  const didInit = useRef(false);

  useEffect(() => {
    if (!didInit.current && servers.length) {
      didInit.current = true;
      if (!serverId) setServerId(servers[0]!.id);
    }
    if (serverId && servers.length && !servers.some((s) => s.id === serverId)) {
      setServerId(servers[0]!.id);
    }
  }, [servers, serverId]);

  /* ---------------- channels ---------------- */
  const channelsQuery = useQuery({
    queryKey: ["channels", serverId],
    enabled: !!serverId,
    queryFn: async (): Promise<Channel[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select("*")
        .eq("server_id", serverId!)
        .order("position")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });
  const channels = useMemo(() => channelsQuery.data ?? [], [channelsQuery.data]);
  const activeChannel = channels.find((c) => c.id === channelId) ?? null;

  useEffect(() => {
    if (!channels.length) {
      setChannelId(null);
      return;
    }
    if (!channelId || !channels.some((c) => c.id === channelId)) setChannelId(channels[0]!.id);
  }, [channels, channelId]);

  /* ---------------- members ---------------- */
  const rolesQuery = useQuery({
    queryKey: ["roles", serverId],
    enabled: !!serverId,
    queryFn: async (): Promise<ServerRole[]> => {
      const { data, error } = await supabase
        .from("server_roles")
        .select("*")
        .eq("server_id", serverId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServerRole[];
    },
  });
  const roles = useMemo(() => rolesQuery.data ?? [], [rolesQuery.data]);

  const membersQuery = useQuery({
    queryKey: ["members", serverId],
    enabled: !!serverId,
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("server_members")
        .select("user_id, role")
        .eq("server_id", serverId!);
      if (error) throw error;
      const ids = (rows ?? []).map((r) => r.user_id);
      if (ids.length === 0) return [];
      const [{ data: profs }, { data: mr }] = await Promise.all([
        supabase.from("profiles").select("id, username, display_name, avatar_url, status").in("id", ids),
        supabase.from("member_roles").select("user_id, role_id").eq("server_id", serverId!),
      ]);
      const pmap = new Map((profs ?? []).map((p) => [p.id, p]));
      return (rows ?? []).map((r) => ({
        user_id: r.user_id,
        role: r.role,
        role_ids: (mr ?? []).filter((x) => x.user_id === r.user_id).map((x) => x.role_id),
        profiles: pmap.get(r.user_id) ?? {
          id: r.user_id,
          username: "kullanici",
          display_name: "",
          avatar_url: null,
          status: "",
        },
      })) as ServerMember[];
    },
  });
  const members = useMemo(() => membersQuery.data ?? [], [membersQuery.data]);
  const memberMap = useMemo(() => {
    const map = new Map<string, { name: string; avatar: string | null; color: string | null }>();
    for (const m of members) {
      const top = roles.find((r) => m.role_ids.includes(r.id));
      map.set(m.user_id, {
        name: m.profiles?.display_name || m.profiles?.username || "Üye",
        avatar: m.profiles?.avatar_url ?? null,
        color: top?.color ?? null,
      });
    }
    return map;
  }, [members, roles]);
  const [viewUserId, setViewUserId] = useState<string | null>(null);
  const viewMember = members.find((m) => m.user_id === viewUserId) ?? null;
  const myPerms = useMemo(() => {
    const me = members.find((m) => m.user_id === user.id);
    const mine = roles.filter((r) => me?.role_ids.includes(r.id));
    return {
      manage_messages: mine.some((r) => r.manage_messages),
      manage_channels: mine.some((r) => r.manage_channels),
      kick_members: mine.some((r) => r.kick_members),
    };
  }, [members, roles, user.id]);

  const channelPermsQuery = useQuery({
    queryKey: ["channel-perms", serverId],
    enabled: !!serverId && channels.length > 0,
    queryFn: async (): Promise<ChannelRolePerm[]> => {
      const { data, error } = await supabase
        .from("channel_role_perms")
        .select("*")
        .in("channel_id", channels.map((c) => c.id));
      if (error) throw error;
      return (data ?? []) as ChannelRolePerm[];
    },
  });
  const channelPerms = channelPermsQuery.data ?? [];

  /* ---------------- messages ---------------- */
  const messagesQuery = useQuery({
    queryKey: ["messages", channelId],
    enabled: !!channelId,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", channelId!)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);

  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`messages-${channelId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["messages", channelId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, channelId]);

  /* ---------------- actions ---------------- */
  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !channelId) return;
    setDraft("");
    const { error } = await supabase
      .from("messages")
      .insert({ channel_id: channelId, user_id: user.id, content: content.slice(0, 2000) });
    if (error) {
      toast.error("Mesaj gönderilemedi");
      setDraft(content);
      return;
    }
    qc.invalidateQueries({ queryKey: ["messages", channelId] });
  }

  async function sendVoice(blob: Blob) {
    if (!channelId) return;
    try {
      const url = await uploadVoice(user.id, blob);
      const { error } = await supabase
        .from("messages")
        .insert({ channel_id: channelId, user_id: user.id, content: "", audio_url: url });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["messages", channelId] });
    } catch {
      toast.error("Sesli mesaj gönderilemedi");
    }
  }

  async function sendImage(url: string) {
    if (!channelId) return;
    const { error } = await supabase
      .from("messages")
      .insert({ channel_id: channelId, user_id: user.id, content: "", image_url: url });
    if (error) toast.error("Fotoğraf gönderilemedi");
    else qc.invalidateQueries({ queryKey: ["messages", channelId] });
  }

  async function deleteMessage(id: string) {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error("Mesaj silinemedi");
    else qc.invalidateQueries({ queryKey: ["messages", channelId] });
  }

  async function leaveServer(): Promise<void> {
    if (!activeServer) return;
    if (activeServer.owner_id === user.id) {
      const { error } = await supabase.from("servers").delete().eq("id", activeServer.id);
      if (error) {
        toast.error("Sunucu silinemedi");
        return;
      }
      toast.success("Sunucu silindi");
    } else {
      const { error } = await supabase
        .from("server_members")
        .delete()
        .eq("server_id", activeServer.id)
        .eq("user_id", user.id);
      if (error) {
        toast.error("Sunucudan çıkılamadı");
        return;
      }
      toast.success("Sunucudan ayrıldın");
    }
    setServerId(null);
    qc.invalidateQueries({ queryKey: ["servers", user.id] });
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (profileQuery.isLoading || !profile) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }

  const isOwner = activeServer?.owner_id === user.id;
  const myRoleIds = members.find((m) => m.user_id === user.id)?.role_ids ?? [];
  const canSend =
    !activeChannel ||
    isOwner ||
    myPerms.manage_channels ||
    (activeChannel.everyone_view && activeChannel.everyone_send) ||
    channelPerms.some((p) => p.channel_id === activeChannel.id && p.can_send && p.can_view && myRoleIds.includes(p.role_id));

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* server rail */}
        <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2 bg-rail py-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setServerId(null)}
                className="rail-pill flex size-12 items-center justify-center bg-primary text-primary-foreground"
              >
                <MessagesSquare className="size-6" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">SweeCord</TooltipContent>
          </Tooltip>
          <Separator className="w-8 bg-border" />
          <ScrollArea className="flex-1 w-full">
            <div className="flex flex-col items-center gap-2 pb-2">
              {servers.map((s) => (
                <Tooltip key={s.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => setServerId(s.id)}
                      className={cn(
                        "rail-pill flex size-12 items-center justify-center overflow-hidden text-sm font-semibold transition-colors",
                        s.id === serverId
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-foreground hover:bg-primary hover:text-primary-foreground",
                      )}
                    >
                      {s.icon_url ? (
                        <img src={s.icon_url} alt={s.name} className="size-full object-cover" />
                      ) : (
                        initials(s.name)
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{s.name}</TooltipContent>
                </Tooltip>
              ))}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="rail-pill flex size-12 items-center justify-center bg-card text-success hover:bg-success hover:text-primary-foreground"
                  >
                    <Plus className="size-6" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sunucu oluştur</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setJoinOpen(true)}
                    className="rail-pill flex size-12 items-center justify-center bg-card text-success hover:bg-success hover:text-primary-foreground"
                  >
                    <DoorOpen className="size-6" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sunucuya katıl</TooltipContent>
              </Tooltip>
            </div>
          </ScrollArea>
        </nav>

        {/* channels sidebar */}
        <aside className="flex w-60 shrink-0 flex-col bg-sidebar">
          {activeServer?.banner_url && (
            <img src={activeServer.banner_url} alt="" className="h-28 w-full shrink-0 object-cover" />
          )}
          <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-4">
            <span className="truncate text-[15px] font-bold">
              {activeServer ? activeServer.name : "SweeCord"}
            </span>
            {activeServer && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded p-1 text-sidebar-foreground hover:bg-sidebar-accent">
                    <Settings className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => setInviteOpen(true)}>
                    <Copy className="size-4" /> Davet kodunu göster
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                    <Settings className="size-4" /> Sunucu ayarları
                  </DropdownMenuItem>
                  {isOwner && (
                    <DropdownMenuItem onClick={() => setChannelOpen(true)}>
                      <Plus className="size-4" /> Kanal oluştur
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={leaveServer} className="text-destructive focus:text-destructive">
                    <LogOut className="size-4" />
                    {isOwner ? "Sunucuyu sil" : "Sunucudan ayrıl"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          <ScrollArea className="flex-1 px-2 py-3">
            {activeServer ? (
              <>
                <div className="flex items-center justify-between px-2 pb-1">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Metin kanalları
                  </span>
                  {(isOwner || myPerms.manage_channels) && (
                    <button
                      onClick={() => setChannelOpen(true)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </div>
                {channels.filter((c) => c.type !== "voice").map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChannelId(c.id)}
                    className={cn(
                      "mt-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[15px] transition-colors",
                      c.id === channelId
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Hash className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
                <p className="px-2 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Ses kanalları
                </p>
                {channels.filter((c) => c.type === "voice").map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChannelId(c.id)}
                    className={cn(
                      "mt-0.5 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-[15px] transition-colors",
                      c.id === channelId
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Volume2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  onClick={() => setDmUser(null)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-[15px]",
                    !dmUser ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <Users className="size-4 shrink-0" />
                  <span className="truncate">Arkadaşlar</span>
                </button>
                {dmUser && (
                  <>
                    <p className="px-2 pb-1 pt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Özel mesajlar
                    </p>
                    <div className="flex items-center gap-2 rounded bg-sidebar-accent px-2 py-1.5">
                      <UserAvatar name={dmUser.display_name || dmUser.username} url={dmUser.avatar_url} className="size-7" />
                      <span className="truncate text-sm">{dmUser.display_name || dmUser.username}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </ScrollArea>

          {/* user bar */}
          <div className="flex items-center gap-2 bg-rail px-2 py-2">
            <UserAvatar name={profile.display_name || profile.username} url={profile.avatar_url} className="size-8" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{profile.display_name || profile.username}</p>
              <p className="truncate text-xs text-muted-foreground">@{profile.username}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setProfileOpen(true)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Settings className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Profil ayarları</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={signOut}
                  className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <LogOut className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Çıkış yap</TooltipContent>
            </Tooltip>
          </div>
        </aside>

        {/* chat */}
        <main className="flex min-w-0 flex-1 flex-col">
          {!activeServer ? (
            dmUser ? (
              <DMPanel key={dmUser.id} me={profile} other={dmUser} />
            ) : (
              <FriendsPanel userId={user.id} onMessage={setDmUser} />
            )
          ) : activeChannel?.type === "voice" ? (
            <VoiceRoom
              key={activeChannel.id}
              channelId={activeChannel.id}
              channelName={activeChannel.name}
              me={{ id: user.id, name: profile.display_name || profile.username, avatar: profile.avatar_url }}
            />
          ) : (
            <>
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 shadow-panel">
            {activeChannel ? (
              <>
                <Hash className="size-5 text-muted-foreground" />
                <span className="font-semibold">{activeChannel.name}</span>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Kanal seçilmedi</span>
            )}
          </header>

          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              <ScrollArea className="flex-1">
                <div className="flex flex-col gap-4 px-4 py-6">
                  {activeChannel && messages.length === 0 && (
                    <div className="py-10 text-center">
                      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-card">
                        <Hash className="size-7 text-muted-foreground" />
                      </div>
                      <h2 className="mt-4 text-xl font-bold">#{activeChannel.name} kanalına hoş geldin</h2>
                      <p className="mt-1 text-sm text-muted-foreground">Bu kanalın başlangıcı burası.</p>
                    </div>
                  )}
                  {messages.map((m) => {
                    const author = memberMap.get(m.user_id);
                    const mine = m.user_id === user.id;
                    return (
                      <div key={m.id} className="group flex gap-3">
                        <button onClick={() => setViewUserId(m.user_id)} className="shrink-0 self-start">
                          <UserAvatar name={author?.name ?? "Üye"} url={author?.avatar ?? null} />
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <button onClick={() => setViewUserId(m.user_id)} className="text-sm font-semibold hover:underline" style={author?.color ? { color: author.color } : undefined}>{author?.name ?? "Eski üye"}</button>
                            <span className="text-xs text-muted-foreground">{formatTime(m.created_at)}</span>
                            {(mine || isOwner || myPerms.manage_messages) && (
                              <button
                                onClick={() => deleteMessage(m.id)}
                                className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                          {m.content && (
                            <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
                              {m.content}
                            </p>
                          )}
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noreferrer">
                              <img src={m.image_url} alt="" className="mt-1 max-h-80 max-w-sm rounded-md object-contain" />
                            </a>
                          )}
                          {m.audio_url && <audio controls src={m.audio_url} className="mt-1 h-10 max-w-xs" />}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              <form onSubmit={sendMessage} className="px-4 pb-6">
                <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-1">
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    disabled={!activeChannel || !canSend}
                    maxLength={2000}
                    placeholder={
                      !activeChannel
                        ? "Önce bir kanal seç"
                        : canSend
                          ? `#${activeChannel.name} kanalına mesaj gönder`
                          : "Bu kanala mesaj gönderme iznin yok"
                    }
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                  />
                  <ImageButton userId={user.id} disabled={!activeChannel || !canSend} onUploaded={sendImage} />
                  <VoiceRecorder disabled={!activeChannel || !canSend} onRecorded={sendVoice} />
                  <button
                    type="submit"
                    disabled={!activeChannel || !draft.trim()}
                    className="text-muted-foreground transition-colors hover:text-primary disabled:opacity-40"
                  >
                    <SendHorizonal className="size-5" />
                  </button>
                </div>
              </form>
            </div>

            {/* members */}
            {activeServer && (
              <aside className="hidden w-60 shrink-0 flex-col bg-sidebar lg:flex">
                <div className="flex items-center gap-2 px-4 py-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <Users className="size-4" /> Üyeler — {members.length}
                </div>
                <ScrollArea className="flex-1 px-2">
                  {members.map((m) => (
                    <button key={m.user_id} onClick={() => setViewUserId(m.user_id)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-sidebar-accent">
                      <UserAvatar
                        name={m.profiles?.display_name || m.profiles?.username || "Üye"}
                        url={m.profiles?.avatar_url ?? null}
                        className="size-8"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium" style={memberMap.get(m.user_id)?.color ? { color: memberMap.get(m.user_id)!.color! } : undefined}>
                          {m.profiles?.display_name || m.profiles?.username}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {m.role === "owner" ? "Sunucu sahibi" : m.profiles?.status || `@${m.profiles?.username}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </ScrollArea>
              </aside>
            )}
          </div>
            </>
          )}
        </main>
      </div>

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["profile", user.id] });
          qc.invalidateQueries({ queryKey: ["members", serverId] });
        }}
      />

      <CreateServerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        userId={user.id}
        onCreated={(id) => {
          setServerId(id);
          qc.invalidateQueries({ queryKey: ["servers", user.id] });
        }}
      />

      <JoinServerDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onJoined={(id) => {
          setServerId(id);
          qc.invalidateQueries({ queryKey: ["servers", user.id] });
        }}
      />

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} server={activeServer} />

      <CreateChannelDialog
        open={channelOpen}
        onOpenChange={setChannelOpen}
        serverId={serverId}
        onCreated={() => qc.invalidateQueries({ queryKey: ["channels", serverId] })}
      />

      <ServerSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        server={activeServer}
        channels={channels}
        channelPerms={channelPerms}
        members={members}
        roles={roles}
        isOwner={isOwner}
        canKick={isOwner || myPerms.kick_members}
        canManageChannels={isOwner || myPerms.manage_channels}
        onDeleted={() => {
          setServerId(null);
          qc.invalidateQueries({ queryKey: ["servers", user.id] });
        }}
      />
      <MemberProfileDialog
        member={viewMember}
        roles={roles}
        isServerOwner={viewMember?.role === "owner"}
        onOpenChange={(v) => !v && setViewUserId(null)}
      />
    </TooltipProvider>
  );
}

/* ---------------- dialogs ---------------- */

function CreateServerDialog({
  open,
  onOpenChange,
  userId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(): Promise<void> {
    const clean = name.trim().slice(0, 50);
    if (clean.length < 2) {
      toast.error("Sunucu adı en az 2 karakter olmalı");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase
      .from("servers")
      .insert({ name: clean, owner_id: userId })
      .select("id")
      .single();
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message ? `Sunucu oluşturulamadı: ${error.message}` : "Sunucu oluşturulamadı");
      return;
    }
    toast.success("Sunucu oluşturuldu");
    setName("");
    onOpenChange(false);
    onCreated(data.id);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sunucunu oluştur</DialogTitle>
          <DialogDescription>Sunucun arkadaşlarınla takıldığın yerdir.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="server-name">Sunucu adı</Label>
          <Input
            id="server-name"
            value={name}
            maxLength={50}
            onChange={(e) => setName(e.target.value)}
            className="border-0 bg-input"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={create} disabled={busy}>
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinServerDialog({
  open,
  onOpenChange,
  onJoined,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onJoined: (id: string) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function join(): Promise<void> {
    const clean = code.trim().toLowerCase();
    if (!clean) {
      toast.error("Davet kodunu gir");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("join_server_by_code", { _code: clean });
    setBusy(false);
    if (error || !data) {
      toast.error("Davet kodu geçersiz");
      return;
    }
    toast.success("Sunucuya katıldın");
    setCode("");
    onOpenChange(false);
    onJoined(data as string);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sunucuya katıl</DialogTitle>
          <DialogDescription>Arkadaşından aldığın davet kodunu gir.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="invite">Davet kodu</Label>
          <Input
            id="invite"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="örn. 8f2b1c9a4d"
            className="border-0 bg-input font-mono"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={join} disabled={busy}>
            Katıl
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  server,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  server: Server | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Arkadaşlarını davet et</DialogTitle>
          <DialogDescription>Bu kodu paylaş, kodla sunucuna katılabilsinler.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md bg-input px-3 py-2">
          <code className="flex-1 font-mono text-sm">{server?.invite_code ?? "—"}</code>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (!server) return;
              navigator.clipboard.writeText(server.invite_code);
              toast.success("Kod kopyalandı");
            }}
          >
            <Copy className="size-4" /> Kopyala
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateChannelDialog({
  open,
  onOpenChange,
  serverId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  serverId: string | null;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"text" | "voice">("text");
  const [busy, setBusy] = useState(false);

  async function create(): Promise<void> {
    const clean = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9çğıöşü_-]/g, "").slice(0, 30);
    if (!serverId) return;
    if (clean.length < 2) {
      toast.error("Kanal adı en az 2 karakter olmalı");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("channels").insert({ server_id: serverId, name: clean, type: kind });
    setBusy(false);
    if (error) {
      toast.error("Kanal oluşturulamadı");
      return;
    }
    toast.success("Kanal oluşturuldu");
    setName("");
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kanal oluştur</DialogTitle>
          <DialogDescription>Konuları ayrı kanallarda topla.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {(["text", "voice"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                kind === k ? "border-primary bg-accent" : "border-border hover:bg-accent/50",
              )}
            >
              {k === "text" ? <Hash className="size-4" /> : <Volume2 className="size-4" />}
              {k === "text" ? "Metin" : "Ses"}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="channel-name">Kanal adı</Label>
          <Input
            id="channel-name"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
            placeholder="sohbet"
            className="border-0 bg-input"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button onClick={create} disabled={busy}>
            Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
