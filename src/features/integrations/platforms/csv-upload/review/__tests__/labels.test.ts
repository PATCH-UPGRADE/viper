import { describe, expect, it } from "vitest";
import {
  fieldNameInSentence,
  formatCount,
  formatFileSize,
  joinWithAnd,
  rowLabel,
  withArticle,
} from "../labels";

describe("labels", () => {
  it("lowercases a field name mid-sentence but keeps an acronym", () => {
    expect(fieldNameInSentence("serialNumber")).toBe("serial number");
    expect(fieldNameInSentence("macAddress")).toBe("MAC address");
    expect(fieldNameInSentence("ip")).toBe("IP address");
  });

  it("joins names the way a sentence lists them", () => {
    expect(joinWithAnd(["Version"])).toBe("Version");
    expect(joinWithAnd(["Version", "Status"])).toBe("Version and Status");
    expect(joinWithAnd(["Role", "Version", "Status"])).toBe(
      "Role, Version and Status",
    );
  });

  it("formats counts and file sizes as the mock shows them", () => {
    expect(formatCount(1204)).toBe("1,204");
    expect(formatFileSize(214 * 1024)).toBe("214 KB");
    expect(formatFileSize(9.2 * 1024 * 1024)).toBe("9.2 MB");
  });

  it("words a field the way the data-issue copy reads it", () => {
    expect(withArticle("IP address")).toBe("an IP address");
    expect(withArticle("MAC address")).toBe("a MAC address");
  });

  it("names a row by its role, then by make and model", () => {
    const blank = { role: null, manufacturer: null, product: null };
    expect(rowLabel({ ...blank, role: "Patient monitor" })).toBe(
      "Patient monitor",
    );
    expect(rowLabel({ ...blank, manufacturer: "BD", product: "Alaris" })).toBe(
      "BD Alaris",
    );
    expect(rowLabel(blank)).toBe("—");
  });
});
