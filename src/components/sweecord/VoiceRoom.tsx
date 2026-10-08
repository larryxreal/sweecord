import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MonitorOff, MonitorUp, PhoneOff, Volume2 } from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import { holdRoster, subscribeRoster, type VoiceMember } from "@/lib/voicePresence";

type Peer = { id: string; name: string; avatar: string | null };
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

function VideoTile({ stream, label }: { stream: MediaStream; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="relative overflow-hidden rounded-lg bg-black/60">
      <video ref={ref} autoPlay playsInline muted className="max-h-[60vh] w-full object-contain" onDoubleClick={(e) => void e.currentTarget.requestFullscreen?.()} />
      <span className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-0.5 text-xs font-semibold">{label}</span>
    </div>
  );
}

/** Mesh WebRTC voice room with screen sharing; signaling over realtime broadcast. */
export function VoiceRoom({ channelId, channelName, me, compact = false, canConnect = true }: { channelId: string; channelName: string; me: Peer; compact?: boolean; canConnect?: boolean }) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [roster, setRoster] = useState<VoiceMember[]>([]);
  const [videos, setVideos] = useState<Record<string, MediaStream>>({});
  const [myScreen, setMyScreen] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const sigRef = useRef<RealtimeChannel | null>(null);
  const holdRef = useRef<ReturnType<typeof holdRoster> | null>(null);
  const audioBox = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(false);

  useEffect(() => subscribeRoster(channelId, setRoster), [channelId]);

  function dropVideo(id: string) {
    setVideos((v) => { const n = { ...v }; delete n[id]; return n; });
  }

  function closePeer(id: string) {
    pcs.current.get(id)?.close();
    pcs.current.delete(id);
    document.getElementById(`audio-${id}`)?.remove();
    dropVideo(id);
  }

  async function sendOffer(id: string, pc: RTCPeerConnection) {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sigRef.current?.send({ type: "broadcast", event: "offer", payload: { from: me.id, to: id, sdp: offer } });
  }

  function makePc(id: string) {
    const pc = new RTCPeerConnection(ICE);
    streamRef.current?.getTracks().forEach((t) => pc.addTrack(t, streamRef.current!));
    screenRef.current?.getVideoTracks().forEach((t) => pc.addTrack(t, screenRef.current!));
    pc.onicecandidate = (e) => {
      if (e.candidate) sigRef.current?.send({ type: "broadcast", event: "ice", payload: { from: me.id, to: id, c: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => {
      if (e.track.kind === "video") {
        const s = new MediaStream([e.track]);
        setVideos((v) => ({ ...v, [id]: s }));
        e.track.onended = () => dropVideo(id);
        e.streams[0]?.addEventListener("removetrack", () => dropVideo(id));
        return;
      }
      let a = document.getElementById(`audio-${id}`) as HTMLAudioElement | null;
      if (!a) {
        a = document.createElement("audio");
        a.id = `audio-${id}`;
        a.autoplay = true;
        audioBox.current?.appendChild(a);
      }
      a.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      void a.play().catch(() => {});
    };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) closePeer(id);
    };
    pcs.current.set(id, pc);
    return pc;
  }

  async function join() {
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error("Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.");
      return;
    }
    const ch = supabase.channel(`voice-${channelId}`, { config: { presence: { key: me.id }, broadcast: { self: false } } });
    sigRef.current = ch;
    ch.on("presence", { event: "sync" }, async () => {
      const list = Object.values(ch.presenceState<Peer>()).flat();
      const ids = new Set(list.map((p) => p.id));
      for (const id of [...pcs.current.keys()]) if (!ids.has(id)) closePeer(id);
      for (const p of list) {
        if (p.id === me.id || pcs.current.has(p.id) || me.id > p.id) continue;
        await sendOffer(p.id, makePc(p.id));
      }
    });
    ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
      if (payload.to !== me.id) return;
      let pc = pcs.current.get(payload.from);
      if (!pc || pc.signalingState === "closed") pc = makePc(payload.from);
      if (pc.signalingState === "have-local-offer") await pc.setLocalDescription({ type: "rollback" });
      await pc.setRemoteDescription(payload.sdp);
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      ch.send({ type: "broadcast", event: "answer", payload: { from: me.id, to: payload.from, sdp: ans } });
    });
    ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
      if (payload.to !== me.id) return;
      const pc = pcs.current.get(payload.from);
      if (pc?.signalingState === "have-local-offer") await pc.setRemoteDescription(payload.sdp);
    });
    ch.on("broadcast", { event: "ice" }, async ({ payload }) => {
      if (payload.to !== me.id) return;
      try { await pcs.current.get(payload.from)?.addIceCandidate(payload.c); } catch { /* ignore */ }
    });
    ch.on("broadcast", { event: "screen-stop" }, ({ payload }) => dropVideo(payload.from));
    ch.subscribe(async (s) => {
      if (s === "SUBSCRIBED") await ch.track(me);
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") toast.error("Sesli kanala bağlanılamadı");
    });
    holdRef.current = holdRoster(channelId);
    void holdRef.current.track({ ...me, inCall: true });
    mutedRef.current = false;
    setMuted(false);
    setJoined(true);
  }

  async function stopShare(notify = true) {
    const s = screenRef.current;
    if (!s) return;
    const track = s.getVideoTracks()[0];
    s.getTracks().forEach((t) => t.stop());
    screenRef.current = null;
    setMyScreen(null);
    for (const [id, pc] of pcs.current) {
      const sender = pc.getSenders().find((x) => x.track === track);
      if (sender) { pc.removeTrack(sender); await sendOffer(id, pc); }
    }
    if (notify) {
      sigRef.current?.send({ type: "broadcast", event: "screen-stop", payload: { from: me.id } });
      void holdRef.current?.track({ ...me, inCall: true, sharing: false });
    }
  }

  async function startShare() {
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
    } catch {
      return;
    }
    screenRef.current = s;
    setMyScreen(s);
    const track = s.getVideoTracks()[0]!;
    track.onended = () => void stopShare();
    for (const [id, pc] of pcs.current) { pc.addTrack(track, s); await sendOffer(id, pc); }
    void holdRef.current?.track({ ...me, inCall: true, sharing: true });
  }

  async function leave() {
    await stopShare(false);
    if (sigRef.current) await supabase.removeChannel(sigRef.current);
    sigRef.current = null;
    for (const id of [...pcs.current.keys()]) closePeer(id);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    await holdRef.current?.leave();
    holdRef.current = null;
    setVideos({});
    setJoined(false);
  }

  useEffect(() => () => void leave(), [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMute() {
    const next = !mutedRef.current;
    mutedRef.current = next;
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  }

  const nameOf = (id: string) => roster.find((r) => r.id === id)?.name ?? "Kullanıcı";
  const screens = [...(myScreen ? [["me", myScreen] as const] : []), ...Object.entries(videos)];

  const presentation = compact ? (
      <>
        {joined && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2">
            <Volume2 className="size-4 text-success" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-success">Sese bağlı</p>
              <p className="truncate text-xs text-muted-foreground">{channelName}{myScreen ? " · Ekran paylaşılıyor" : ""}</p>
            </div>
            <Button size="icon" variant="ghost" onClick={toggleMute} aria-label={muted ? "Sesi aç" : "Sustur"}>
              {muted ? <MicOff className="size-4 text-destructive" /> : <Mic className="size-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={leave} aria-label="Ayrıl">
              <PhoneOff className="size-4 text-destructive" />
            </Button>
          </div>
        )}
      </>
  ) : (
    <>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4 shadow-panel">
        <Volume2 className="size-5 text-muted-foreground" />
        <span className="font-semibold">{channelName}</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto p-6">
        {screens.length > 0 && (
          <div className={`grid w-full max-w-5xl gap-3 ${screens.length > 1 ? "md:grid-cols-2" : ""}`}>
            {screens.map(([id, s]) => <VideoTile key={id} stream={s} label={id === "me" ? "Ekranın" : `${nameOf(id)} ekranı`} />)}
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-4">
          {roster.length === 0 && <p className="text-sm text-muted-foreground">Kanalda kimse yok.</p>}
          {roster.map((p) => (
            <div key={p.id} className="flex w-36 flex-col items-center gap-2 rounded-lg bg-card p-4">
              <UserAvatar name={p.name} url={p.avatar} className="size-16" />
              <span className="flex max-w-full items-center gap-1 truncate text-sm font-semibold">
                {p.name}
                {p.sharing && <MonitorUp className="size-3.5 text-destructive" />}
              </span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {!joined ? (
            canConnect ? (
              <Button onClick={join} className="bg-success text-primary-foreground hover:bg-success/90">
                <Volume2 className="size-4" /> Sesli kanala katıl
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Bu ses kanalına bağlanma iznin yok.</p>
            )
          ) : (
            <>
              <Button variant="secondary" onClick={toggleMute}>
                {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {muted ? "Sesi aç" : "Sustur"}
              </Button>
              {myScreen ? (
                <Button variant="secondary" onClick={() => void stopShare()}>
                  <MonitorOff className="size-4" /> Paylaşımı durdur
                </Button>
              ) : (
                <Button variant="secondary" onClick={startShare}>
                  <MonitorUp className="size-4" /> Ekran paylaş
                </Button>
              )}
              <Button variant="destructive" onClick={leave}>
                <PhoneOff className="size-4" /> Ayrıl
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  );

  return (
    <>
      {presentation}
      <div ref={audioBox} className="hidden" />
    </>
  );
}
