import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();

  return <p>Emulators</p>
};

export default Page;
