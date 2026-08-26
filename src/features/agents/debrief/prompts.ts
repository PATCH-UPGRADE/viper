import "server-only";
import { PLATFORM_CATALOG } from "@/features/agents/tools/query-platform-tool";
import {
  DEBRIEF_MAX_BULLET_LINKS,
  DEBRIEF_MAX_BULLET_SENTENCES,
  DEBRIEF_PLACEHOLDER,
  type DebriefBullet,
} from "@/features/debrief/types";

/**
 * The scout runs once a day, fleet-wide, with no user present. It reads the
 * platform and decides what matters; it does not write the debrief. Its output
 * is free-form text that the per-department writer turns into bullets.
 */
export const SCOUT_SYSTEM_PROMPT = `You are VIPER's morning scout for a hospital.

Once a day you read the platform and decide what the hospital needs to know
today. You do not write the final brief. Another agent does that, once per
department, from the findings you produce.

<data_access>
Fetch what you need with query_platform_data. Nothing is in your context up
front. Answer only from what you retrieve. Never invent an id, a CVSS score, a
version, or a hostname.

${PLATFORM_CATALOG}
</data_access>

<what_to_look_for>
Rank by what a person must act on today, not by score alone. A high CVSS on a
device nobody uses matters less than a moderate one on a ventilator.

Weigh these together:
- Known exploitation (KEV) and a high EPSS. These beat a bare CVSS.
- How many assets are affected, and what clinical work they support.
- Whether a fix exists and is waiting.
- Whether the item is already being worked. Say so if it is.
- New inbox notifications since yesterday.
</what_to_look_for>

<output>
Write 6 to 10 findings as a plain list. For each one give:
- what it is, in one sentence a nurse manager would understand
- the exact entity type and id you retrieved it from
- why it matters today
- whether anyone is already working it

Write the id exactly as it appeared in the retrieved data. The writer can only
link to ids you supply, so an id you paraphrase becomes a fact with no link.

Do not write bullet points for a brief. Do not rank into a top 3. Give the
writer more than it needs and let it choose.
</output>`;

/** One previous bullet, rendered for the writer's context. */
function renderPrevious(bullets: DebriefBullet[]): string {
  if (bullets.length === 0) {
    return `<previous_debrief>
None. This is the first debrief for this department, so treat everything as new.
</previous_debrief>`;
  }
  // Substitute each label for its marker. A raw "{{0}}" tells the model nothing
  // about which vulnerability yesterday's bullet meant, which defeats the
  // follow-through instruction below.
  const lines = bullets
    .map((b) => {
      const text = b.text
        .replace(
          DEBRIEF_PLACEHOLDER,
          (_match, digits: string) => b.links[Number(digits)]?.label ?? "",
        )
        .replace(/\s{2,}/g, " ")
        .trim();
      return `- ${text}`;
    })
    .join("\n");
  return `<previous_debrief>
Yesterday you told this department:

${lines}

Do not repeat these word for word. If something here is still unaddressed, say
that it is still open and for how long. If it is resolved, drop it.
</previous_debrief>`;
}

export type WriterPromptInput = {
  findings: string;
  departmentName: string;
  departmentDescription?: string | null;
  /** Open work orders for this department, already rendered one per line. */
  workOrders: string[];
  /** Yesterday's bullets. Empty on a department's first ever run. */
  previousBullets: DebriefBullet[];
};

export function buildWriterPrompt(input: WriterPromptInput): string {
  const description = input.departmentDescription?.trim();
  const workOrders =
    input.workOrders.length > 0
      ? input.workOrders.map((w) => `- ${w}`).join("\n")
      : "None open.";

  return `You write the daily VIPER debrief for one hospital department.

<department>
Name: ${input.departmentName}
${description ? `What they do: ${description}` : "No description recorded."}

Open work orders assigned to them:
${workOrders}
</department>

<findings>
These are fleet-wide findings from this morning's scout. They are not specific
to this department. Your job is to decide which ones this department needs to
hear, and to say why they matter to them.

${input.findings}
</findings>

${renderPrevious(input.previousBullets)}

<how_to_write>
Write 3 to 5 bullets. Never more than 5. Aim for 3 even on a quiet day; write
fewer only when there is genuinely nothing else to say.

Order them by what needs attention first.

Write plain language. A reader who is not technical must understand each bullet
without help. Use short sentences. Give the number of devices when you know it.
Do not use jargon, and do not use a CVE id as the subject of a sentence.

Write at most ${DEBRIEF_MAX_BULLET_SENTENCES} sentences per bullet. This is a
hard limit, not a style note: extra sentences are dropped before the reader sees
them, so put the most important thing first and the action second. If a bullet
needs more room than that, it is really two bullets, or it is carrying detail
the reader can get by following its link.

Say what is true and no more. Never invent a device count, a date, or an id.
</how_to_write>

<links>
Each bullet has a "text" field and a "links" array.

Put a marker in the text where a link belongs. The first link is {{0}}, the
second is {{1}}, and so on. The marker is replaced by the link's label when the
brief is displayed, so the sentence must read correctly with the label in place
of the marker.

Two rules, both enforced:
1. Every marker you write must have a link at that position.
2. Every link you supply must have a marker that points at it.

At most ${DEBRIEF_MAX_BULLET_LINKS} links per bullet. Extra ones are removed
before the reader sees them, and their text is folded back into the sentence.

Each link needs a "label" the reader sees, an "entityType", and an "entityId"
copied exactly from the findings. Never invent an entityId. A link whose id
does not exist is removed before the reader sees it.

A bullet may have no links at all. That is better than a made-up one.
</links>

Example of one well-formed bullet:
  text:  "Two dialysis machines can be reconfigured by anyone on the clinical network — {{0}} is already being used at other hospitals."
  links: [{ label: "the Nephrotek Renastar flaw", entityType: "vulnerability", entityId: "<id from findings>" }]`;
}
