// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapMicrosoftProfileToUser } from "../microsoft-profile";

const WORK_TENANT = "11111111-2222-3333-4444-555555555555";
const CONSUMER_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";

describe("mapMicrosoftProfileToUser", () => {
  it("keeps the email claim when Entra sends one", () => {
    expect(
      mapMicrosoftProfileToUser({
        email: "nurse@hospital.org",
        tid: WORK_TENANT,
        preferred_username: "nurse.upn@hospital.org",
      }),
    ).toEqual({});
  });

  it("falls back to the user principal name for a work account", () => {
    expect(
      mapMicrosoftProfileToUser({
        tid: WORK_TENANT,
        preferred_username: "nurse@hospital.org",
      }),
    ).toEqual({ email: "nurse@hospital.org" });
  });

  it("does not fall back for a consumer account", () => {
    expect(
      mapMicrosoftProfileToUser({
        tid: CONSUMER_TENANT,
        preferred_username: "someone@outlook.com",
      }),
    ).toEqual({});
  });

  it("does not fall back when the principal name is not an address", () => {
    expect(
      mapMicrosoftProfileToUser({
        tid: WORK_TENANT,
        preferred_username: "nurse",
      }),
    ).toEqual({});
  });
});
