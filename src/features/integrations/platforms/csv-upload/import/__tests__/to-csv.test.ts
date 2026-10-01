import { describe, expect, it } from "vitest";
import { toCsv } from "../to-csv";

describe("toCsv", () => {
  it("joins cells with commas and rows with CRLF", () => {
    expect(
      toCsv([
        ["Manufacturer", "Serial", "Reason"],
        ["Mindray", "MD-771930", "Model is missing"],
      ]),
    ).toBe("Manufacturer,Serial,Reason\r\nMindray,MD-771930,Model is missing");
  });

  it("quotes a cell that holds a comma", () => {
    expect(toCsv([["Imaging, East Wing"]])).toBe('"Imaging, East Wing"');
  });

  it("quotes a cell that holds a quote and doubles the quote", () => {
    expect(toCsv([['12" monitor']])).toBe('"12"" monitor"');
  });

  it("quotes a cell that holds a line break", () => {
    expect(toCsv([["Bay 1\nBay 2", "x\r\ny"]])).toBe('"Bay 1\nBay 2","x\r\ny"');
  });

  it("keeps empty cells and surrounding spaces as they are", () => {
    expect(toCsv([["", " Main Tower ", ""]])).toBe(", Main Tower ,");
  });
});
