import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type VoiceMember = { id: string; name: string; avatar: string | null; inCall: boolean; sharing?: boolean };
type Entry = { ch: RealtimeChannel; refs: number; listeners: Set<(m: VoiceMember[]) => void>; members: VoiceMember[]; ready: Promise<void> };

const entries = new Map<string, Entry>();
const clientKey = Math.random().toString(36).slice(2);

/** One shared roster channel per voice channel, so sidebar and call view never collide. */
function acquire(channelId: string): Entry {
  let e = entries.get(channelId);
  if (!e) {
    const ch = supabase.channel(`voice-roster-${channelId}`, { config: { presence: { key: clientKey } } });
    let resolve!: () => void;
    const ready = new Promise<void>((r) => (resolve = r));
    const entry: Entry = { ch, refs: 0, listeners: new Set(), members: [], ready };
    ch.on("presence", { event: "sync" }, () => {
      const seen = new Set<string>();
      entry.members = Object.values(ch.presenceState<VoiceMember>()).flat()
        .filter((m) => m.inCall && !seen.has(m.id) && seen.add(m.id));
      entry.listeners.forEach((l) => l(entry.members));
    }).subscribe((s) => { if (s === "SUBSCRIBED") resolve(); });
    entries.set(channelId, entry);
    e = entry;
  }
  e.refs++;
  return e;
}

function release(channelId: string) {
  const e = entries.get(channelId);
  if (!e) return;
  if (--e.refs <= 0) {
    entries.delete(channelId);
    void supabase.removeChannel(e.ch);
  }
}

export function subscribeRoster(channelId: string, cb: (m: VoiceMember[]) => void) {
  const e = acquire(channelId);
  e.listeners.add(cb);
  cb(e.members);
  return () => { e.listeners.delete(cb); release(channelId); };
}

/** Holds a reference while in call; returns a function to update/clear the tracked state. */
export function holdRoster(channelId: string) {
  const e = acquire(channelId);
  return {
    track: async (m: VoiceMember) => { await e.ready; await e.ch.track(m); },
    leave: async () => { try { await e.ch.untrack(); } catch { /* ignore */ } release(channelId); },
  };
}
