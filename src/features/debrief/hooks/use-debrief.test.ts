// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DEBRIEF_POLL_INTERVAL_MS } from "@/config/constants";
import { debriefPollInterval } from "./use-debrief";

describe("debriefPollInterval", () => {
  it("polls while a run is in flight", () => {
    expect(debriefPollInterval({ status: "Generating" })).toBe(
      DEBRIEF_POLL_INTERVAL_MS,
    );
  });

  it("stops once the run reaches a terminal state", () => {
    // Polling a finished debrief is a request per interval per open tab, for
    // a result that cannot change until someone asks for a new run.
    expect(debriefPollInterval({ status: "Ready" })).toBe(false);
    expect(debriefPollInterval({ status: "Failed" })).toBe(false);
  });

  it("does not poll when there is no debrief", () => {
    // A reader with no department never gets one, so a poll would never end.
    expect(debriefPollInterval(null)).toBe(false);
    expect(debriefPollInterval(undefined)).toBe(false);
  });
});
