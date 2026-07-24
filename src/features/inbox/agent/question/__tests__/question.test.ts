import { describe, expect, it } from "vitest";
import type { QuestionContext } from "../context";
import { planQuestionWrites } from "../process_output";
import type { QuestionResult } from "../schema";

const context: QuestionContext = {
  notificationId: "notif_1",
  markdown: "",
  issues: [
    {
      issueId: "issue_1",
      vulnerabilityId: "vuln_a",
    },
    {
      issueId: "issue_2",
      vulnerabilityId: "vuln_b",
    },
  ],
};

describe("planQuestionWrites", () => {
  it("creates an op for a valid, in-scope issue with a complete question", () => {
    const result: QuestionResult = {
      issue_1: {
        title: "Is this inusion pump reachable from the guest Wi-Fi VLAN?",
        reasonWhy:
          "Reachability determines whether the exploit is remotely triggerable. VEX flagged this as unresolved.",
        suggestedAnswers: [
          "Yes, it's reachable from guest Wi-Fi",
          "No, it's on an isolated clinical VLAN",
          "It's segmented but I'm not certain of the boundary",
        ],
      },
    };

    expect(planQuestionWrites(context, result)).toEqual([
      {
        issueId: "issue_1",
        notificationId: "notif_1",
        title: "Is this inusion pump reachable from the guest Wi-Fi VLAN?",
        reasonWhy:
          "Reachability determines whether the exploit is remotely triggerable. VEX flagged this as unresolved.",
        suggestedAnswers: [
          "Yes, it's reachable from guest Wi-Fi",
          "No, it's on an isolated clinical VLAN",
          "It's segmented but I'm not certain of the boundary",
        ],
      },
    ]);
  });

  it("skips an entry with an empty or whitespace-only title", () => {
    const result: QuestionResult = {
      issue_1: {
        title: "  ",
        reasonWhy: "some reasons",
        suggestedAnswers: ["A", "B"],
      },
    };

    expect(planQuestionWrites(context, result)).toEqual([]);
  });

  it("skips an entry with fewer than two suggested answers", () => {
    const result: QuestionResult = {
      issue_1: {
        title: "some title",
        reasonWhy: "some reasons",
        suggestedAnswers: ["only one suggested answer"],
      },
    };

    expect(planQuestionWrites(context, result)).toEqual([]);
  });

  it("treats an omitted issue as no question - not an error", () => {
    const result: QuestionResult = { issue_1: undefined };
    expect(planQuestionWrites(context, result)).toEqual([]);
  });

  it("handles multiple valid issues in one result", () => {
    const result: QuestionResult = {
      issue_1: {
        title: "title one",
        reasonWhy: "some reasons",
        suggestedAnswers: ["A", "B"],
      },
      issue_2: {
        title: "title two",
        reasonWhy: "some reasons",
        suggestedAnswers: ["C", "D"],
      },
    };
    expect(planQuestionWrites(context, result)).toHaveLength(2);
  });
});
