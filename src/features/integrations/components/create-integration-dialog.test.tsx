import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import { authSchema } from "@/lib/schemas";
import type { CatalogEntry } from "../core/catalog";
import type { FieldSpec } from "../types";
import { CREDENTIAL_PLACEHOLDER, integrationInputSchema } from "../types";
import {
  buildCredentialsPatch,
  IntegrationFormDialog,
  shapeFor,
} from "./create-integration-dialog";

// jsdom doesn't implement the Pointer Events APIs Radix Select's trigger uses.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

vi.mock("../hooks/use-integrations", () => ({
  useCreateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
}));

const requiredField: FieldSpec = {
  key: "apiToken",
  kind: "password",
  required: true,
};

describe("credential schema — unchanged between create and edit", () => {
  it("rejects an empty required credential field", () => {
    expect(shapeFor([requiredField]).apiToken.safeParse("").success).toBe(
      false,
    );
  });

  it("still requires authentication details for a non-None auth type", () => {
    expect(authSchema.safeParse({ authType: "Bearer" }).success).toBe(false);
  });
});

describe("buildCredentialsPatch — flat (non-auth-shaped) credentials", () => {
  it("is undefined when nothing was dirtied", () => {
    expect(
      buildCredentialsPatch(false, undefined, {
        apiToken: CREDENTIAL_PLACEHOLDER,
      }),
    ).toBeUndefined();
  });

  it("excludes a dirtied field that's still the placeholder", () => {
    expect(
      buildCredentialsPatch(
        false,
        { apiToken: true },
        {
          apiToken: CREDENTIAL_PLACEHOLDER,
        },
      ),
    ).toBeUndefined();
  });

  it("includes only the dirty, changed field", () => {
    expect(
      buildCredentialsPatch(
        false,
        { apiToken: true },
        {
          apiToken: "new-token",
        },
      ),
    ).toEqual({ apiToken: "new-token" });
  });
});

describe("buildCredentialsPatch — auth-shaped credentials", () => {
  it("is undefined when nothing was dirtied", () => {
    // react-hook-form itself un-marks a field as dirty once its current
    // value matches its default again — so "explored Bearer, switched back
    // to the default authType" lands here too (dirtyFields ends up empty),
    // with no special-casing needed in this function for that case.
    expect(
      buildCredentialsPatch(true, undefined, {
        authType: "None",
        authentication: {},
      }),
    ).toBeUndefined();
  });

  it("includes authType once it's genuinely dirtied, even with no leaf field changed yet", () => {
    expect(
      buildCredentialsPatch(
        true,
        { authType: true },
        {
          authType: "Bearer",
          authentication: { token: CREDENTIAL_PLACEHOLDER },
        },
      ),
    ).toEqual({ authType: "Bearer" });
  });

  it("includes only the dirty, changed leaf field inside authentication", () => {
    expect(
      buildCredentialsPatch(
        true,
        { authType: true, authentication: { token: true } },
        { authType: "Bearer", authentication: { token: "new-token" } },
      ),
    ).toEqual({ authType: "Bearer", authentication: { token: "new-token" } });
  });

  it("excludes a dirtied leaf field that's still the placeholder", () => {
    expect(
      buildCredentialsPatch(
        true,
        { authType: true, authentication: { token: true } },
        {
          authType: "Bearer",
          authentication: { token: CREDENTIAL_PLACEHOLDER },
        },
      ),
    ).toEqual({ authType: "Bearer" });
  });
});

describe("syncEvery schema: omitted means keep what's stored", () => {
  it("accepts syncEvery being absent, so a null 'inherit platform default' row is never forced to a number", () => {
    expect(
      integrationInputSchema.shape.syncEvery.safeParse(undefined).success,
    ).toBe(true);
  });

  it("still validates a provided syncEvery the same as before", () => {
    expect(integrationInputSchema.shape.syncEvery.safeParse(0).success).toBe(
      false,
    );
    expect(integrationInputSchema.shape.syncEvery.safeParse(300).success).toBe(
      true,
    );
  });
});

describe("switching auth type before saving (decision: shouldn't force re-entry)", () => {
  const entry = {
    platform: PlatformEnum.PARTNER,
    displayName: "Partner API",
    configFields: [],
    credentialFields: [],
    credentialsAreAuthShaped: true,
  } as unknown as CatalogEntry;

  it("keeps a typed token after switching away and back to the same auth type", async () => {
    const user = userEvent.setup();
    render(
      <IntegrationFormDialog
        entry={entry}
        mode="create"
        open={true}
        onOpenChange={() => {}}
      />,
    );

    const authTypeSelect = screen.getByRole("combobox");
    await user.click(authTypeSelect);
    await user.click(await screen.findByRole("option", { name: "Bearer" }));
    await user.type(await screen.findByLabelText(/token/i), "my-secret-token");

    await user.click(authTypeSelect);
    await user.click(await screen.findByRole("option", { name: "Basic" }));
    expect(screen.queryByLabelText(/token/i)).not.toBeInTheDocument();

    await user.click(authTypeSelect);
    await user.click(await screen.findByRole("option", { name: "Bearer" }));

    // shouldUnregister defaults to false and AuthenticationFields' conditional
    // blocks carry no `key`, so react-hook-form never drops the token field's
    // value while it's hidden — this needed no special-case code.
    expect(await screen.findByLabelText(/token/i)).toHaveValue(
      "my-secret-token",
    );
  });
});
