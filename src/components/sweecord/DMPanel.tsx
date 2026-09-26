import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtSign, SendHorizonal, Trash2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import { VoiceRecorder } from "@/components/sweecord/VoiceRecorder";
import { formatTime, uploadVoice, type DirectMessage, type Profile } from "@/lib/sweecord";

export function DMPanel({ me, other }: { me: Profile; other: Profile }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const key = ["dm", [me.id, other.id].sort().join(":")];

  const q = useQuery({
    queryKey: key,
    queryFn: async (): Promise<DirectMessage[]> => {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(`and(sender_id.eq.${me.id},receiver_id.eq.${other.id}),and(sender_id.eq.${other.id},receiver_id.eq.${me.id})`)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as DirectMessage[];
    },
  });
  const msgs = useMemo(() => q.data ?? [], [q.data]);

  useEffect(() => {
    const ch = supabase
      .channel(`dm-${me.id}-${other.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_messages" }, () =>
        qc.invalidateQueries({ queryKey: key }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, other.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  async function send(content: string, audio_url: string | null = null) {
    const { error } = await supabase
      .from("direct_messages")
      .insert({ sender_id: me.id, receiver_id: other.id, content, audio_url });
    if (error) {
      toast.error("Mesaj gönderilemedi (arkadaş olmalısınız)");
      return false;
    }
    qc.invalidateQueries({ queryKey: key });
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = draft.trim();
    if (!c) return;
    setDraft("");
    if (!(await send(c.slice(0, 2000)))) setDraft(c);
  }

  async function onVoice(b: Blob) {
    try {
      const url = await uploadVoice(me.id, b);
      await send("", url);
    } catch {
      toast.error("Sesli mesaj yüklenemedi");
    }
  }

  const name = (p: Profile) => p.display_name || p.username;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 shadow-panel">
        <AtSign className="size-5 text-muted-foreground" />
        <span className="font-semibold">{name(other)}</span>
      </header>
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-4 px-4 py-6">
          {msgs.length === 0 && (
            <div className="py-10 text-center">
              <UserAvatar name={name(other)} url={other.avatar_url} className="mx-auto size-16" />
              <h2 className="mt-4 text-xl font-bold">{name(other)}</h2>
              <p className="mt-1 text-sm text-muted-foreground">@{other.username} ile özel mesajlaşmanın başlangıcı.</p>
            </div>
          )}
          {msgs.map((m) => {
            const author = m.sender_id === me.id ? me : other;
            return (
              <div key={m.id} className="group flex gap-3">
                <UserAvatar name={name(author)} url={author.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">{name(author)}</span>
                    <span className="text-xs text-muted-foreground">{formatTime(m.created_at)}</span>
                    {m.sender_id === me.id && (
                      <button
                        onClick={async () => {
                          await supabase.from("direct_messages").delete().eq("id", m.id);
                          qc.invalidateQueries({ queryKey: key });
                        }}
                        className="ml-auto text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  {m.content && <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.content}</p>}
                  {m.audio_url && <audio controls src={m.audio_url} className="mt-1 h-10 max-w-xs" />}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
      <form onSubmit={onSubmit} className="px-4 pb-6">
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-1">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder={`@${other.username} kullanıcısına mesaj gönder`}
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <VoiceRecorder onRecorded={onVoice} />
          <button type="submit" disabled={!draft.trim()} className="text-muted-foreground hover:text-primary disabled:opacity-40">
            <SendHorizonal className="size-5" />
          </button>
        </div>
      </form>
    </>
  );
}
