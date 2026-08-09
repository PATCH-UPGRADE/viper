import { describe, expect, it } from "vitest";
import { resolveEscalationTarget } from "../escalationEmail/process_output";
import { type EscalationVendorCandidate } from "../escalationEmail/types";

const mockContact_1 = {
  id: "vendorContact_1",
  name: "John Doe",
  title: "Hospital Biomed Lead",
  email: "johndoe@example.com",
};

const mockContact_2 = {
  id: "vendorContact_2",
  name: "Jane Doe",
  title: "IT engineer",
  email: "janedoe@example.com",
};

const mockContact_3 = {
  id: "vendorContact_3",
  name: "James Doe",
  title: "software engineer",
  email: "jamesdoe@example.com",
};

const siemens: EscalationVendorCandidate = {
  id: "siemensID_1",
  displayName: "Siemens healthineers Service",
  contacts: [mockContact_1, mockContact_2, mockContact_3],
};

const mockVendor_1: EscalationVendorCandidate = {
  id: "vendor_1",
  displayName: "Vendor 1 Service",
  contacts: [mockContact_1, mockContact_2, mockContact_3],
};

const context = {
  manufacturerName: "Siemens Healthineers",
  vendors: [siemens, mockVendor_1],
};

describe("resolveEscalationTarget", () => {
  it("names the chosen vendor and returns the chosen contacts' emails", () => {
    const result = resolveEscalationTarget(
      {
        audience: "VENDOR",
        vendorId: "siemensID_1",
        contactIds: ["vendorContact_1", "vendorContact_2", "vendorContact_3"],
      },
      context,
    );
    expect(result.audience).toBe("VENDOR");
    expect(result.companyName).toBe("Siemens healthineers Service");
    expect(result.toEmails).toEqual([
      mockContact_1.email,
      mockContact_2.email,
      mockContact_3.email,
    ]);
  });

  it("leaves toEmails empty when the model picks no contact, but keeps the options", () => {
    const result = resolveEscalationTarget(
      {
        audience: "VENDOR",
        vendorId: "siemensID_1",
        contactIds: [],
      },
      context,
    );

    expect(result.audience).toBe("VENDOR");
    expect(result.toEmails).toEqual([]);
    expect(result.contacts).toHaveLength(3); // the dropdown case
  });

  it("uses the manufacturer name and no contacts for a MANUFACTURER audience", () => {
    const result = resolveEscalationTarget(
      {
        audience: "MANUFACTURER",
        vendorId: null,
        contactIds: [],
      },
      context,
    );

    expect(result).toEqual({
      audience: "MANUFACTURER",
      companyName: "Siemens healthineers Service",
      contacts: [],
      toEmails: [],
    });
  });
  it("falls back to MANUFACTURER when no vendors were offered", () => {
    const result = resolveEscalationTarget(
      {
        audience: "VENDOR",
        vendorId: "siemensID_1",
        contactIds: ["mockContact_1"],
      },
      {
        manufacturerName: "Siemens healthineers Service",
        vendors: [],
      },
    );

    expect(result.audience).toBe("MANUFACTURER");
    expect(result.companyName).toBe("Siemens healthineers Service");
  });

  it("drops correct ids that belong to a different vendor", () => {
    const result = resolveEscalationTarget(
      {
        audience: "VENDOR",
        vendorId: "siemensID_1",
        contactIds: ["mockContact_5"],
      },
      context,
    );

    expect(result.companyName).toBe("Siemens healthineers Service");
    expect(result.toEmails).toEqual([mockContact_1.email]);
  });
});
