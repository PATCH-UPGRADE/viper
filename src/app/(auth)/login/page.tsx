import { LoginForm } from "@/features/auth/components/login-form";
import { requireUnauth } from "@/lib/auth-utils";

type PageProps = {
  searchParams: Promise<{
    verified?: string;
    verification_email_sent?: string;
  }>;
};

const Page = async ({ searchParams }: PageProps) => {
  await requireUnauth();

  const params = await searchParams;

  return (
    <LoginForm
      isVerified={params.verified === "1"}
      verificationEmailSent={params.verification_email_sent === "1"}
    />
  );
};

export default Page;
