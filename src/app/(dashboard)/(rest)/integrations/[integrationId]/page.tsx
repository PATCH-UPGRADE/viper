import { requireAuth } from "@/lib/auth-utils";

interface PageProps {
  params: Promise<{
    integrationId: string;
  }>
};

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { integrationId } = await params;

  return <p>Integration id: {integrationId}</p>
};

export default Page;
