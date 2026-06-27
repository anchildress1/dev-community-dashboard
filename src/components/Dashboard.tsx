"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { SignalItem } from "@/components/ui/SignalItem";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { PostMeta } from "@/components/ui/PostMeta";
import { SectionCard } from "@/components/ui/SectionCard";
import { QueueCard } from "@/components/ui/QueueCard";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  AlertCircle,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  X,
} from "lucide-react";
import { Footer } from "@/components/ui/Footer";
import { cn } from "@/lib/utils";
import {
  getAttentionVariant,
  getCategoryLabel,
  getCategoryTooltip,
  getCategoryDisplayName,
  getRecentPostBadgeVariant,
  getScoreQualitativeLabel,
  getScoreBarClass,
  extractWordCount,
  parseScoreBreakdown,
  getScoreNarrative,
  getWhatsHappening,
  getSignalName,
  formatSignalDisplay,
  computeAgeHours,
  sortByAttentionPriority,
  ATTENTION_META,
  SIGNAL_TOOLTIPS,
  SIGNAL_LEGEND_COPY,
  SIGNAL_LEGEND_ORDER,
  DISCUSSION_STATE_SIGNALS,
} from "@/lib/dashboard-helpers";
import type { Post, PostDetails, RecentPost } from "@/types/dashboard";
import {
  ChartContainer,
  LineChart,
  HorizontalBarChart,
  SignalBar,
  MarkerTimeline,
} from "@/components/ui/charts";
import {
  getVelocityChartData,
  getVelocityBaseline,
  getParticipationData,
  getSignalSpreadData,
  getInteractionSignal,
  getInteractionMethod,
  getInteractionVolatility,
  getTopicTags,
  getConstructivenessData,
  getRiskMarkers,
} from "@/lib/metrics-helpers";

type DetailPanelProps = Readonly<{
  selectedPostId: number | null;
  detailsLoading: boolean;
  postDetails: PostDetails | null;
  onBack: () => void;
  onClose: () => void;
}>;

