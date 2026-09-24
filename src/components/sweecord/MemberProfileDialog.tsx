import { Crown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/sweecord/UserAvatar";
import type { ServerMember, ServerRole } from "@/lib/sweecord";

export function MemberProfileDialog({
  member,
  roles,
  isServerOwner,
  onOpenChange,
}: {
  member: ServerMember | null;
  roles: ServerRole[];
  isServerOwner: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const p = member?.profiles;
  const name = p?.display_name || p?.username || "Üye";
  const myRoles = roles.filter((r) => member?.role_ids.includes(r.id));
  return (
    <Dialog open={!!member} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden bg-card p-0 sm:max-w-sm">
        <div className="h-20 bg-primary" />
        <div className="px-5 pb-5">
          <div className="-mt-10 mb-3 w-fit rounded-full border-[6px] border-card">
            <UserAvatar name={name} url={p?.avatar_url ?? null} className="size-20" />
          </div>
          <div className="rounded-lg bg-background p-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              {name}
              {isServerOwner && <Crown className="size-4 text-primary" />}
            </DialogTitle>
            <DialogDescription>@{p?.username}</DialogDescription>
            {p?.status && <p className="mt-3 text-sm">{p.status}</p>}
            <div className="mt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">Roller</p>
              <div className="flex flex-wrap gap-1.5">
                {isServerOwner && (
                  <span className="rounded bg-card px-2 py-0.5 text-xs">Sunucu sahibi</span>
                )}
                {myRoles.map((r) => (
                  <span key={r.id} className="flex items-center gap-1.5 rounded bg-card px-2 py-0.5 text-xs">
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: r.color }} />
                    {r.name}
                  </span>
                ))}
                {!isServerOwner && myRoles.length === 0 && (
                  <span className="text-xs text-muted-foreground">Rol yok</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
