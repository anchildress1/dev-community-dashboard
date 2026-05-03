import { describe, it, expect, vi, afterEach } from "vitest";
import type { Post } from "@/types/dashboard";
import {
  getAttentionVariant,
  getCategoryLabel,
  getCategoryTooltip,
  getRecentPostBadgeVariant,
  getQualitativeLevel,
  getScoreQualitativeLabel,
  getScoreBarClass,
  extractWordCount,
  parseScoreBreakdown,
  getScoreNarrative,
  getCategoryDisplayName,
  formatSignalDisplay,
  getWhatsHappening,
  getSignalName,
  computeAgeHours,
  sortByAttentionPriority,
  getSignalSummary,
  ATTENTION_META,
  SIGNAL_TOOLTIPS,
  DISCUSSION_STATE_SIGNALS,
  ATTENTION_PRIORITY,
} from "./dashboard-helpers";

describe("getAttentionVariant", () => {
  it("returns correct variant for each known attention level", () => {
    expect(getAttentionVariant("NEEDS_SUPPORT")).toBe("rose");
    expect(getAttentionVariant("NORMAL")).toBe("neutral");
    expect(getAttentionVariant("BOOST_VISIBILITY")).toBe("lime");
    expect(getAttentionVariant("NEEDS_RESPONSE")).toBe("violet");
    expect(getAttentionVariant("NEEDS_REVIEW")).toBe("warm");
    expect(getAttentionVariant("SIGNAL_AT_RISK")).toBe("warm");
    expect(getAttentionVariant("SILENT_SIGNAL")).toBe("violet");
  });

  it("returns neutral for unknown levels", () => {
    expect(getAttentionVariant("UNKNOWN")).toBe("neutral");
    expect(getAttentionVariant("")).toBe("neutral");
  });
});

describe("getCategoryLabel", () => {
  it("returns correct label for each known attention level", () => {
    expect(getCategoryLabel("NEEDS_SUPPORT")).toBe("Needs Support");
    expect(getCategoryLabel("NORMAL")).toBe("Steady Signal");
    expect(getCategoryLabel("BOOST_VISIBILITY")).toBe("Trending Signal");
    expect(getCategoryLabel("NEEDS_RESPONSE")).toBe("Awaiting Collaboration");
    expect(getCategoryLabel("NEEDS_REVIEW")).toBe("Rapid Discussion");
    expect(getCategoryLabel("SIGNAL_AT_RISK")).toBe("Anomalous Signal");
    expect(getCategoryLabel("SILENT_SIGNAL")).toBe("Silent Signal");
  });

  it("returns default label for unknown levels", () => {
    expect(getCategoryLabel("UNKNOWN")).toBe("Steady Signal");
    expect(getCategoryLabel("")).toBe("Steady Signal");
  });
});

describe("getCategoryTooltip", () => {
  it("returns a tooltip for every known attention level", () => {
    expect(getCategoryTooltip("NEEDS_SUPPORT")).toContain("Needs Support");
    expect(getCategoryTooltip("NORMAL")).toContain("Steady Signal");
    expect(getCategoryTooltip("BOOST_VISIBILITY")).toContain("Trending Signal");
    expect(getCategoryTooltip("NEEDS_REVIEW")).toContain("Rapid Discussion");
    expect(getCategoryTooltip("SIGNAL_AT_RISK")).toContain("Anomalous Signal");
    expect(getCategoryTooltip("SILENT_SIGNAL")).toContain("Silent Signal");
  });

  it("returns a tooltip for NEEDS_SUPPORT with empathetic helper text", () => {
    const tooltip = getCategoryTooltip("NEEDS_SUPPORT");
    expect(tooltip).toBeDefined();
    expect(tooltip).toContain("emotional distress");
    expect(tooltip).toContain("empathetic community response");
  });

  it("returns a tooltip for NEEDS_RESPONSE without help-word enumeration", () => {
    const tooltip = getCategoryTooltip("NEEDS_RESPONSE");
    expect(tooltip).toBeDefined();
    expect(tooltip).toContain("Awaiting Collaboration");
    expect(tooltip).not.toContain("need help");
    expect(tooltip).not.toContain("stuck");
  });

  it("returns undefined only for unknown levels", () => {
    expect(getCategoryTooltip("UNKNOWN")).toBeUndefined();
    expect(getCategoryTooltip("")).toBeUndefined();
  });
});

