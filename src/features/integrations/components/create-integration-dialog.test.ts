import { describe, expect, it } from "vitest";
import { authSchema } from "@/lib/schemas";
import type { FieldSpec } from "../types";
import {
  relaxedAuthSchema,
  relaxedShapeFor,
  shapeFor,
} from "./create-integration-dialog";

const requiredField: FieldSpec = {
  key: "apiToken",
  kind: "password",
  required: true,
};

describe("edit-mode credential validation", () => {
  it("rejects an empty required credential field in create mode", () => {
    const schema = shapeFor([requiredField]).apiToken;
    expect(schema.safeParse("").success).toBe(false);
  });

  it("accepts an empty required credential field in edit mode", () => {
    const schema = relaxedShapeFor([requiredField]).apiToken;
    expect(schema.safeParse("").success).toBe(true);
    expect(schema.safeParse(undefined).success).toBe(true);
  });

  it("still requires authentication details for a non-None auth type in create mode", () => {
    expect(authSchema.safeParse({ authType: "Bearer" }).success).toBe(false);
  });

  it("allows a blank authentication block for a non-None auth type in edit mode", () => {
    expect(relaxedAuthSchema.safeParse({ authType: "Bearer" }).success).toBe(
      true,
    );
  });
});
