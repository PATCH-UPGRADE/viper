import { requireAuth } from "@/lib/auth-utils";

interface PageProps {
  params: Promise<{
    remediationId: string;
  }>
};

const Page = async ({ params }: PageProps) => {
  await requireAuth();
  
  const { remediationId } = await params;

  return <p>Remediation id: {remediationId}</p>
};

export default Page;