describe("getRecentPostBadgeVariant", () => {
  it("maps neutral to outline for recent posts", () => {
    expect(getRecentPostBadgeVariant("NORMAL")).toBe("outline");
  });

  it("preserves non-neutral variants", () => {
    expect(getRecentPostBadgeVariant("NEEDS_SUPPORT")).toBe("rose");
    expect(getRecentPostBadgeVariant("BOOST_VISIBILITY")).toBe("lime");
    expect(getRecentPostBadgeVariant("NEEDS_RESPONSE")).toBe("violet");
    expect(getRecentPostBadgeVariant("NEEDS_REVIEW")).toBe("warm");
    expect(getRecentPostBadgeVariant("SIGNAL_AT_RISK")).toBe("warm");
    expect(getRecentPostBadgeVariant("SILENT_SIGNAL")).toBe("violet");
  });

  it("returns outline for unknown levels (defaults to neutral → outline)", () => {
    expect(getRecentPostBadgeVariant("UNKNOWN")).toBe("outline");
  });
});

describe("getQualitativeLevel", () => {
  it("returns Elevated for scores >= 50", () => {
    expect(getQualitativeLevel(50)).toBe("Elevated");
    expect(getQualitativeLevel(100)).toBe("Elevated");
  });

  it("returns Notable for scores >= 20 and < 50", () => {
    expect(getQualitativeLevel(20)).toBe("Notable");
    expect(getQualitativeLevel(49)).toBe("Notable");
  });

  it("returns Nominal for scores < 20", () => {
    expect(getQualitativeLevel(0)).toBe("Nominal");
    expect(getQualitativeLevel(19)).toBe("Nominal");
  });
});

describe("getScoreQualitativeLabel", () => {
  describe("heat category", () => {
    it("returns Elevated for heat >= 10", () => {
      expect(getScoreQualitativeLabel("heat", 10)).toBe("Elevated");
      expect(getScoreQualitativeLabel("heat", 15)).toBe("Elevated");
    });

    it("returns Notable for heat >= 5 and < 10", () => {
      expect(getScoreQualitativeLabel("heat", 5)).toBe("Notable");
      expect(getScoreQualitativeLabel("heat", 9)).toBe("Notable");
    });

    it("returns Nominal for heat < 5", () => {
      expect(getScoreQualitativeLabel("heat", 0)).toBe("Nominal");
      expect(getScoreQualitativeLabel("heat", 4)).toBe("Nominal");
    });
  });

  describe("risk category", () => {
    it("returns Elevated for risk >= 4", () => {
      expect(getScoreQualitativeLabel("risk", 4)).toBe("Elevated");
      expect(getScoreQualitativeLabel("risk", 8)).toBe("Elevated");
    });

    it("returns Notable for risk >= 1 and < 4", () => {
      expect(getScoreQualitativeLabel("risk", 1)).toBe("Notable");
      expect(getScoreQualitativeLabel("risk", 3)).toBe("Notable");
    });

    it("returns Nominal for risk < 1", () => {
      expect(getScoreQualitativeLabel("risk", 0)).toBe("Nominal");
    });
  });

  describe("support category", () => {
    it("returns Elevated for support >= 4", () => {
      expect(getScoreQualitativeLabel("support", 4)).toBe("Elevated");
    });

    it("returns Notable for support >= 2 and < 4", () => {
      expect(getScoreQualitativeLabel("support", 2)).toBe("Notable");
      expect(getScoreQualitativeLabel("support", 3)).toBe("Notable");
    });

    it("returns Nominal for support < 2", () => {
      expect(getScoreQualitativeLabel("support", 0)).toBe("Nominal");
      expect(getScoreQualitativeLabel("support", 1)).toBe("Nominal");
    });
  });

  it("falls back to getQualitativeLevel for unknown categories", () => {
    expect(getScoreQualitativeLabel("unknown", 50)).toBe("Elevated");
    expect(getScoreQualitativeLabel("unknown", 20)).toBe("Notable");
    expect(getScoreQualitativeLabel("unknown", 5)).toBe("Nominal");
  });
});

