import type { Post } from "@/types/dashboard";

/** Attention-level metadata: badge variant and human-readable label.
 *  Each category maps to a tone in the dev/signal palette:
 *  neutral = routine, lime = trending, warm = warning/active,
 *  violet = quiet/needs-a-nudge, rose = compassion (support).
 */
export const ATTENTION_META: Record<
  string,
  {
    variant: "neutral" | "lime" | "warm" | "violet" | "rose" | "outline";
    label: string;
  }
> = {
  NEEDS_SUPPORT: { variant: "rose", label: "Needs Support" },
  NORMAL: { variant: "neutral", label: "Steady Signal" },
  BOOST_VISIBILITY: { variant: "lime", label: "Trending Signal" },
  NEEDS_RESPONSE: { variant: "violet", label: "Awaiting Collaboration" },
  NEEDS_REVIEW: { variant: "warm", label: "Rapid Discussion" },
  SIGNAL_AT_RISK: { variant: "warm", label: "Anomalous Signal" },
  SILENT_SIGNAL: { variant: "violet", label: "Silent Signal" },
};

const DEFAULT_ATTENTION = {
  variant: "neutral" as const,
  label: "Steady Signal",
};

export function getAttentionVariant(
  level: string,
): "neutral" | "lime" | "warm" | "violet" | "rose" {
  const v = (ATTENTION_META[level] ?? DEFAULT_ATTENTION).variant;
  // "outline" only applies in the recent-posts context; main badges fall back to neutral
  return v === "outline" ? "neutral" : v;
}

export function getCategoryLabel(level: string): string {
  return (ATTENTION_META[level] ?? DEFAULT_ATTENTION).label;
}

/**
 * Short editorial copy for the signal-classification legend in the intro
 * hero. Each line should fit on one row beside its label and tone dot.
 */
export const SIGNAL_LEGEND_COPY: Record<string, string> = {
  NEEDS_SUPPORT: "distress signals — an empathetic reply matters",
  NEEDS_RESPONSE: "little engagement yet — early replies set the tone",
  SIGNAL_AT_RISK: "diverges from community norms — worth a human look",
  BOOST_VISIBILITY: "substantive but underseen — deserves more eyes",
  NEEDS_REVIEW: "comments arriving fast — debate or noise?",
  SILENT_SIGNAL: "reactions but no conversation — nudge it",
  NORMAL: "typical patterns — no special attention needed",
};

/** Order matching the queue priority in docs/metrics.md. */
export const SIGNAL_LEGEND_ORDER = [
  "NEEDS_SUPPORT",
  "NEEDS_RESPONSE",
  "SIGNAL_AT_RISK",
  "BOOST_VISIBILITY",
  "NEEDS_REVIEW",
  "SILENT_SIGNAL",
  "NORMAL",
] as const;

/**
 * Returns a tooltip string explaining how the given attention category is
 * determined, surfacing the exact signals the pipeline looks for.
 * Returns undefined for categories that don't need additional explanation.
 */
export function getCategoryTooltip(level: string): string | undefined {
  switch (level) {
    case "NEEDS_SUPPORT":
      return "Needs Support: post body contains signals of emotional distress, burnout, or active help-seeking; a thoughtful, empathetic community response may be beneficial.";
    case "NORMAL":
      return "Steady Signal: conversation is following typical community patterns. No special attention needed.";
    case "BOOST_VISIBILITY":
      return "Trending Signal: engagement is climbing faster than usual. The conversation could benefit from broader visibility.";
    case "NEEDS_RESPONSE":
      return "Awaiting Collaboration: post hasn't received meaningful engagement yet. Early replies can set the tone for a productive conversation.";
    case "NEEDS_REVIEW":
      return "Rapid Discussion: comments are arriving quickly and the thread is getting long. Check whether it's productive debate or noise.";
    case "SIGNAL_AT_RISK":
      return "Anomalous Signal: conversation patterns diverge significantly from community norms. Worth a human look to understand why.";
    case "SILENT_SIGNAL":
      return "Silent Signal: post received reactions but little or no conversation. Readers noticed it — a thoughtful comment could get things started.";
    default:
      return undefined;
  }
}

export function getRecentPostBadgeVariant(
  level: string,
): "neutral" | "lime" | "warm" | "violet" | "rose" | "outline" {
  const v = (ATTENTION_META[level] ?? DEFAULT_ATTENTION).variant;
  // neutral (routine) maps to outline for recent-posts context
  return v === "neutral" ? "outline" : v;
}

