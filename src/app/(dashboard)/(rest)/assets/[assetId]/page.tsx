import { requireAuth } from "@/lib/auth-utils";

interface PageProps {
  params: Promise<{
    assetId: string;
  }>
};

const Page = async ({ params }: PageProps) => {
  await requireAuth();
  
  const { assetId } = await params;

  return <p>Asset id: {assetId}</p>
};

export default Page;