describe("getScoreBarClass", () => {
  it("returns bg-state-negative for values > 20", () => {
    expect(getScoreBarClass(21)).toBe("bg-state-negative");
    expect(getScoreBarClass(50)).toBe("bg-state-negative");
  });

  it("returns bg-state-warning for values > 10 and <= 20", () => {
    expect(getScoreBarClass(11)).toBe("bg-state-warning");
    expect(getScoreBarClass(20)).toBe("bg-state-warning");
  });

  it("returns bg-accent-primary for values <= 10", () => {
    expect(getScoreBarClass(0)).toBe("bg-accent-primary");
    expect(getScoreBarClass(10)).toBe("bg-accent-primary");
  });
});

describe("extractWordCount", () => {
  it("extracts word count from explanations", () => {
    expect(extractWordCount(["Word Count: 1200"])).toBe(1200);
    expect(extractWordCount(["Other: thing", "Word Count: 500"])).toBe(500);
  });

  it("returns 0 when no word count is present", () => {
    expect(extractWordCount(["Heat Score: 5"])).toBe(0);
    expect(extractWordCount([])).toBe(0);
  });

  it("returns 0 for undefined/no explanations", () => {
    expect(extractWordCount(undefined)).toBe(0);
  });

  it("returns 0 when word count line has no digits", () => {
    expect(extractWordCount(["Word Count: "])).toBe(0);
    expect(extractWordCount(["Word Count: abc"])).toBe(0);
  });
});

describe("parseScoreBreakdown", () => {
  it("parses heat, risk, and support scores", () => {
    const explanations = [
      "Heat Score: 7.50",
      "Risk Score: 2 (freq: 0, promo: 1, engage: -1)",
      "Support Score: 3",
    ];
    const result = parseScoreBreakdown(explanations);
    expect(result).toEqual({ heat: 7.5, risk: 2, support: 3 });
  });

  it("returns empty object for undefined", () => {
    expect(parseScoreBreakdown(undefined)).toEqual({});
  });

  it("returns empty object for empty array", () => {
    expect(parseScoreBreakdown([])).toEqual({});
  });

  it("handles partial explanations", () => {
    expect(parseScoreBreakdown(["Heat Score: 3.00"])).toEqual({ heat: 3 });
  });

  it("ignores non-score explanations", () => {
    expect(
      parseScoreBreakdown(["Word Count: 500", "Attention Delta: 2.0"]),
    ).toEqual({});
  });

  it("skips risk when 'Risk Score:' line has no numeric value", () => {
    const result = parseScoreBreakdown(["Risk Score: "]);
    // Number.parseFloat(" ") → NaN — regex won't match, so risk is not added
    expect(result).toEqual({});
  });
});

