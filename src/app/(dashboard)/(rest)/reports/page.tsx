import { FileTextIcon } from "lucide-react";

const Page = async () => {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 p-8 text-center text-sm text-muted-foreground">
      <FileTextIcon className="size-4" />
      Select a report, or start a new conversation.
    </div>
  );
};

export default Page;
