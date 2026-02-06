import { requireAuth } from "@/lib/auth-utils";

interface PageProps {
  params: Promise<{
    deviceArtifactId: string;
  }>;
}

const Page = async ({ params }: PageProps) => {
  await requireAuth();

  const { deviceArtifactId } = await params;

  return <p>DeviceArtifact id: {deviceArtifactId}</p>;
};

export default Page;
