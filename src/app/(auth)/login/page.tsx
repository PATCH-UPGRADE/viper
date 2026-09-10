import { LoginForm } from "@/features/auth/components/login-form";
import { requireUnauth } from "@/lib/auth-utils";

type PageProps = {
  searchParams: Promise<{
    verified?: string;
    verification_email_sent?: string;
    next?: string;
  }>;
};

const Page = async ({ searchParams }: PageProps) => {
  const params = await searchParams;

  await requireUnauth(params.next);

  return (
    <LoginForm
      isVerified={params.verified === "1"}
      verificationEmailSent={params.verification_email_sent === "1"}
      next={params.next}
    />
  );
};

export default Page;
