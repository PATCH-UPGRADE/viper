// Extract potential VIPER db items from a notification (e.g, find potential device groups)

import "server-only";
import { ChatAnthropic } from "@langchain/anthropic";
import { z } from "zod";
import { buildUserMessage } from "@/lib/agent-messages";
import { fetchPdfAttachments } from "../utils";
import { emailPromptText, type InboundEmail } from "./prompt";

// A device group referenced by a notification. All fields are optional so the
// model can emit whatever identifiers it finds; downstream code skips entries
// with no usable identifier.
// vers schema, if we provide that + maybe a skill to use it if necessary, has a way to provide multiple OR versions
//  https://www.packageurl.org/docs/vers/schemas
// TODO: if we can find more data to support this, add something like serialRange
// TODO: What about more unique ID's for specific vendors? e.g, Siemens has material number as a unique device group code
//    something like externalId on an Integration model
export const extractedDeviceGroupSchema = z.object({
  cpe: z.string().nullish(),
  udi: z.string().nullish(),
  manufacturer: z.string().nullish(),
  modelName: z.string().nullish(),
  version: z.string().nullish(),
  versionRange: z.string().nullish(),
});

export const extractedVulnerabilitySchema = z.object({
  cveId: z
    .string()
    .regex(/^CVE-\d{4}-\d{4,}$/i)
    .nullish(),
  cvssScore: z.number().min(0).max(10).nullish(),
  cvssVector: z.string().nullish(),
});

export const extractedRemediationSchema = z.object({
  linkedCveId: z
    .string()
    .regex(/^CVE-\d{4}-\d{4,}$/i)
    .nullish(),
  description: z.string().nullish(),
});

export const extractedAssetSchema = z.object({
  ip: z.string().nullish(),
  hostname: z.string().nullish(),
  macAddress: z.string().nullish(),
  serialNumber: z.string().nullish(),
});

export const extractSchema = z.object({
  deviceGroups: z.array(extractedDeviceGroupSchema),
  vulnerabilities: z.array(extractedVulnerabilitySchema),
  remediations: z.array(extractedRemediationSchema),
  assets: z.array(extractedAssetSchema),
});

export type ExtractedDeviceGroup = z.infer<typeof extractedDeviceGroupSchema>;
export type ExtractedVulnerability = z.infer<
  typeof extractedVulnerabilitySchema
>;
export type ExtractedRemediation = z.infer<typeof extractedRemediationSchema>;
export type ExtractedAsset = z.infer<typeof extractedAssetSchema>;
export type ExtractResult = z.infer<typeof extractSchema>;

const MODEL = "claude-haiku-4-5-20251001";

// cvssScore format reference: https://nvd.nist.gov/vuln-metrics/cvss
const SYSTEM_PROMPT = `You are an extraction agent for a hospital cybersecurity platform that reads security notifications (advisories, recalls, update notices) and their PDF attachments.

Your task: extract the following Entities that the notification is about. 

FOR DEVICE GROUPS: A device group is a class of affected product, identified by some combination of:
- CPE string (e.g. "cpe:2.3:a:vendor:product:1.0:*:*:*:*:*:*:*")
- UDI: the FDA-assigned Device Identifier (DI) - a fixed code identifying the labeler and specific device model (e.g, "04048675556176"), distinct from a CPE. If the notification quotes a full UDI label string that also encodes a Production Identifier (PI) in GS1 format "(01) 00855361005016", extract ONLY the DI segment.
- manufacturer / vendor (e.g. "Philips", "GE Healthcare")
- model name (e.g. "IntelliVue MX40", "Alaris Pump")
- version / firmware (e.g. "2.3.1")
- versionRange: if the notification specifies a range (e.g. "affects firmware 2.1 through 2.3"), express it as a VERS string (e.g, "vers:generic />2.1|<=2.3"). Omit if only a single exact version is mentioned.

FOR VULNERABILITIES: CVEids or security issues explicitly named
- cveId: must match format CVE-YYYY-NNNNN (e.g CVE-2020-25175). Omit if not explicitly named.
- cvssScore: the CVSS base score(0.0-10.0), only if explicity stated. Omit if not given.
- cvssVector: the CVSS vector string (e.g CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H), only if explicitly stated. Omit if not given.

FOR REMEDIATIONS: Patches, firmware updates, or mitigations explicitly described
- linkedCveId: must match format CVE-YYYY-NNNNN (e.g CVE-2020-25175). Omit if not explicitly named.
- description: a short description of the fix (e.g Apply GE Healthcare ICS security controls per CISA advisory)

FOR ASSETS: Specific devices named by network identity
- ip address: (in IPv4 or IPv6 format)
- hostname: A structured breakdown of standard healthcare hostnames uses a format like: [Location]-[Device][OS]-[ID] (e.g ER-DW-0452)
- macAddress: A MAC address is a 12-character physical hardware identifier formatted in hexadecimal (using 0-9 and A-F). For example, a Philips patient monitor network card has the MAC address 00:30:A3:1B:4C:D2.
- serialNumber: A hospital asset serial number uniquely identifies an individual piece of medical, IT, or facility equipment. Serial numbers are assigned by the manufacturer and are immutable, whereas asset tag numbers are assigned by the hospital for tracking purposes (e.g Infusion Pump: SN: 702-839201-A, Defibrillator: SN: US22045981)

RULES:
- Extract ONLY Entities explicitly referenced in the notification or its attachments.
- Omit any field you are unsure about; do not guess or fabricate CPEs, models, or versions.
- If the notification references no specific info, return an empty array for each entity.
- Each distinct affected product/vulnerability/remediation/asset should be its own entry.`;

export async function extractEntities(
  sourceId: string,
  email: InboundEmail,
): Promise<ExtractResult> {
  const pdfAttachments = await fetchPdfAttachments(sourceId);

  const model = new ChatAnthropic({
    model: MODEL,
    maxTokens: 2048,
  }).withStructuredOutput(extractSchema);

  return model.invoke([
    { role: "system", content: SYSTEM_PROMPT },
    buildUserMessage(
      emailPromptText(email, "NOTIFICATION BODY"),
      pdfAttachments,
    ),
  ]);
}
