import Image from "next/image";
import { ReportingErrorBoundary } from "@/components/reporting-error-boundary";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserAvatar } from "@/components/user-avatar";
import { FullscreenButton } from "@/features/tracking/components/interruptions/fullscreen-button";
import { InterruptionsView } from "@/features/tracking/components/interruptions/interruptions-calendar";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  const { user } = await requireAuth();
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Image src="/logos/logo.svg" alt="" width={24} height={24} />
        <span className="font-semibold">Viper</span>
        <span className="h-4 w-px bg-border" />
        <span className="font-medium">Device Maintenance</span>
        <span className="hidden truncate text-sm text-muted-foreground md:block">
          Open work orders for devices in your departments, as recorded in
          VIPER.
        </span>
        <div className="ml-auto flex items-center gap-2">
          <UserAvatar user={user} className="border" />
          <span className="text-sm font-medium">{user.name}</span>
          <ThemeToggle />
          <FullscreenButton />
        </div>
      </header>
      <ReportingErrorBoundary
        fallback={<p className="p-4">Something went wrong.</p>}
      >
        <InterruptionsView />
      </ReportingErrorBoundary>
    </>
  );
};

export default Page;
