import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  user: { name?: string | null; image?: string | null } | null;
  className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {user?.image && user?.name && (
        <AvatarImage src={user.image} alt={user.name} />
      )}
      <AvatarFallback>
        {user?.name?.substring(0, 1).toUpperCase() ?? "U"}
      </AvatarFallback>
    </Avatar>
  );
}
