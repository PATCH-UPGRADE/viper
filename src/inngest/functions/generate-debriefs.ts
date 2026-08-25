import "server-only";
import { runDebriefScout } from "@/features/agents/debrief/scout";
import { writeDepartmentDebrief } from "@/features/agents/debrief/writer";
import { claimDebriefRun, parseBullets } from "@/features/debrief/server/runs";
import prisma from "@/lib/db";
import { inngest } from "../client";
import {
  DEBRIEF_EVENT,
  type DebriefEventData,
  debriefEvent,
} from "../events/debrief";

/** Open work orders shown to the writer, newest first. */
const WORK_ORDER_LIMIT = 10;

/**
 * Departments per batched send. Each event carries the full findings text (up
 * to MAX_FINDINGS_CHARS), so an unbounded batch grows with department count.
 */
const SEND_BATCH_SIZE = 20;

/**
 * Survey the fleet once, then fan out one write per department.
 *
 * 05:00 is after the 02:00 vulnerability enrichment, so the scout reads freshly
 * enriched EPSS and KEV data.
 *
 * The scout is the expensive half — one thinking pass with tool calls — so it
 * runs once here and every department's writer reuses its findings.
 */
export const generateAllDebriefs = inngest.createFunction(
  { id: "generate-all-debriefs" },
  { cron: "0 5 * * *" },
  async ({ step, logger }) => {
    // Departments with no users have nobody to read a debrief.
    const departments = await step.run("load-departments", () =>
      prisma.department.findMany({
        where: { users: { some: {} } },
        select: { id: true },
      }),
    );

    if (departments.length === 0) {
      logger.info("No departments with users; skipping debrief run");
      return { departmentCount: 0 };
    }

    // Runs before the fan-out and throws on an empty survey, so a failed
    // scout costs nothing rather than fanning out N writers with no input.
    const findings = await step.run("scout", () => runDebriefScout());

    const claims = await step.run("claim-runs", async () =>
      Promise.all(
        departments.map(async (department) => ({
          department,
          claim: await claimDebriefRun(department.id),
        })),
      ),
    );

    // A department whose previous run is still active keeps it; re-requesting
    // would be deduplicated by the idempotency key anyway.
    const fresh = claims.filter(({ claim }) => claim.created);

    // Chunked: one batched request carrying N x MAX_FINDINGS_CHARS approaches
    // Inngest's event-API request limit, and a 413 fails the whole fan-out at
    // once rather than one department.
    for (let i = 0; i < fresh.length; i += SEND_BATCH_SIZE) {
      const batch = fresh.slice(i, i + SEND_BATCH_SIZE);
      await step.sendEvent(
        `request-department-debriefs-${i / SEND_BATCH_SIZE}`,
        batch.map(({ department, claim }) =>
          debriefEvent(claim.id, department.id, findings),
        ),
      );
    }

    return {
      departmentCount: fresh.length,
      skipped: claims.length - fresh.length,
    };
  },
);

/**
 * Write one department's debrief into its claimed row.
 *
 * Concurrency is keyed on the department so two runs for the same department
 * cannot interleave their writes. Idempotency is keyed on the row id, so a
 * duplicated event is a no-op rather than a second agent call.
 */
export const generateDepartmentDebrief = inngest.createFunction(
  {
    id: "generate-department-debrief",
    idempotency: "event.data.key",
    concurrency: { key: "event.data.departmentId", limit: 1 },
  },
  { event: DEBRIEF_EVENT },
  async ({ event, step }) => {
    const { debriefId, departmentId, findings } =
      event.data as DebriefEventData;
    // Each step needs a distinct id, so number the beats.
    let beatCount = 0;

    try {
      const context = await step.run("load-context", async () => {
        const [department, previous, workOrders] = await Promise.all([
          prisma.department.findUnique({
            where: { id: departmentId },
            select: { name: true, description: true },
          }),
          prisma.debrief.findFirst({
            where: { departmentId, status: "Ready" },
            orderBy: { createdAt: "desc" },
            select: { bullets: true },
          }),
          prisma.workOrderTicket.findMany({
            where: {
              departments: { some: { id: departmentId } },
              status: { not: "DONE" },
              isDraft: false,
            },
            orderBy: { updatedAt: "desc" },
            take: WORK_ORDER_LIMIT,
            select: { summary: true, status: true },
          }),
        ]);

        if (!department)
          throw new Error(`Department ${departmentId} not found`);

        return {
          departmentName: department.name,
          departmentDescription: department.description,
          previousBullets: previous ? parseBullets(previous.bullets) : [],
          workOrders: workOrders.map((w) => `${w.summary} (${w.status})`),
        };
      });

      // Claim progress before the slow work, not after. The staleness bound
      // reads `updatedAt`, so a touch that happens only after a multi-minute
      // scout measures age rather than progress, and a second click meanwhile
      // opens a duplicate run that pays for its own scout and writer.
      const beat = () =>
        step.run(`heartbeat-${beatCount++}`, () =>
          prisma.debrief.update({
            where: { id: debriefId },
            data: { status: "Generating" },
            select: { id: true },
          }),
        );

      await beat();

      // Only the manual path arrives without findings, because its caller has
      // no fleet-wide survey to share.
      const surveyed =
        findings ?? (await step.run("scout", () => runDebriefScout()));

      await beat();

      const written = await step.run("write", () =>
        writeDepartmentDebrief({ ...context, findings: surveyed }),
      );

      return await step.run("persist", async () => {
        // An empty result means every bullet collapsed during repair. There is
        // nothing to show, and Ready with no bullets renders an empty card.
        //
        // One update either way: two branches drifted once already, leaving the
        // previous run's bullets on a Failed row because only the Ready branch
        // reset them.
        const ok = written.bullets.length > 0;

        await prisma.debrief.update({
          where: { id: debriefId },
          data: ok
            ? {
                status: "Ready",
                bullets: written.bullets,
                model: written.model,
                error: null,
              }
            : {
                status: "Failed",
                bullets: [],
                error: "Writer produced no usable bullets",
              },
        });

        return {
          debriefId,
          bulletCount: written.bullets.length,
          status: ok ? ("Ready" as const) : ("Failed" as const),
        };
      });
    } catch (err) {
      // Never leave a row stuck on Generating: the in-flight guard would then
      // block this department until the staleness bound expires.
      const message = err instanceof Error ? err.message : String(err);
      await step.run("mark-failed", async () => {
        try {
          await prisma.debrief.update({
            where: { id: debriefId },
            data: { status: "Failed", error: message },
            select: { id: true },
          });
        } catch {
          // The row can be gone — a department deleted mid-run cascades to its
          // debriefs, and Prisma then throws P2025. Swallow it so the original
          // failure below is what surfaces, not a confusing "record not found".
        }
      });
      throw err;
    }
  },
);
