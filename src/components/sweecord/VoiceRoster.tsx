import { useEffect, useState } from "react";
import { MonitorUp } from "lucide-react";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import { subscribeRoster, type VoiceMember } from "@/lib/voicePresence";

export function VoiceRoster({ channelId }: { channelId: string }) {
  const [members, setMembers] = useState<VoiceMember[]>([]);
  useEffect(() => subscribeRoster(channelId, setMembers), [channelId]);

  if (!members.length) return null;
  return (
    <div className="space-y-0.5 pb-1 pl-7 pr-2">
      {members.map((member) => (
        <div key={member.id} className="flex min-w-0 items-center gap-2 rounded px-1 py-1 text-sm text-sidebar-foreground">
          <UserAvatar name={member.name} url={member.avatar} className="size-6 shrink-0" />
          <span className="truncate">{member.name}</span>
          {member.sharing && <span className="ml-auto flex items-center gap-1 rounded bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"><MonitorUp className="size-3" />CANLI</span>}
        </div>
      ))}
    </div>
  );
}
