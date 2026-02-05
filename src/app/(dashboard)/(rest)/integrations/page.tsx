import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { requireAuth } from "@/lib/auth-utils";

const Page = async () => {
  await requireAuth();

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Integrations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect external systems so the VMP can ingest assets,
            vulnerabilities, remediations, and leverage LLM providers.
          </p>
        </div>
        <Badge variant="outline">TODO</Badge>
      </div>

      <Separator />

      {/* Summary / helper blurb */}
      <p className="text-sm text-muted-foreground">
        Configure integrations below. Each service requires an HTTP endpoint and
        an API key. You can update or rotate credentials at any time.
      </p>

      {/* Integrations grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/integrations/assets/">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Assets
              </CardTitle>
              <CardDescription>
                Ingest asset inventories by specifying an HTTP route and API
                key.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Used to discover and keep your environment model in sync.
            </CardContent>
          </Card>
        </Link>

        <Link href="/integrations/vulnerabilities/">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Vulnerabilities
              </CardTitle>
              <CardDescription>
                Pull vulnerability findings from external scanners via HTTP +
                API key.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Normalizes findings into a common schema for impact analysis.
            </CardContent>
          </Card>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Remediations
            </CardTitle>
            <CardDescription>
              Push remediation decisions to ticketing or patch management
              systems.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Configure the HTTP route and API key for your downstream workflow
            tool.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              LLM Providers
            </CardTitle>
            <CardDescription>
              Add API keys for your preferred LLMs to power assistant and
              automation features.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Supports multiple providers; keys are encrypted at rest.
          </CardContent>
        </Card>

        <Link href="/integrations/webhooks/">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                Webhooks
              </CardTitle>
              <CardDescription>
                Setup Webhooks to receive automated notifications on data events.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Configure URL, Authentication and choice of webhook events.
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
};

export default Page;
