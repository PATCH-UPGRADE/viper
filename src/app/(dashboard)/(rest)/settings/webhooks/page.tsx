import { Button } from "@/components/ui/button";
import { mainPadding } from "@/config/constants";
import { SettingsSubheader } from "@/features/settings/components/settings-layout";
import { cn } from "@/lib/utils";
import { PlusIcon } from "lucide-react";

const Page = () => {
  return (
    <div className={cn(mainPadding, "bg-background flex justify-between items-center")}>
    <SettingsSubheader
      title="Webhooks"
      description="Manage where VIPER communicates data to"
    />
    <Button><PlusIcon /> Create Webhook</Button>
    </div>
  );
};
export default Page;
