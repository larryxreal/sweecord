import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/sweecord/UserAvatar";

type VoiceMember = { id: string; name: string; avatar: string | null; inCall: boolean };

export function VoiceRoster({ channelId }: { channelId: string }) {
  const [members, setMembers] = useState<VoiceMember[]>([]);

  useEffect(() => {
    const channel = supabase.channel(`voice-roster-${channelId}`);
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<VoiceMember>();
      setMembers(Object.values(state).flat().filter((member) => member.inCall));
    }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [channelId]);

  if (!members.length) return null;
  return (
    <div className="space-y-0.5 pb-1 pl-7 pr-2">
      {members.map((member) => (
        <div key={member.id} className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sm text-sidebar-foreground">
          <UserAvatar name={member.name} url={member.avatar} className="size-6 shrink-0" />
          <span className="truncate">{member.name}</span>
        </div>
      ))}
    </div>
  );
}