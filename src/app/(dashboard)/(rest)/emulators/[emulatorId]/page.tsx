import { requireAuth } from "@/lib/auth-utils";

interface PageProps {
  params: Promise<{
    emulatorId: string;
  }>
};

const Page = async ({ params }: PageProps) => {
  await requireAuth();
  
  const { emulatorId } = await params;

  return <p>Emulator id: {emulatorId}</p>
};

export default Page;
