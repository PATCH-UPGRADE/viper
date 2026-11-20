"use client";

import type { ErrorContext } from "better-auth/react";
import Image from "next/image";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { getSafeRedirectPath } from "@/lib/auth-redirect";

const SOCIAL_PROVIDERS = [
  { id: "google", label: "Google", logo: "/logos/google.svg" },
  { id: "github", label: "GitHub", logo: "/logos/github.svg" },
  { id: "microsoft", label: "Microsoft", logo: "/logos/microsoft.svg" },
] as const;

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]["id"];

export const handleSocialLogin = async (
  provider: SocialProviderId,
  next?: string,
) => {
  await authClient.signIn.social(
    {
      provider,
      callbackURL: getSafeRedirectPath(next) ?? "/",
    },
    {
      onError: (ctx: ErrorContext) => {
        toast.error(ctx.error.message);
      },
    },
  );
};

type SocialLoginButtonsProps = {
  next?: string;
  disabled?: boolean;
};

export function SocialLoginButtons({
  next,
  disabled,
}: SocialLoginButtonsProps) {
  return (
    <div className="flex flex-col gap-4">
      {SOCIAL_PROVIDERS.map((provider) => (
        <Button
          key={provider.id}
          variant="outline"
          className="w-full"
          type="button"
          disabled={disabled}
          onClick={() => handleSocialLogin(provider.id, next)}
        >
          <Image
            alt={provider.label}
            src={provider.logo}
            width={20}
            height={20}
          />
          Continue with {provider.label}
        </Button>
      ))}
    </div>
  );
}
