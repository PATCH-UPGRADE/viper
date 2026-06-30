// Extract potential VIPER db items from a notification (e.g, find potential device groups)

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { fetchPdfAttachments } from "../utils";

// A device group referenced by a notification. All fields are optional so the
// model can emit whatever identifiers it finds; downstream code skips entries
// with no usable identifier.
// TODO: add new fields like UDI after VW-283 gets merged in
// TODO: add new fields like versionRange after VW-283 gets merged in (used to create a DeviceGroupMatchObject?)
// vers schema, if we provide that + maybe a skill to use it if necessary, has a way to provide multiple OR versions
//  https://www.packageurl.org/docs/vers/schemas
// TODO: if we can find more data to support this, add something like serialRange
// TODO: What about more unique ID's for specific vendors? e.g, Siemens has material number as a unique device group code
//    something like externalId on an Integration model
export const extractedDeviceGroupSchema = z.object({
  cpe: z.string().nullish(),
  manufacturer: z.string().nullish(),
  modelName: z.string().nullish(),
  version: z.string().nullish(),
  versionRange: z.string().nullish(),
});

export const extractedVulnerabilitySchema = z.object({
  cveId: z.string().regex(/^CVE-\d{4}-\d{4,}$/i).nullish(), 
  manufacturer: z.string().nullish(),
  modelName: z.string().nullish()
})

// TODO: extend this, which has just device groups for now, with vulnerabilities
// and remediations
export const extractSchema = z.object({
  deviceGroups: z.array(extractedDeviceGroupSchema),
  vulnerabilities: z.array(extractedVulnerabilitySchema)
});

export type ExtractedDeviceGroup = z.infer<typeof extractedDeviceGroupSchema>;
export type ExtractedVulnerability = z.infer<typeof extractedVulnerabilitySchema>;
export type ExtractResult = z.infer<typeof extractSchema>;

const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You are an extraction agent for a hospital cybersecurity platform that reads security notifications (advisories, recalls, update notices) and their PDF attachments.

Your task: extract the DEVICE GROUPS and VULNERABILITIES that the notification is about. A device group is a class of affected product, identified by some combination of:

For DEVICE GROUPS:
- CPE string (e.g. "cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*")
- manufacturer / vendor (e.g. "Philips", "GE Healthcare")
- model name (e.g. "IntelliVue MX40", "Alaris Pump")
- version / firmware (e.g. "2.3.1")
- versionRange: if the notification specifies a range (e.g. "affects firmware 2.1 through 2.3"), express it as a VERS string (e.g, "vers:generic />2.1|<=2.3"). Omit if only a single exact version is mentioned.

FOR VULNERABILITIES: CVEids or security issues explicitly named
- cveId: must match format CVE-YYYY-NNNNN (e.g CVE-2020-25175). Omit if not explicitly named.
- manufacturer / modelName of the affected device if mentioned alongside the CVE

RULES:
- Extract ONLY device groups explicitly referenced in the notification or its attachments.
- Omit any field you are unsure about; do not guess or fabricate CPEs, models, or versions.
- If the notification references no specific device, return an empty deviceGroups array.
- Each distinct affected product should be its own entry.`;

export async function extractEntities(
  sourceId: string,
  email: { from: string; subject: string | null; markdown: string },
): Promise<ExtractResult> {
  const pdfAttachments = await fetchPdfAttachments(sourceId);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2048,
  }).withStructuredOutput(extractSchema);

  const textPrompt = `From: ${email.from}
Subject: ${email.subject ?? "(no subject)"}

--- NOTIFICATION BODY ---
${email.markdown}`;

  const userContent = [
    { type: "text" as const, text: textPrompt },
    ...pdfAttachments.map((pdf) => ({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdf.base64,
      },
      title: pdf.filename ?? "attachment.pdf",
    })),
  ];

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    // biome-ignore lint/suspicious/noExplicitAny: cast userContent type for langchain
    new HumanMessage({ content: userContent as any }),
  ]);
}