function DetailPanel({
  selectedPostId,
  detailsLoading,
  postDetails,
  onBack,
  onClose,
}: DetailPanelProps) {
  if (!selectedPostId) {
    return null;
  }

  if (detailsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!postDetails) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="mx-auto max-w-6xl space-y-6 pb-20"
    >
      {/* Mobile back button */}
      <div className="mb-4 md:hidden">
        <button
          onClick={onBack}
          className="text-accent-primary hover:text-accent-hover flex items-center gap-1 text-sm font-medium"
        >
          <ChevronRight className="h-4 w-4 rotate-180" aria-hidden="true" />{" "}
          Back to queue
        </button>
      </div>

      {/* Top bar — close button + signal chip */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          className="text-text-muted hover:text-text-primary hidden rounded-lg p-1.5 transition-colors md:flex"
        >
          <X className="h-5 w-5" />
        </button>
        <Badge
          variant={getAttentionVariant(postDetails.attention_level)}
          withDot
          className="shrink-0 px-3 py-1 text-sm"
          title={getCategoryTooltip(postDetails.attention_level)}
        >
          {getCategoryLabel(postDetails.attention_level)}
        </Badge>
      </div>

      {/* Hero — title, meta, stats */}
      <div className="border-surface-border border-b pb-6">
        <h2 className="font-heading text-text-primary text-3xl leading-[1.15] font-normal tracking-[-0.02em] text-balance md:text-4xl">
          <a
            href={postDetails.dev_url || postDetails.canonical_url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-accent-primary transition-colors hover:underline"
          >
            {postDetails.title}
          </a>
        </h2>
        <PostMeta
          author={postDetails.author}
          date={postDetails.published_at}
          variant="full"
          className="mt-4"
        />

        <div
          className="mt-6 flex flex-wrap gap-x-9 gap-y-4"
          aria-label="Post engagement metrics"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-text-primary font-mono text-2xl font-medium tracking-[-0.01em]">
              {postDetails.reactions}
            </span>
            <span className="text-text-muted text-[11px] tracking-[0.07em] uppercase">
              reactions
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-text-primary font-mono text-2xl font-medium tracking-[-0.01em]">
              {postDetails.comments}
            </span>
            <span className="text-text-muted text-[11px] tracking-[0.07em] uppercase">
              comments
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-text-primary font-mono text-2xl font-medium tracking-[-0.01em]">
              {extractWordCount(postDetails.explanations)}
            </span>
            <span className="text-text-muted text-[11px] tracking-[0.07em] uppercase">
              words
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-text-primary font-mono text-2xl font-medium tracking-[-0.01em]">
              {computeAgeHours(postDetails.published_at)}h
            </span>
            <span className="text-text-muted text-[11px] tracking-[0.07em] uppercase">
              old
            </span>
          </div>
        </div>
      </div>

      {/* Module grid — 3-col continuous layout with col-2/col-3 spans */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {/* Conversation Signals — col-2 */}
        <SectionCard className="md:col-span-2 xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle
              className="font-heading text-text-secondary text-lg"
              title="Observable data points extracted from the conversation thread. Hover over any signal for an explanation."
            >
              Conversation Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {postDetails.explanations && postDetails.explanations.length > 0 ? (
              <ul className="space-y-3">
                {postDetails.explanations
                  .filter(
                    (exp) => !DISCUSSION_STATE_SIGNALS.has(getSignalName(exp)),
                  )
                  .map((exp: string) => (
                    <SignalItem
                      key={exp}
                      tooltip={SIGNAL_TOOLTIPS[getSignalName(exp)]}
                    >
                      {formatSignalDisplay(exp)}
                    </SignalItem>
                  ))}
              </ul>
            ) : (
              <p className="text-text-muted text-sm italic">
                No specific flags raised. Routine interaction patterns detected.
              </p>
            )}
          </CardContent>
        </SectionCard>

        {/* Discussion State — col-1 */}
        <SectionCard variant="muted">
          <CardHeader className="pb-3">
            <CardTitle
              className="font-heading text-text-secondary text-lg"
              title="Composite indicators derived from conversation signals. Each bar shows intensity relative to community baselines."
            >
              Discussion State
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(parseScoreBreakdown(postDetails.explanations)).map(
              ([category, value]) => (
                <div key={category}>
                  <ScoreBar
                    label={getCategoryDisplayName(category)}
                    sublabel={getScoreQualitativeLabel(category, value)}
                    description={getScoreNarrative(category, value)}
                    value={value}
                    max={50}
                    colorClass={getScoreBarClass(value)}
                  />
                </div>
              ),
            )}
          </CardContent>
        </SectionCard>

        {/* Thread Momentum — col-3 */}
        <ChartContainer
          title="Thread Momentum"
          tooltip="A plain-language read of how the conversation is evolving right now."
          className="md:col-span-2 xl:col-span-3"
        >
          <p className="font-heading text-text-primary text-lg leading-relaxed font-normal tracking-[-0.005em] italic">
            {getWhatsHappening(postDetails.explanations)}
          </p>
        </ChartContainer>

        {/* Reply Velocity — col-2 */}
        <ChartContainer
          title="Reply Velocity"
          tooltip="When comments arrived after publication, hour by hour. Spikes may indicate a sudden surge of interest; gaps may mean the conversation stalled."
          className="md:col-span-2 xl:col-span-2"
        >
          <LineChart
            data={getVelocityChartData(postDetails.metrics)}
            baseline={getVelocityBaseline(postDetails.metrics)}
            xLabel="Hours since post"
            yLabel="Comments"
          />
        </ChartContainer>

        {/* Participation Distribution — col-1 */}
        <ChartContainer
          title="Participation Distribution"
          tooltip="Who is talking and how much. Multiple participants suggest broad interest; a single dominant voice may mean the thread needs fresh perspectives."
        >
          <HorizontalBarChart
            data={getParticipationData(postDetails.metrics)}
          />
        </ChartContainer>

        {/* Interaction Signal — col-3 */}
        <ChartContainer
          title="Interaction Signal"
          tooltip="Depth and substance of comments so far. Guides how you can contribute most constructively to the conversation."
          className="md:col-span-2 xl:col-span-3"
        >
          {(() => {
            const spread = getSignalSpreadData(postDetails.metrics);
            const nonZeroTiers = [
              spread.strong,
              spread.moderate,
              spread.faint,
            ].filter((v) => v > 0).length;
            // Need at least 2 non-zero tiers for the bar to be meaningful
            return (
              getInteractionMethod(postDetails.metrics) !== "unknown" &&
              nonZeroTiers >= 2 && <SignalBar {...spread} />
            );
          })()}
          {getInteractionMethod(postDetails.metrics) !== "unknown" && (
            <div className="text-text-muted mt-3 flex flex-wrap items-center gap-4 text-xs">
              <span title="Composite interaction quality score (0–1). Higher means more substantive discussion.">
                Signal:{" "}
                <span className="text-text-secondary font-mono font-medium">
                  {getInteractionSignal(postDetails.metrics).toFixed(2)}
                </span>
              </span>
              <span title="How interaction scores were produced: LLM uses OpenAI structured output; Heuristic uses rule-based keyword scoring.">
                Method:{" "}
                <span className="text-text-secondary font-medium capitalize">
                  {getInteractionMethod(postDetails.metrics)}
                </span>
              </span>
              {getInteractionMethod(postDetails.metrics) === "llm" && (
                <span title="How much scores vary across comments. High volatility means mixed quality; low means consistent depth.">
                  Volatility:{" "}
                  <span className="text-text-secondary font-mono font-medium">
                    {Math.round(
                      getInteractionVolatility(postDetails.metrics) * 100,
                    )}
                    %
                  </span>
                </span>
              )}
            </div>
          )}
          {getTopicTags(postDetails.metrics).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1" aria-label="Topic tags">
              {getTopicTags(postDetails.metrics).map((tag) => (
                <span
                  key={tag}
                  className="bg-surface-raised text-text-secondary rounded px-1.5 py-0.5 font-mono text-xs"
                  title="LLM-extracted topic tag from post content"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </ChartContainer>

        {/* Constructiveness Trend — col-2 */}
        <ChartContainer
          title="Constructiveness Trend"
          tooltip="How reply depth changes over time. Rising depth means people are building on each other's ideas; flat or falling depth may mean the conversation is losing momentum."
          className="md:col-span-2 xl:col-span-2"
        >
          <LineChart
            data={getConstructivenessData(postDetails.metrics)}
            xLabel="Hours since post"
            yLabel="Reply depth"
            seriesColor="tertiary"
          />
        </ChartContainer>

        {/* Contributing Signals — col-1 */}
        <ChartContainer
          title="Contributing Signals"
          tooltip="Specific behavioral signals detected in this conversation. Highlighted markers indicate patterns that diverge from typical community discussion."
        >
          <MarkerTimeline markers={getRiskMarkers(postDetails.metrics)} />
        </ChartContainer>

        {/* Recent Posts by Author — col-3 */}
        {postDetails.recent_posts && postDetails.recent_posts.length > 0 && (
          <ChartContainer
            title={`Recent Posts by @${postDetails.author}`}
            className="md:col-span-2 xl:col-span-3"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {postDetails.recent_posts.map((rp: RecentPost) => (
                <SectionCard
                  key={rp.id}
                  className="hover:border-surface-raised transition-colors"
                >
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-text-secondary line-clamp-2 text-base">
                      <a
                        href={rp.dev_url || rp.canonical_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {rp.title}
                      </a>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-text-muted font-mono text-xs">
                        {new Date(rp.published_at).toLocaleDateString()}
                      </span>
                      <Badge
                        variant={getRecentPostBadgeVariant(rp.attention_level)}
                        withDot
                        className="px-2 py-0 text-[10px]"
                      >
                        {getCategoryLabel(rp.attention_level)}
                      </Badge>
                    </div>
                  </CardContent>
                </SectionCard>
              ))}
            </div>
          </ChartContainer>
        )}
      </div>
    </motion.div>
  );
}

const TONE_DOT_CLASS: Record<string, string> = {
  neutral: "bg-tone-neutral",
  lime: "bg-tone-lime",
  warm: "bg-tone-warm",
  violet: "bg-tone-violet",
  rose: "bg-tone-rose",
  outline: "bg-tone-neutral",
};

function SignalLegend() {
  return (
    <aside className="border-surface-border bg-paper-clue rounded-[10px] border p-5">
      <div className="text-text-muted mb-3 text-[11px] font-medium tracking-[0.08em] uppercase">
        Signal classification
      </div>
      <ul className="space-y-2 text-[13px]">
        {SIGNAL_LEGEND_ORDER.map((key) => {
          const meta = ATTENTION_META[key];
          if (!meta) return null;
          return (
            <li
              key={key}
              className="grid grid-cols-[auto_auto_1fr] items-center gap-2"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                  TONE_DOT_CLASS[meta.variant],
                )}
              />
              <strong className="text-text-primary font-medium whitespace-nowrap">
                {meta.label}
              </strong>
              <span className="text-text-muted text-[12px] leading-snug">
                — {SIGNAL_LEGEND_COPY[key]}
              </span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Intro() {
  return (
    <section className="border-surface-border border-b px-6 py-10">
      <div className="grid gap-10 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div>
          <div className="text-accent-primary mb-3 text-[11px] font-medium tracking-[0.1em] uppercase">
            DEV Community Dashboard · 2026
          </div>
          <h1 className="font-heading text-text-primary text-3xl leading-[1.1] font-normal tracking-[-0.02em] text-balance md:text-4xl">
            Posts ranked by{" "}
            <em className="text-accent-primary">conversation quality</em>, not
            popularity.
          </h1>
          <p className="text-text-secondary mt-4 max-w-[56ch] text-base leading-relaxed">
            Surface meaningful threads on dev.to. Every card is scored from the
            comments inside it — effort, divergence, attention shift,
            constructiveness. Click any post to read the analysis.
          </p>
        </div>
        <SignalLegend />
      </div>
    </section>
  );
}

export function Dashboard() {
  const [posts, setPosts] = React.useState<Post[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedPostId, setSelectedPostId] = React.useState<number | null>(
    null,
  );
  const [postDetails, setPostDetails] = React.useState<PostDetails | null>(
    null,
  );
  const [detailsLoading, setDetailsLoading] = React.useState(false);

  const handleSelectPost = React.useCallback(
    (id: number) => {
      if (id === selectedPostId) return;
      setSelectedPostId(id);
      setDetailsLoading(true);
    },
    [selectedPostId],
  );

  const handleClosePost = React.useCallback(() => {
    setSelectedPostId(null);
    setPostDetails(null);
    setDetailsLoading(false);
  }, []);

  React.useEffect(() => {
    fetch("/api/posts")
      .then((res) => {
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
      })
      .then((data: Post[]) => {
        setPosts(sortByAttentionPriority(data));
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  React.useEffect(() => {
    if (!selectedPostId) return;
    let ignore = false;
    fetch(`/api/posts/${selectedPostId}`)
      .then((res) => res.json())
      .then((data) => {
        if (ignore) return;
        setPostDetails(data);
        setDetailsLoading(false);
      })
      .catch(() => {
        if (!ignore) setDetailsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [selectedPostId]);

  /* Close detail panel on Escape key */
  React.useEffect(() => {
    if (!selectedPostId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClosePost();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedPostId, handleClosePost]);

  if (loading) {
    return (
      <div className="bg-surface-primary flex min-h-screen items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel: Post List */}
      <aside
        aria-label="Post queue"
        className={cn(
          "border-surface-border glass-panel bg-paper-clue flex w-full flex-col border-r transition-[width] duration-300",
          selectedPostId ? "hidden md:flex md:w-1/2 lg:w-4/12" : "w-full",
        )}
      >
        <header className="header-glass border-surface-border flex h-[60px] items-center justify-between border-b px-6">
          <div className="flex items-center gap-2.5">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              aria-hidden="true"
              className="text-accent-primary shrink-0"
            >
              <path
                d="M3 18 L7 14 L10 17 L14 9 L17 13 L21 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex flex-col leading-[1.1]">
              <span className="text-text-primary text-[15px] font-semibold tracking-[-0.01em]">
                dev/signal
              </span>
              <span className="text-text-muted text-[10px] tracking-[0.1em] uppercase">
                conversation analysis
              </span>
            </div>
          </div>
          <nav aria-label="Site actions" className="flex items-center gap-1">
            <ThemeToggle />
            <a
              href="https://github.com/ChecKMarKDevTools/dev-community-dashboard/issues"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Feedback on GitHub"
              className="text-text-muted hover:text-text-primary inline-flex items-center gap-1.5 rounded-lg p-2 text-xs font-medium transition-colors"
            >
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </nav>
        </header>
        <div className="scroll-fade flex-1 overflow-y-auto">
          {!selectedPostId && <Intro />}
          <motion.div
            className="space-y-4 p-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.04 } },
            }}
          >
            {posts.map((post) => (
              <motion.div
                key={post.id}
                variants={{
                  hidden: { opacity: 0, y: 6 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.2 }}
              >
                <QueueCard
                  selected={selectedPostId === post.id}
                  onClick={() => handleSelectPost(post.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-heading text-text-primary truncate text-base font-semibold">
                        {post.title}
                      </h2>
                      <PostMeta
                        author={post.author}
                        date={post.published_at}
                        className="mt-2"
                      />
                    </div>
                    <Badge
                      variant={getAttentionVariant(post.attention_level)}
                      withDot
                      className="shrink-0"
                      title={getCategoryTooltip(post.attention_level)}
                    >
                      {getCategoryLabel(post.attention_level)}
                    </Badge>
                  </div>
                </QueueCard>
              </motion.div>
            ))}
          </motion.div>
          {posts.length === 0 && (
            <div className="p-4">
              <EmptyState
                icon={AlertCircle}
                title="No posts found. Waiting for data sync."
              />
            </div>
          )}
        </div>
        <Footer />
      </aside>

      {/* Right panel: Post Details — only rendered when a post is selected */}
      {selectedPostId !== null && (
        <section
          aria-label="Post details"
          className="bg-surface-primary/50 relative flex-1 overflow-y-auto p-6 md:p-8"
        >
          <DetailPanel
            selectedPostId={selectedPostId}
            detailsLoading={detailsLoading}
            postDetails={postDetails}
            onBack={handleClosePost}
            onClose={handleClosePost}
          />
        </section>
      )}
    </div>
  );
}
