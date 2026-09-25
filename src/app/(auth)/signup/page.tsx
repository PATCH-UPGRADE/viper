import { RegisterForm } from "@/features/auth/components/register-form";
import { requireUnauth } from "@/lib/auth-utils";

type PageProps = {
  searchParams: Promise<{ next?: string }>;
};

const Page = async ({ searchParams }: PageProps) => {
  const params = await searchParams;

  await requireUnauth(params.next);

  return <RegisterForm next={params.next} />;
};

export default Page;
