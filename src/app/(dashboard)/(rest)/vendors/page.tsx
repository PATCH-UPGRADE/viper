import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();
  return null;
};

export default Page;
