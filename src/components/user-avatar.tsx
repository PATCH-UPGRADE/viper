import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initialsOf } from "@/lib/string-utils";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  user: { name?: string | null; image?: string | null } | null;
  className?: string;
}

export function UserAvatar({ user, className }: UserAvatarProps) {
  return (
    <Avatar className={cn("h-8 w-8", className)}>
      {user?.image && (
        <AvatarImage
          src={user.image}
          alt={user.name?.trim() || "User avatar"}
        />
      )}
      <AvatarFallback>{initialsOf(user?.name)}</AvatarFallback>
    </Avatar>
  );
}