describe("getScoreNarrative", () => {
  describe("heat narratives", () => {
    it("returns high narrative for heat >= 10", () => {
      expect(getScoreNarrative("heat", 10)).toBe(
        "Reply rate is higher than typical; reactions are mixed.",
      );
    });

    it("returns moderate narrative for heat >= 5", () => {
      expect(getScoreNarrative("heat", 5)).toBe(
        "Replies are arriving faster than usual.",
      );
    });

    it("returns low narrative for heat < 5", () => {
      expect(getScoreNarrative("heat", 2)).toBe(
        "Normal conversation pace with steady engagement.",
      );
    });
  });

  describe("risk narratives", () => {
    it("returns high narrative for risk >= 6", () => {
      expect(getScoreNarrative("risk", 6)).toBe(
        "Significant divergence from typical community patterns; human review recommended.",
      );
    });

    it("returns moderate narrative for risk >= 4", () => {
      expect(getScoreNarrative("risk", 4)).toBe(
        "Noticeable deviation from normal discussion behavior.",
      );
    });

    it("returns minor narrative for risk >= 1", () => {
      expect(getScoreNarrative("risk", 1)).toBe(
        "Minor divergence from baseline patterns.",
      );
    });

    it("returns clean narrative for risk 0", () => {
      expect(getScoreNarrative("risk", 0)).toBe(
        "No meaningful divergence detected.",
      );
    });
  });

  describe("support narratives", () => {
    it("returns high narrative for support >= 4", () => {
      expect(getScoreNarrative("support", 4)).toBe(
        "Author appears to need community help — new user with little engagement.",
      );
    });

    it("returns moderate narrative for support >= 2", () => {
      expect(getScoreNarrative("support", 2)).toBe(
        "Some signs the author could use encouragement or a response.",
      );
    });

    it("returns low narrative for support < 2", () => {
      expect(getScoreNarrative("support", 0)).toBe(
        "Replies are frequent but rarely build on each other.",
      );
    });
  });

  it("returns empty string for unknown categories", () => {
    expect(getScoreNarrative("unknown", 50)).toBe("");
  });
});

describe("getCategoryDisplayName", () => {
  it("returns display names for known categories", () => {
    expect(getCategoryDisplayName("heat")).toBe("Activity Level");
    expect(getCategoryDisplayName("risk")).toBe("Signal Divergence");
    expect(getCategoryDisplayName("support")).toBe("Constructiveness");
  });

  it("returns the raw key for unknown categories", () => {
    expect(getCategoryDisplayName("other")).toBe("other");
  });
});

describe("getWhatsHappening", () => {
  it("returns problem-behavior observation for risk >= 6", () => {
    expect(
      getWhatsHappening(["Risk Score: 7 (freq: 3, promo: 2, engage: 0)"]),
    ).toBe("Patterns match known problem behaviors.");
  });

  it("returns drift observation for risk >= 4", () => {
    expect(
      getWhatsHappening(["Risk Score: 5 (freq: 2, promo: 1, engage: 0)"]),
    ).toBe("Signals suggest the discussion may drift off-topic.");
  });

  it("returns accelerating observation for heat >= 10", () => {
    expect(getWhatsHappening(["Heat Score: 12.00"])).toBe(
      "Replies are arriving faster than typical.",
    );
  });

  it("returns reactive observation for heat >= 5", () => {
    expect(getWhatsHappening(["Heat Score: 7.00"])).toBe(
      "Participants are reacting to each other more than the topic.",
    );
  });

  it("returns waiting observation for support >= 3", () => {
    expect(getWhatsHappening(["Support Score: 4"])).toBe(
      "People are waiting on feedback.",
    );
  });

  it("returns default observation when no signals are elevated", () => {
    expect(
      getWhatsHappening([
        "Heat Score: 2.00",
        "Risk Score: 0",
        "Support Score: 1",
      ]),
    ).toBe("It's pretty quiet—just routine discussion so far.");
  });

  it("returns default observation for undefined explanations", () => {
    expect(getWhatsHappening(undefined)).toBe(
      "It's pretty quiet—just routine discussion so far.",
    );
  });
});

describe("getSignalName", () => {
  it("extracts the signal name before the colon", () => {
    expect(getSignalName("Heat Score: 7.50")).toBe("Heat Score");
    expect(getSignalName("Word Count: 500")).toBe("Word Count");
    expect(getSignalName("Risk Score: 2 (freq: 0)")).toBe("Risk Score");
  });

  it("returns empty string when no colon is present", () => {
    expect(getSignalName("no colon here")).toBe("");
    expect(getSignalName("")).toBe("");
  });
});

