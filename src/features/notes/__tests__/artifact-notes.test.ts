import { describe, expect, it } from "vitest";
import { noteOpsSchema } from "@/features/notes/agent/extract-notes";
import {
  isProcessableDocPdf,
  planNoteWrites,
} from "@/features/notes/server/artifact-notes";

describe("isProcessableDocPdf", () => {
  const base = {
    name: "vendor-hardening-guide.pdf",
    artifactType: "Documentation",
    downloadUrl: "https://s3.example.com/artifacts/x.pdf",
  };

  it("accepts a Documentation PDF with a download url", () => {
    expect(isProcessableDocPdf(base)).toBe(true);
  });

  it("is case-insensitive on the extension", () => {
    expect(isProcessableDocPdf({ ...base, name: "GUIDE.PDF" })).toBe(true);
  });

  it("rejects a non-PDF Documentation file (e.g. .drawio)", () => {
    expect(isProcessableDocPdf({ ...base, name: "diagram.drawio" })).toBe(
      false,
    );
  });

  it("rejects non-Documentation artifact types", () => {
    expect(isProcessableDocPdf({ ...base, artifactType: "Firmware" })).toBe(
      false,
    );
  });

  it("rejects when the file has not been uploaded (no download url)", () => {
    expect(isProcessableDocPdf({ ...base, downloadUrl: null })).toBe(false);
  });

  it("rejects a null latest artifact", () => {
    expect(isProcessableDocPdf(null)).toBe(false);
  });
});

describe("planNoteWrites", () => {
  const candidates = new Set(["note_a", "note_b"]);

  it("honors an update to a candidate note", () => {
    const writes = planNoteWrites(
      [{ action: "update", noteId: "note_a", text: "revised" }],
      candidates,
    );
    expect(writes).toEqual([
      { kind: "update", noteId: "note_a", text: "revised" },
    ]);
  });

  it("downgrades an update with an unknown/hallucinated id to a create", () => {
    const writes = planNoteWrites(
      [{ action: "update", noteId: "ghost", text: "fact" }],
      candidates,
    );
    expect(writes).toEqual([{ kind: "create", text: "fact" }]);
  });

  it("downgrades an update with no noteId to a create", () => {
    const writes = planNoteWrites(
      [{ action: "update", noteId: null, text: "fact" }],
      candidates,
    );
    expect(writes).toEqual([{ kind: "create", text: "fact" }]);
  });

  it("passes through creates and trims text", () => {
    const writes = planNoteWrites(
      [{ action: "create", text: "  spaced  " }],
      candidates,
    );
    expect(writes).toEqual([{ kind: "create", text: "spaced" }]);
  });

  it("skips empty/whitespace-only text", () => {
    const writes = planNoteWrites(
      [
        { action: "create", text: "   " },
        { action: "update", noteId: "note_a", text: "" },
      ],
      candidates,
    );
    expect(writes).toEqual([]);
  });
});

describe("noteOpsSchema", () => {
  it("accepts a valid ops payload", () => {
    const parsed = noteOpsSchema.safeParse({
      notes: [
        { action: "create", text: "Port 443 exposed by default." },
        { action: "update", noteId: "note_a", text: "Default admin/admin." },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown action", () => {
    const parsed = noteOpsSchema.safeParse({
      notes: [{ action: "delete", text: "x" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects empty note text", () => {
    const parsed = noteOpsSchema.safeParse({
      notes: [{ action: "create", text: "" }],
    });
    expect(parsed.success).toBe(false);
  });
});