/** Overall qualitative level for the total score. */
const QUALITATIVE_HIGH = 50;
const QUALITATIVE_MODERATE = 20;

export function getQualitativeLevel(score: number): string {
  if (score >= QUALITATIVE_HIGH) return "Elevated";
  if (score >= QUALITATIVE_MODERATE) return "Notable";
  return "Nominal";
}

/** Score-specific qualitative labels for breakdown bars. */
export function getScoreQualitativeLabel(
  category: string,
  value: number,
): string {
  if (category === "heat") {
    if (value >= 10) return "Elevated";
    if (value >= 5) return "Notable";
    return "Nominal";
  }
  if (category === "risk") {
    if (value >= 4) return "Elevated";
    if (value >= 1) return "Notable";
    return "Nominal";
  }
  if (category === "support") {
    if (value >= 4) return "Elevated";
    if (value >= 2) return "Notable";
    return "Nominal";
  }
  return getQualitativeLevel(value);
}

export function getScoreBarClass(value: number): string {
  if (value > 20) return "bg-state-negative";
  if (value > 10) return "bg-state-warning";
  return "bg-accent-primary";
}

/** Extract word count from explanations array (e.g., "Word Count: 1000") */
export function extractWordCount(explanations?: string[]): number {
  if (!explanations) return 0;
  const wcLine = explanations.find((e) => e.startsWith("Word Count:"));
  if (!wcLine) return 0;
  const match = /\d+/.exec(wcLine);
  return match ? Number(match[0]) : 0;
}

/**
 * Parse the explanations array into a score_breakdown object.
 * The sync pipeline stores scores as strings like "Heat Score: 7.50",
 * "Risk Score: 2 (freq: 0, promo: 1, engage: -2)", "Support Score: 3".
 */
export function parseScoreBreakdown(
  explanations?: string[],
): Record<string, number> {
  if (!explanations) return {};
  const breakdown: Record<string, number> = {};
  for (const exp of explanations) {
    if (exp.startsWith("Heat Score:")) {
      breakdown.heat = Number.parseFloat(exp.split(":")[1]);
    } else if (exp.startsWith("Risk Score:")) {
      // "Risk Score: 2 (freq: ...)" — grab the leading number
      const match = /Risk Score:\s*([\d.]+)/.exec(exp);
      if (match) breakdown.risk = Number.parseFloat(match[1]);
    } else if (exp.startsWith("Support Score:")) {
      breakdown.support = Number.parseFloat(exp.split(":")[1]);
    }
  }
  return breakdown;
}

function getHeatNarrative(value: number): string {
  if (value >= 10)
    return "Reply rate is higher than typical; reactions are mixed.";
  if (value >= 5) return "Replies are arriving faster than usual.";
  return "Normal conversation pace with steady engagement.";
}

function getRiskNarrative(value: number): string {
  if (value >= 6)
    return "Significant divergence from typical community patterns; human review recommended.";
  if (value >= 4)
    return "Noticeable deviation from normal discussion behavior.";
  if (value >= 1) return "Minor divergence from baseline patterns.";
  return "No meaningful divergence detected.";
}

function getSupportNarrative(value: number): string {
  if (value >= 4)
    return "Author appears to need community help — new user with little engagement.";
  if (value >= 2)
    return "Some signs the author could use encouragement or a response.";
  return "Replies are frequent but rarely build on each other.";
}

/** Human-readable display names for score categories. */
const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  heat: "Activity Level",
  risk: "Signal Divergence",
  support: "Constructiveness",
};

/** Return the display name for a score category key. */
export function getCategoryDisplayName(category: string): string {
  return CATEGORY_DISPLAY_NAMES[category] ?? category;
}

/** Plain-English explanation for each score type so moderators understand what they mean. */
export function getScoreNarrative(category: string, value: number): string {
  if (category === "heat") return getHeatNarrative(value);
  if (category === "risk") return getRiskNarrative(value);
  if (category === "support") return getSupportNarrative(value);
  return "";
}

/** Derive a contextual behavior description from explanation signals for list-view badges. */
export function getBehaviorDescription(post: Post): string {
  return getCategoryLabel(post.attention_level);
}