describe("formatSignalDisplay", () => {
  it("renames known signal prefixes", () => {
    expect(formatSignalDisplay("Unique Commenters: 18")).toBe(
      "Participants: 18",
    );
    expect(formatSignalDisplay("Effort: 30.01")).toBe("Effort Level: 30");
    expect(formatSignalDisplay("Attention Delta: 23.62")).toBe(
      "Attention Shift: 24",
    );
  });

  it("rounds numeric values to integers", () => {
    expect(formatSignalDisplay("Word Count: 800.5")).toBe("Word Count: 801");
  });

  it("preserves unknown signal names", () => {
    expect(formatSignalDisplay("Word Count: 800")).toBe("Word Count: 800");
  });

  it("returns input unchanged when no colon is present", () => {
    expect(formatSignalDisplay("no colon")).toBe("no colon");
  });

  it("preserves raw value when value is not numeric (NaN branch)", () => {
    expect(formatSignalDisplay("Custom Signal: not_a_number")).toBe(
      "Custom Signal: not_a_number",
    );
  });
});

describe("computeAgeHours", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("computes age in hours from timestamp", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2023-10-27T13:00:00Z").getTime(),
    );
    expect(computeAgeHours("2023-10-27T10:00:00Z")).toBe(3);
  });

  it("returns 0 for very recent timestamps", () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    expect(computeAgeHours(new Date(now - 1000).toISOString())).toBe(0);
  });

  it("rounds to nearest hour", () => {
    vi.spyOn(Date, "now").mockReturnValue(
      new Date("2023-10-27T11:29:00Z").getTime(),
    );
    // 1 hour 29 minutes → rounds to 1
    expect(computeAgeHours("2023-10-27T10:00:00Z")).toBe(1);
  });
});

