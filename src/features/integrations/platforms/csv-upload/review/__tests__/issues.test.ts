import { describe, expect, it } from "vitest";
import type { ColumnIssue, RowIssue } from "../../validate";
import {
  dominantKind,
  fieldsToLeaveOut,
  issueCardsFor,
  issueKeysFor,
  problemWithValue,
  rememberEditedRow,
  rowIssueGroups,
} from "../issues";

const issue = (
  rowNumber: number,
  field: RowIssue["field"],
  kind: RowIssue["kind"],
  value = "x",
): RowIssue => ({ rowNumber, field, kind, value });

const flaggedColumn = (
  field: RowIssue["field"],
  kind: RowIssue["kind"],
  count = 11,
): ColumnIssue => ({
  field,
  failedCount: count,
  totalRows: 1204,
  wholeColumn: true,
  issues: Array.from({ length: count }, (_, index) =>
    issue(index + 2, field, kind),
  ),
});

describe("rowIssueGroups", () => {
  it("groups row issues by field and kind, in field order", () => {
    const groups = rowIssueGroups(
      [
        issue(733, "macAddress", "invalidMac"),
        issue(188, "ip", "invalidIp"),
        issue(190, "ip", "invalidIp"),
      ],
      [],
    );
    expect(groups.map((group) => [group.field, group.issues.length])).toEqual([
      ["ip", 2],
      ["macAddress", 1],
    ]);
  });

  it("leaves out a field whose whole column is flagged", () => {
    const groups = rowIssueGroups(
      [issue(188, "ip", "invalidIp"), issue(12, "product", "missing", "")],
      [flaggedColumn("ip", "invalidIp")],
    );
    expect(groups.map((group) => group.field)).toEqual(["product"]);
  });
});

describe("flagged columns", () => {
  it("names the kind most of a column's values failed with", () => {
    const column = flaggedColumn("ip", "invalidIp");
    column.issues.push(issue(900, "ip", "tooLong"));
    expect(dominantKind(column)).toBe("invalidIp");
  });

  it("leaves out a column of bad values but keeps a mostly-empty required column", () => {
    expect(
      fieldsToLeaveOut([
        flaggedColumn("ip", "invalidIp"),
        flaggedColumn("product", "missing"),
      ]),
    ).toEqual(["ip"]);
  });

  it("keeps a column whose values are too long, because they are cut to fit", () => {
    expect(fieldsToLeaveOut([flaggedColumn("product", "tooLong")])).toEqual([]);
  });
});

describe("issues the user must decide on", () => {
  it("lists one per flagged column, one per row group, and one for repeated rows", () => {
    const groups = rowIssueGroups(
      [issue(8, "ip", "invalidIp"), issue(9, "ip", "invalidIp")],
      [],
    );

    expect(
      issueKeysFor([flaggedColumn("macAddress", "invalidMac")], groups, 2),
    ).toEqual(["column:macAddress", "rows:ip:invalidIp", "repeatedRows"]);
  });

  it("lists nothing when every value could be read", () => {
    expect(issueKeysFor([], [], 0)).toEqual([]);
  });
});

describe("checking a value typed on the Data issues step", () => {
  it("accepts a valid address and says what form a bad one should take", () => {
    expect(problemWithValue("invalidIp", "ip", "10.20.4.15")).toBeNull();
    expect(problemWithValue("invalidIp", "ip", "10.20.4")).toContain(
      "Use a form like 10.20.4.15",
    );
    expect(
      problemWithValue("invalidMac", "macAddress", "00:1A:2B:3C:4D:5E"),
    ).toBeNull();
    expect(
      problemWithValue("invalidMac", "macAddress", "001A2B3C4D5E"),
    ).toContain("Use a form like 00:1A:2B:3C:4D:5E");
  });

  it("lets an address be left empty but not a manufacturer or model", () => {
    expect(problemWithValue("invalidIp", "ip", "  ")).toBeNull();
    expect(problemWithValue("missing", "manufacturer", "  ")).toBe(
      "Type a manufacturer.",
    );
    expect(problemWithValue("missing", "product", "Alaris 8015")).toBeNull();
  });

  it("counts the characters of a value that is too long, whatever the field", () => {
    const tooLong = "x".repeat(301);

    expect(problemWithValue("tooLong", "room", tooLong)).toBe(
      "301 characters. Shorten it to 256 or fewer.",
    );
    expect(problemWithValue("missing", "product", tooLong)).toBe(
      "301 characters. Shorten it to 256 or fewer.",
    );
    expect(problemWithValue("tooLong", "room", "x".repeat(256))).toBeNull();
  });
});

describe("rows fixed on the Data issues step", () => {
  const ipGroup = { field: "ip", kind: "invalidIp" } as const;

  it("keeps a fixed row on its card beside the rows still open", () => {
    const edited = rememberEditedRow({}, ipGroup, 8);
    const stillOpen = rowIssueGroups([issue(9, "ip", "invalidIp")], []);

    expect(issueCardsFor(stillOpen, edited)).toEqual([
      expect.objectContaining({
        key: "rows:ip:invalidIp",
        openIssues: [expect.objectContaining({ rowNumber: 9 })],
        fixedRowNumbers: [8],
      }),
    ]);
  });

  it("keeps the card when every row on it has been fixed", () => {
    const edited = rememberEditedRow(
      rememberEditedRow({}, ipGroup, 8),
      ipGroup,
      9,
    );

    expect(issueCardsFor([], edited)).toEqual([
      expect.objectContaining({ openIssues: [], fixedRowNumbers: [8, 9] }),
    ]);
  });

  it("shows an edited row as open again when its new value is still wrong", () => {
    const edited = rememberEditedRow({}, ipGroup, 8);
    const openAgain = rowIssueGroups([issue(8, "ip", "invalidIp")], []);

    expect(issueCardsFor(openAgain, edited)[0].fixedRowNumbers).toEqual([]);
  });
});
