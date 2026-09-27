import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, PhoneOff, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/sweecord/UserAvatar";

type Peer = { id: string; name: string; avatar: string | null };
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

/** Mesh WebRTC voice room; signaling over realtime broadcast, roster via presence. */
export function VoiceRoom({
  channelId,
  channelName,
  me,
}: {
  channelId: string;
  channelName: string;
  me: Peer;
}) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [roster, setRoster] = useState<Peer[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const chRef = useRef<RealtimeChannel | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);

  // Roster (visible even before joining)
  useEffect(() => {
    const ch = supabase.channel(`voice-roster-${channelId}`, { config: { presence: { key: me.id } } });
    ch.on("presence", { event: "sync" }, () => {
      const st = ch.presenceState<Peer & { inCall: boolean }>();
      setRoster(Object.values(st).map((v) => v[0]!).filter((p) => p.inCall));
    }).subscribe();
    chRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelId, me.id]);

  function closePeer(id: string) {
    pcs.current.get(id)?.close();
    pcs.current.delete(id);
    document.getElementById(`audio-${id}`)?.remove();
  }

  function makePc(id: string, ch: RealtimeChannel) {
    const pc = new RTCPeerConnection(ICE);
    streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) ch.send({ type: "broadcast", event: "ice", payload: { from: me.id, to: id, c: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => {
      let a = document.getElementById(`audio-${id}`) as HTMLAudioElement | null;
      if (!a) {
        a = document.createElement("audio");
        a.id = `audio-${id}`;
        a.autoplay = true;
        audioBox.current?.appendChild(a);
      }
      a.srcObject = e.streams[0] ?? null;
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) closePeer(id);
    };
    pcs.current.set(id, pc);
    return pc;
  }

  async function join() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Mikrofona erişilemedi");
      return;
    }
    const ch = supabase.channel(`voice-${channelId}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    ch.on("presence", { event: "sync" }, async () => {
      const st = ch.presenceState<Peer>();
      const list = Object.values(st).map((v) => v[0]!);
      setPeers(list);
      const ids = new Set(list.map((p) => p.id));
      for (const id of pcs.current.keys()) if (!ids.has(id)) closePeer(id);
      for (const p of list) {
        if (p.id === me.id || pcs.current.has(p.id) || me.id > p.id) continue;
        const pc = makePc(p.id, ch);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ch.send({ type: "broadcast", event: "offer", payload: { from: me.id, to: p.id, sdp: offer } });
      }
    });
    ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (payload.to !== me.id) return;
      closePeer(payload.from);
      const pc = makePc(payload.from, ch);
      await pc.setRemoteDescription(payload.sdp);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      ch.send({ type: "broadcast", event: "answer", payload: { from: me.id, to: payload.from, sdp: ans } });
    });
    ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
      if (payload.to !== me.id) return;
      await pcs.current.get(payload.from)?.setRemoteDescription(payload.sdp);
    });
    ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (payload.to !== me.id) return;
      try {
        await pcs.current.get(payload.from)?.addIceCandidate(payload.c);
      } catch {
        /* ignore */
      }
    });
    ch.subscribe(async (s) => {
      if (s === "SUBSCRIBED") {
        await ch.track(me);
        await chRef.current?.track({ ...me, inCall: true });
      }
    });
    (window as unknown as { __voiceCh?: RealtimeChannel }).__voiceCh = ch;
    setJoined(true);
    setMuted(false);
  }

  async function leave() {
    const w = window as unknown as { __voiceCh?: RealtimeChannel };
    if (w.__voiceCh) await supabase.removeChannel(w.__voiceCh);
    w.__voiceCh = undefined;
    for (const id of [...pcs.current.keys()]) closePeer(id);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await chRef.current?.untrack();
    setPeers([]);
    setJoined(false);
  }

  useEffect(() => () => void leave(), [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  const shown = joined ? peers : roster;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 shadow-panel">
        <Volume2 className="size-5 text-muted-foreground" />
        <span className="font-semibold">{channelName}</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="flex flex-wrap justify-center gap-4">
          {shown.length === 0 && <p className="text-sm text-muted-foreground">Kanalda kimse yok.</p>}
          {shown.map((p) => (
            <div key={p.id} className="flex w-36 flex-col items-center gap-2 rounded-lg bg-card p-4">
              <UserAvatar name={p.name} url={p.avatar} className="size-16" />
              <span className="truncate text-sm font-semibold">{p.name}</span>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          {!joined ? (
            <Button onClick={join} className="bg-success text-primary-foreground hover:bg-success/90">
              <Volume2 className="size-4" /> Sesli kanala katıl
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={toggleMute}>
                {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {muted ? "Sesi aç" : "Sustur"}
              </Button>
              <Button variant="destructive" onClick={leave}>
                <PhoneOff className="size-4" /> Ayrıl
              </Button>
            </>
          )}
        </div>
      </div>
      <div ref={audioBox} className="hidden" />
    </>
  );
}