describe("sortByAttentionPriority", () => {
  const makePost = (
    id: number,
    attention_level: string,
    score: number,
  ): Post => ({
    id,
    title: `Post ${id}`,
    canonical_url: `https://dev.to/test/post-${id}`,
    score,
    attention_level: attention_level as Post["attention_level"],
    explanations: [],
    published_at: "2023-10-27T10:00:00Z",
    author: "user",
    reactions: 0,
    comments: 0,
  });

  it("sorts by attention priority", () => {
    const posts = [
      makePost(1, "NORMAL", 100),
      makePost(2, "NEEDS_RESPONSE", 10),
      makePost(3, "BOOST_VISIBILITY", 30),
      makePost(4, "SIGNAL_AT_RISK", 20),
      makePost(5, "NEEDS_REVIEW", 40),
      makePost(6, "SILENT_SIGNAL", 25),
      makePost(7, "NEEDS_SUPPORT", 5),
    ];
    const sorted = sortByAttentionPriority(posts);
    // Needs Support > Awaiting Collaboration > Anomalous Signal > Trending Signal > Rapid Discussion > Silent Signal > Steady
    expect(sorted.map((p) => p.id)).toEqual([7, 2, 4, 3, 5, 6, 1]);
  });

  it("sorts by score descending within same priority", () => {
    const posts = [
      makePost(1, "NORMAL", 10),
      makePost(2, "NORMAL", 50),
      makePost(3, "NORMAL", 30),
    ];
    const sorted = sortByAttentionPriority(posts);
    expect(sorted.map((p) => p.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate the original array", () => {
    const posts = [
      makePost(1, "NORMAL", 100),
      makePost(2, "NEEDS_RESPONSE", 10),
    ];
    const original = [...posts];
    sortByAttentionPriority(posts);
    expect(posts).toEqual(original);
  });

  it("handles empty array", () => {
    expect(sortByAttentionPriority([])).toEqual([]);
  });

  it("uses default priority (same as NORMAL) for unknown attention levels", () => {
    const posts = [
      makePost(1, "UNKNOWN_LEVEL", 50),
      makePost(2, "NEEDS_RESPONSE", 10),
    ];
    const sorted = sortByAttentionPriority(posts);
    expect(sorted.map((p) => p.id)).toEqual([2, 1]);
  });
});

describe("getSignalSummary", () => {
  it("returns no-data message for unknown method", () => {
    expect(getSignalSummary(0.5, "unknown")).toBe("No interaction data.");
  });

  it("returns substantive summary for signal >= 0.7", () => {
    expect(getSignalSummary(0.8, "llm")).toBe(
      "Discussion substantive and on-topic.",
    );
  });

  it("returns mixed-depth summary for signal 0.4-0.7", () => {
    expect(getSignalSummary(0.5, "heuristic")).toBe(
      "Mixed depth. Focused reply can help.",
    );
  });

  it("returns surface-level summary for signal > 0 and < 0.4", () => {
    expect(getSignalSummary(0.2, "llm")).toBe(
      "Mostly surface-level. Add depth.",
    );
  });

  it("returns early-shaping summary for signal 0", () => {
    expect(getSignalSummary(0, "heuristic")).toBe(
      "No comments. Early shaping opportunity.",
    );
  });

  it("handles boundary at 0.7 exactly", () => {
    expect(getSignalSummary(0.7, "llm")).toBe(
      "Discussion substantive and on-topic.",
    );
  });

  it("handles boundary at 0.4 exactly", () => {
    expect(getSignalSummary(0.4, "llm")).toBe(
      "Mixed depth. Focused reply can help.",
    );
  });
});

describe("constants", () => {
  it("ATTENTION_META has entries for all 7 known levels", () => {
    expect(Object.keys(ATTENTION_META)).toEqual([
      "NEEDS_SUPPORT",
      "NORMAL",
      "BOOST_VISIBILITY",
      "NEEDS_RESPONSE",
      "NEEDS_REVIEW",
      "SIGNAL_AT_RISK",
      "SILENT_SIGNAL",
    ]);
  });

  it("SIGNAL_TOOLTIPS has entries for non-discussion-state signals only", () => {
    expect(Object.keys(SIGNAL_TOOLTIPS)).toContain("Word Count");
    expect(Object.keys(SIGNAL_TOOLTIPS)).toContain("Unique Commenters");
    expect(Object.keys(SIGNAL_TOOLTIPS)).toContain("Effort");
    expect(Object.keys(SIGNAL_TOOLTIPS)).toContain("Attention Delta");
    // Heat/Risk/Support removed — they are shown in Discussion State, not Conversation Signals
    expect(Object.keys(SIGNAL_TOOLTIPS)).not.toContain("Heat Score");
    expect(Object.keys(SIGNAL_TOOLTIPS)).not.toContain("Risk Score");
    expect(Object.keys(SIGNAL_TOOLTIPS)).not.toContain("Support Score");
  });

  it("DISCUSSION_STATE_SIGNALS contains the 3 score types", () => {
    expect(DISCUSSION_STATE_SIGNALS.has("Heat Score")).toBe(true);
    expect(DISCUSSION_STATE_SIGNALS.has("Risk Score")).toBe(true);
    expect(DISCUSSION_STATE_SIGNALS.has("Support Score")).toBe(true);
    expect(DISCUSSION_STATE_SIGNALS.has("Word Count")).toBe(false);
  });

  it("ATTENTION_PRIORITY has ascending values for decreasing urgency", () => {
    expect(ATTENTION_PRIORITY.NEEDS_SUPPORT).toBeLessThan(
      ATTENTION_PRIORITY.NEEDS_RESPONSE,
    );
    expect(ATTENTION_PRIORITY.NEEDS_RESPONSE).toBeLessThan(
      ATTENTION_PRIORITY.SIGNAL_AT_RISK,
    );
    expect(ATTENTION_PRIORITY.SIGNAL_AT_RISK).toBeLessThan(
      ATTENTION_PRIORITY.BOOST_VISIBILITY,
    );
    expect(ATTENTION_PRIORITY.BOOST_VISIBILITY).toBeLessThan(
      ATTENTION_PRIORITY.NEEDS_REVIEW,
    );
    expect(ATTENTION_PRIORITY.NEEDS_REVIEW).toBeLessThan(
      ATTENTION_PRIORITY.SILENT_SIGNAL,
    );
    expect(ATTENTION_PRIORITY.SILENT_SIGNAL).toBeLessThan(
      ATTENTION_PRIORITY.NORMAL,
    );
  });
});
