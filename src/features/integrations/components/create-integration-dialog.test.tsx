import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import { authSchema } from "@/lib/schemas";
import type { CatalogEntry } from "../core/catalog";
import type { FieldSpec } from "../types";
import { integrationInputSchema } from "../types";
import {
  buildCredentialsPatch,
  IntegrationFormDialog,
  relaxedAuthSchema,
  relaxedShapeFor,
  shapeFor,
} from "./create-integration-dialog";

// jsdom doesn't implement what Radix Select's trigger/option interactions use.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
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

describe("credential schema: create is strict, edit is relaxed", () => {
  it("create mode rejects an empty required credential field", () => {
    expect(shapeFor([requiredField]).apiToken.safeParse("").success).toBe(
      false,
    );
  });

  it("edit mode accepts a blank (or absent) credential field", () => {
    const editField = relaxedShapeFor([requiredField]).apiToken;
    expect(editField.safeParse("").success).toBe(true);
    expect(editField.safeParse(undefined).success).toBe(true);
  });

  it("create mode still requires authentication details for a non-None auth type", () => {
    expect(authSchema.safeParse({ authType: "Bearer" }).success).toBe(false);
  });

  it("edit mode tolerates a bare authType with no authentication block", () => {
    expect(relaxedAuthSchema.safeParse({ authType: "Bearer" }).success).toBe(
      true,
    );
  });
});

describe("buildCredentialsPatch — flat (non-auth-shaped) credentials", () => {
  it("is undefined when nothing was dirtied", () => {
    expect(
      buildCredentialsPatch(false, undefined, { apiToken: "" }),
    ).toBeUndefined();
  });

  it("includes only the dirty, typed field", () => {
    expect(
      buildCredentialsPatch(
        false,
        { apiToken: true },
        { apiToken: "new-token" },
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

  it("includes authType once dirtied, plus only the dirty, typed leaf field", () => {
    // authType alone, no leaf field touched yet:
    expect(
      buildCredentialsPatch(
        true,
        { authType: true },
        { authType: "Bearer", authentication: { token: "" } },
      ),
    ).toEqual({ authType: "Bearer" });

    // authType plus a genuinely typed leaf field:
    expect(
      buildCredentialsPatch(
        true,
        { authType: true, authentication: { token: true } },
        { authType: "Bearer", authentication: { token: "new-token" } },
      ),
    ).toEqual({ authType: "Bearer", authentication: { token: "new-token" } });
  });
});

// "omitted means keep what's stored" (the reason syncEvery is .optional() at
// all) is already proven at the router level, in routers.test.ts — that test
// sends syncEvery genuinely absent through this same schema, so it would
// fail too if .optional() regressed. This one covers what that test doesn't:
// that relaxing it to optional didn't also loosen the min/positive check.
describe("syncEvery schema", () => {
  it("still validates a provided value the same as before .optional() was added", () => {
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
