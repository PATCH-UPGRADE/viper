import { NoteStatus } from "@/generated/prisma";
import prisma from "@/lib/db";

const SAMPLE_NOTES = [
  {
    text: "The hospital is a rural, critical access hospital with 12 inpatient beds.",
  },
  {
    text: "If applying a patch to an OT device, unless it has already been tested by the manufacturer, the device should be validated after patching to ensure that its essential clinical functionality hasn't been compromised. This process can often be time intensive and should be accounted for as applicable in remediation recommendations.",
  },
];

export async function seedNotes(userId: string) {
  console.log("\n🌱 Seeding notes...");

  const notes = await Promise.all(
    SAMPLE_NOTES.map((note) =>
      prisma.note.create({
        data: {
          text: note.text,
          status: NoteStatus.PERSISTENT,
          userId,
        },
      }),
    ),
  );

  console.log(`✅ Seeded ${notes.length} notes`);
  return notes;
}
