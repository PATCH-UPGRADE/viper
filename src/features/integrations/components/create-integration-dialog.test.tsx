import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PlatformEnum } from "@/generated/prisma";
import type { CatalogEntry } from "../core/catalog";
import type { FieldSpec, IntegrationListItem } from "../types";
import {
  buildCredentialsPatch,
  IntegrationFormDialog,
  relaxedAuthSchema,
  relaxedShapeFor,
} from "./create-integration-dialog";

// jsdom doesn't implement what Radix Select's trigger/option interactions use.
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.scrollIntoView = () => {};
});

const mockUpdateMutate = vi.fn();
vi.mock("../hooks/use-integrations", () => ({
  useCreateIntegration: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateIntegration: () => ({ mutate: mockUpdateMutate, isPending: false }),
}));

const requiredField: FieldSpec = {
  key: "apiToken",
  kind: "password",
  required: true,
};

describe("edit mode relaxes credential requirements", () => {
  it("accepts a blank (or absent) credential field", () => {
    const editField = relaxedShapeFor([requiredField]).apiToken;
    expect(editField.safeParse("").success).toBe(true);
    expect(editField.safeParse(undefined).success).toBe(true);
  });

  it("tolerates a bare authType with no authentication block", () => {
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
    expect(
      buildCredentialsPatch(
        true,
        { authType: true },
        { authType: "Bearer", authentication: { token: "" } },
      ),
    ).toEqual({ authType: "Bearer" });

    expect(
      buildCredentialsPatch(
        true,
        { authType: true, authentication: { token: true } },
        { authType: "Bearer", authentication: { token: "new-token" } },
      ),
    ).toEqual({ authType: "Bearer", authentication: { token: "new-token" } });
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

describe("edit: selecting an auth type without typing a new secret", () => {
  const entry = {
    platform: PlatformEnum.PARTNER,
    displayName: "Partner API",
    configFields: [],
    credentialFields: [],
    credentialsAreAuthShaped: true,
  } as unknown as CatalogEntry;
  const integration = {
    id: "int-1",
    name: "Demo Partner Feed",
    syncEvery: 300,
    config: {},
  } as unknown as IntegrationListItem;

  it("still submits (leaving credentials untouched) instead of failing silently", async () => {
    mockUpdateMutate.mockClear();
    const user = userEvent.setup();
    render(
      <IntegrationFormDialog
        entry={entry}
        mode="edit"
        integration={integration}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    const authTypeSelect = screen.getByRole("combobox");
    await user.click(authTypeSelect);
    await user.click(await screen.findByRole("option", { name: "Bearer" }));
    fireEvent.submit(
      document.getElementById("integration-form-edit") as HTMLFormElement,
    );

    await vi.waitFor(() => expect(mockUpdateMutate).toHaveBeenCalled());
    const [{ data }] = mockUpdateMutate.mock.calls[0];
    expect(data.credentials).toEqual({ authType: "Bearer" });
  });

  it("still sends a token actually typed in, even after picking a different type first", async () => {
    mockUpdateMutate.mockClear();
    const user = userEvent.setup();
    render(
      <IntegrationFormDialog
        entry={entry}
        mode="edit"
        integration={integration}
        open={true}
        onOpenChange={() => {}}
      />,
    );

    const authTypeSelect = screen.getByRole("combobox");
    await user.click(authTypeSelect);
    await user.click(await screen.findByRole("option", { name: "Basic" }));
    await user.click(authTypeSelect);
    await user.click(await screen.findByRole("option", { name: "Bearer" }));
    await user.type(await screen.findByLabelText(/token/i), "brand-new-token");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await vi.waitFor(() => expect(mockUpdateMutate).toHaveBeenCalled());
    const [{ data }] = mockUpdateMutate.mock.calls[0];
    expect(data.credentials).toEqual({
      authType: "Bearer",
      authentication: { token: "brand-new-token" },
    });
  });
});
