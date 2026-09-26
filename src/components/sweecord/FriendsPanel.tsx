import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, MessageCircle, UserPlus, UserX, X, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import { slugifyUsername, type Profile } from "@/lib/sweecord";
import { cn } from "@/lib/utils";

type FriendRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: string;
  created_at: string;
};

type Tab = "friends" | "pending" | "add";

export function FriendsPanel({ userId, onMessage }: { userId: string; onMessage?: (p: Profile) => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("friends");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  const requestsQuery = useQuery({
    queryKey: ["friend-requests", userId],
    queryFn: async (): Promise<FriendRow[]> => {
      const { data, error } = await supabase
        .from("friend_requests")
        .select("id, sender_id, receiver_id, status, created_at")
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FriendRow[];
    },
  });
  const rows = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data]);

  const otherIds = useMemo(
    () => Array.from(new Set(rows.map((r) => (r.sender_id === userId ? r.receiver_id : r.sender_id)))),
    [rows, userId],
  );

  const peopleQuery = useQuery({
    queryKey: ["friend-profiles", otherIds.join(",")],
    enabled: otherIds.length > 0,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from("profiles").select("*").in("id", otherIds);
      if (error) throw error;
      return (data ?? []) as Profile[];
    },
  });
  const peopleMap = useMemo(() => {
    const map = new Map<string, Profile>();
    for (const p of peopleQuery.data ?? []) map.set(p.id, p);
    return map;
  }, [peopleQuery.data]);

  const friends = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter((r) => r.status === "pending" && r.receiver_id === userId);
  const outgoing = rows.filter((r) => r.status === "pending" && r.sender_id === userId);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["friend-requests", userId] });
  }

  async function sendRequest(): Promise<void> {
    const clean = slugifyUsername(username.trim().replace(/^@/, ""));
    if (clean.length < 2) {
      toast.error("Geçerli bir kullanıcı adı gir");
      return;
    }
    setBusy(true);
    const { data: target, error: findErr } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", clean)
      .maybeSingle();
    if (findErr || !target) {
      setBusy(false);
      toast.error("Böyle bir kullanıcı bulunamadı");
      return;
    }
    if (target.id === userId) {
      setBusy(false);
      toast.error("Kendine istek gönderemezsin");
      return;
    }
    const existing = rows.find((r) => r.sender_id === target.id || r.receiver_id === target.id);
    if (existing) {
      setBusy(false);
      toast.error(existing.status === "accepted" ? "Zaten arkadaşsınız" : "Zaten bir istek var");
      return;
    }
    const { error } = await supabase
      .from("friend_requests")
      .insert({ sender_id: userId, receiver_id: target.id });
    setBusy(false);
    if (error) {
      toast.error("İstek gönderilemedi");
      return;
    }
    toast.success(`@${target.username} kişisine istek gönderildi`);
    setUsername("");
    refresh();
  }

  async function respond(id: string, status: "accepted" | "declined"): Promise<void> {
    const { error } = await supabase.from("friend_requests").update({ status }).eq("id", id);
    if (error) {
      toast.error("İşlem yapılamadı");
      return;
    }
    toast.success(status === "accepted" ? "Arkadaş eklendi" : "İstek reddedildi");
    refresh();
  }

  async function removeRow(id: string): Promise<void> {
    const { error } = await supabase.from("friend_requests").delete().eq("id", id);
    if (error) {
      toast.error("Kaldırılamadı");
      return;
    }
    refresh();
  }

  function Person({ row, children }: { row: FriendRow; children?: React.ReactNode }) {
    const otherId = row.sender_id === userId ? row.receiver_id : row.sender_id;
    const p = peopleMap.get(otherId);
    const name = p?.display_name || p?.username || "Kullanıcı";
    return (
      <div className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent/50">
        <UserAvatar name={name} url={p?.avatar_url ?? null} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {p?.username ? `@${p.username}` : "—"}
            {p?.status ? ` · ${p.status}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">{children}</div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "friends", label: "Arkadaşlar", count: friends.length },
    { key: "pending", label: "Bekleyen", count: incoming.length + outgoing.length },
    { key: "add", label: "Arkadaş ekle" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-4">
        <Users className="mr-2 size-5 text-muted-foreground" />
        <span className="mr-3 font-semibold">Arkadaşlar</span>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded px-2.5 py-1 text-sm transition-colors",
              tab === t.key
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {t.label}
            {t.count ? ` — ${t.count}` : ""}
          </button>
        ))}
      </header>

      <ScrollArea className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          {tab === "add" && (
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold">Arkadaş ekle</h2>
                <p className="text-sm text-muted-foreground">
                  Kullanıcı adıyla arkadaşlık isteği gönderebilirsin.
                </p>
              </div>
              <div className="flex gap-2 rounded-lg bg-muted p-2">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="kullaniciadi"
                  className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                />
                <Button onClick={sendRequest} disabled={busy}>
                  <UserPlus className="size-4" /> İstek gönder
                </Button>
              </div>
            </div>
          )}

          {tab === "friends" && (
            <div className="space-y-1">
              {friends.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Henüz arkadaşın yok. "Arkadaş ekle" sekmesinden başlayabilirsin.
                </p>
              ) : (
                friends.map((r) => (
                  <Person key={r.id} row={r}>
                    {onMessage && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Mesaj gönder"
                        onClick={() => {
                          const p = peopleMap.get(r.sender_id === userId ? r.receiver_id : r.sender_id);
                          if (p) onMessage(p);
                        }}
                      >
                        <MessageCircle className="size-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Arkadaşlıktan çıkar"
                      onClick={() => removeRow(r.id)}
                    >
                      <UserX className="size-4 text-destructive" />
                    </Button>
                  </Person>
                ))
              )}
            </div>
          )}

          {tab === "pending" && (
            <div className="space-y-4">
              <section>
                <h3 className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Gelen istekler — {incoming.length}
                </h3>
                {incoming.length === 0 ? (
                  <p className="px-3 text-sm text-muted-foreground">Gelen istek yok.</p>
                ) : (
                  incoming.map((r) => (
                    <Person key={r.id} row={r}>
                      <Button size="icon" variant="ghost" title="Kabul et" onClick={() => respond(r.id, "accepted")}>
                        <Check className="size-4 text-success" />
                      </Button>
                      <Button size="icon" variant="ghost" title="Reddet" onClick={() => respond(r.id, "declined")}>
                        <X className="size-4 text-destructive" />
                      </Button>
                    </Person>
                  ))
                )}
              </section>
              <section>
                <h3 className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Gönderilen istekler — {outgoing.length}
                </h3>
                {outgoing.length === 0 ? (
                  <p className="px-3 text-sm text-muted-foreground">Gönderilen istek yok.</p>
                ) : (
                  outgoing.map((r) => (
                    <Person key={r.id} row={r}>
                      <Button size="icon" variant="ghost" title="İsteği iptal et" onClick={() => removeRow(r.id)}>
                        <X className="size-4 text-destructive" />
                      </Button>
                    </Person>
                  ))
                )}
              </section>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
