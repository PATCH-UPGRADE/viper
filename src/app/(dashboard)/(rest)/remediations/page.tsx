import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();

  return <p>Remediations</p>
};

export default Page;