/** Observational summary of what's happening in the conversation. */
export function getWhatsHappening(explanations?: string[]): string {
  const breakdown = parseScoreBreakdown(explanations);
  const heat = breakdown.heat ?? 0;
  const risk = breakdown.risk ?? 0;
  const support = breakdown.support ?? 0;

  if (risk >= 6) return "Patterns match known problem behaviors.";
  if (risk >= 4) return "Signals suggest the discussion may drift off-topic.";
  if (heat >= 10) return "Replies are arriving faster than typical.";
  if (heat >= 5)
    return "Participants are reacting to each other more than the topic.";
  if (support >= 3) return "People are waiting on feedback.";
  return "It's pretty quiet—just routine discussion so far.";
}

/** Hover-text descriptions for each signal in the Conversation Pattern Signals card. */
export const SIGNAL_TOOLTIPS: Record<string, string> = {
  "Word Count":
    "Total words across the conversation; long threads usually mean debate or explanation, not automatically a problem.",
  "Unique Commenters":
    "How many different people joined; higher numbers suggest community interest rather than one person arguing with themselves.",
  Effort:
    "Rough estimate of how much thinking and replying participants put in; long thoughtful replies raise it, short reactions barely move it.",
  "Attention Delta":
    "Measures how quickly people started paying attention compared to normal; spikes mean the topic suddenly caught eyes.",
};

/** Display-name overrides for signal prefixes shown in the Conversation Signals card. */
const SIGNAL_DISPLAY_NAMES: Record<string, string> = {
  "Unique Commenters": "Participants",
  Effort: "Effort Level",
  "Attention Delta": "Attention Shift",
};

/** Extract the signal name (text before the colon) from an explanation string. */
export function getSignalName(explanation: string): string {
  const colonIndex = explanation.indexOf(":");
  if (colonIndex === -1) return "";
  return explanation.slice(0, colonIndex).trim();
}

/**
 * Format a raw explanation string for display.
 * Renames known signal prefixes and rounds numeric values to integers.
 */
export function formatSignalDisplay(explanation: string): string {
  const colonIndex = explanation.indexOf(":");
  if (colonIndex === -1) return explanation;

  const rawName = explanation.slice(0, colonIndex).trim();
  const rawValue = explanation.slice(colonIndex + 1).trim();
  const displayName = SIGNAL_DISPLAY_NAMES[rawName] ?? rawName;

  const parsed = Number.parseFloat(rawValue);
  const displayValue = Number.isNaN(parsed)
    ? rawValue
    : String(Math.round(parsed));

  return `${displayName}: ${displayValue}`;
}

/** Signals already shown in the Discussion State card — filter them from Conversation Signals. */
export const DISCUSSION_STATE_SIGNALS = new Set([
  "Heat Score",
  "Risk Score",
  "Support Score",
]);

/** Compute age in hours from published_at timestamp */
export function computeAgeHours(published_at: string): number {
  const ageMs = Date.now() - new Date(published_at).getTime();
  return Math.round(ageMs / (1000 * 60 * 60));
}

/** Priority order for attention levels in the queue list.
 *  Awaiting Collaboration > Anomalous Signal > Trending Signal > Rapid Discussion > Silent Signal > Steady Signal */
export const ATTENTION_PRIORITY: Record<string, number> = {
  NEEDS_SUPPORT: 0,
  NEEDS_RESPONSE: 1,
  SIGNAL_AT_RISK: 2,
  BOOST_VISIBILITY: 3,
  NEEDS_REVIEW: 4,
  SILENT_SIGNAL: 5,
  NORMAL: 6,
};

/** Threshold-based guidance text for the interaction signal score. */
export function getSignalSummary(
  signal: number,
  method: "llm" | "heuristic" | "unknown",
): string {
  if (method === "unknown") return "No interaction data.";

  if (signal >= 0.7) return "Discussion substantive and on-topic.";
  if (signal >= 0.4) return "Mixed depth. Focused reply can help.";
  if (signal > 0) return "Mostly surface-level. Add depth.";
  return "No comments. Early shaping opportunity.";
}

/** Sort posts by attention level priority, then by score descending within each group */
export function sortByAttentionPriority(posts: Post[]): Post[] {
  return posts.toSorted((a, b) => {
    const priorityDiff =
      (ATTENTION_PRIORITY[a.attention_level] ?? 5) -
      (ATTENTION_PRIORITY[b.attention_level] ?? 5);
    if (priorityDiff !== 0) return priorityDiff;
    return b.score - a.score;
  });
}
