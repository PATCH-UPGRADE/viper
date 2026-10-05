import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TransactionClient } from "@/lib/db";
import {
  createNote,
  deleteNote,
  NoteNotFoundError,
  updateNote,
} from "../server/note-writes";

vi.mock("server-only", () => ({}));

const noteCreate = vi.fn();
const noteUpdateMany = vi.fn();
const entityFilterCreate = vi.fn();
const tx = {
  note: { create: noteCreate, updateMany: noteUpdateMany },
} as unknown as TransactionClient;

beforeEach(() => {
  vi.resetAllMocks();
  noteCreate.mockResolvedValue({ id: "note-1" });
  entityFilterCreate.mockResolvedValue({ id: "filter-1" });
});

describe("createNote", () => {
  it("leaves the note unscoped when no scope is given", async () => {
    const result = await createNote(tx, {
      text: "Unscoped note",
      status: "SCOPED",
      userId: "user-1",
    });

    expect(noteCreate).toHaveBeenCalledWith({
      data: {
        text: "Unscoped note",
        status: "SCOPED",
        userId: "user-1",
      },
      select: { id: true },
    });
    expect(entityFilterCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "note-1", filterId: null });
  });
  it("leaves the note unscoped when the scope has zero ids", async () => {
    const result = await createNote(tx, {
      text: "No matchings",
      status: "SCOPED",
      userId: "user-1",
      scope: { targetModel: "DEVICE_GROUP_MATCHING", instanceIds: [] },
    });

    expect(noteCreate.mock.calls[0][0].data).not.toHaveProperty("instanceId");
    expect(entityFilterCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "note-1", filterId: null });
  });

  it("attaches a single id directly, without an EntityFilter", async () => {
    const result = await createNote(tx, {
      text: "Requires vendor downtime window",
      userId: "user-1",
      status: "SCOPED",
      scope: { targetModel: "DEVICE_GROUP_MATCHING", instanceIds: ["dgm-1"] },
    });
    expect(noteCreate).toHaveBeenCalledWith({
      data: {
        text: "Requires vendor downtime window",
        status: "SCOPED",
        userId: "user-1",
        targetModel: "DEVICE_GROUP_MATCHING",
        instanceId: "dgm-1",
      },
      select: { id: true },
    });
    expect(entityFilterCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "note-1", filterId: null });
  });

  it("scopes multiple ids via an EntityFilter and returns its id", async () => {
    const result = await createNote(tx, {
      text: "Applies to every pump model",
      status: "SCOPED",
      userId: "user-1",
      scope: {
        targetModel: "DEVICE_GROUP_MATCHING",
        instanceIds: ["dgm-1", "dgm-2"],
        label: "MANUAL",
      },
    });

    expect(noteCreate.mock.calls[0][0].data).not.toHaveProperty("targetModel");
    expect(noteCreate.mock.calls[0][0].data).not.toHaveProperty("instanceId");
    expect(entityFilterCreate).toHaveBeenCalledWith({
      data: {
        noteId: "note-1",
        label: "MANUAL",
        targetModel: "DEVICE_GROUP_MATCHING",
        filter: { id: { in: ["dgm-1", "dgm-2"] } },
      },
      select: { id: true },
    });
    expect(result).toEqual({ id: "note-1", filterId: "filter-1" });
  });
  it("does not inject a status when the caller omits one", async () => {
    await createNote(tx, { text: "DB default status", userId: "user-1" });
    expect(noteCreate.mock.calls[0][0].data.status).toBeUndefined();
  });
});

describe("updateNote", () => {
  it("updates the text of a non-deleted note", async () => {
    noteUpdateMany.mockResolvedValue({ count: 1 });
    await expect(
      updateNote(tx, "note-1", { text: "Updated text" }),
    ).resolves.toBeUndefined();
    expect(noteUpdateMany).toHaveBeenCalledWith({
      where: { id: "note-1", deletedAt: null },
      data: { text: "Updated text" },
    });
  });
  it("throws NoteNotFoundEror when the note is missing or already deleted", async () => {
    noteUpdateMany.mockResolvedValue({ count: 0 });
    await expect(
      updateNote(tx, "note-gone", { text: "Updated text" }),
    ).rejects.toBeInstanceOf(NoteNotFoundError);
  });
});

describe("deleteNote", () => {
  it("soft-delete a non-deleted note by setting deletedAt", async () => {
    noteUpdateMany.mockResolvedValue({ count: 1 });
    await expect(deleteNote(tx, "note-1")).resolves.toBeUndefined();
    expect(noteUpdateMany).toHaveBeenCalledWith({
      where: { id: "note-1", deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
  });
  it("throws NoteNotFoundError when the note is missing or already deleted", async () => {
    noteUpdateMany.mockResolvedValue({ count: 0 });

    await expect(deleteNote(tx, "note-gone")).rejects.toThrow(
      "Note note-gone not found or already deleted",
    );
  });
});
