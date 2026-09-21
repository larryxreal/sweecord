import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/sweecord";

export function UserAvatar({
  name,
  url,
  className,
}: {
  name: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9", className)}>
      {url ? <AvatarImage src={url} alt={name} /> : null}
      <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
