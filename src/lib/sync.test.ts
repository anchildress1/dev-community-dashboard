import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  syncArticles,
  buildVelocityBuckets,
  buildConstructivenessBuckets,
  buildCommenterShares,
  buildSignalSpread,
  computeCommentSignal,
  buildArticleMetrics,
  computeVolatilityFromScores,
} from "./sync";
import { analyzeConversation } from "./openai";
import type { LLMConversationResponse } from "./openai";
import { ForemUser, ForemComment, ForemClient } from "./forem";
import { supabase } from "./supabase";

vi.mock("./openai", () => ({
  analyzeConversation: vi.fn().mockResolvedValue(null),
}));

vi.mock("./forem", () => ({
  ForemClient: {
    getLatestArticles: vi.fn(),
    getArticle: vi.fn(),
    getComments: vi.fn(),
    getUserByUsername: vi.fn(),
  },
}));

vi.mock("./supabase", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

const mockUser: ForemUser = {
  type_of: "user",
  id: 1,
  name: "Test User",
  username: "testuser",
  summary: "",
  twitter_username: null,
  github_username: null,
  website_url: null,
  location: null,
  joined_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  profile_image: "",
};

/** Fresh user (joined < 30 days ago, 1 post in 24h) triggers is_first_post logic. */
const freshUser: ForemUser = {
  type_of: "user",
  id: 2,
  name: "New User",
  username: "newuser",
  summary: "",
  twitter_username: null,
  github_username: null,
  website_url: null,
  location: null,
  joined_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  profile_image: "",
};

const NOW = Date.now();
/** 3 hours ago — safely inside the 2-72h sync window. */
const THREE_HOURS_AGO = new Date(NOW - 3 * 60 * 60 * 1000).toISOString();
/** 34 hours ago — in the sync window and time_since_post > 30 min for NEEDS_RESPONSE. */
const THIRTY_FOUR_HOURS_AGO = new Date(NOW - 34 * 60 * 60 * 1000).toISOString();

function makeArticle(overrides: Record<string, unknown>) {
  return {
    id: 1,
    title: "Test Article",
    description: "desc",
    body_markdown: "word ".repeat(50),
    url: "https://dev.to/test1",
    published_at: THREE_HOURS_AGO,
    public_reactions_count: 10,
    comments_count: 2,
    reading_time_minutes: 2,
    tag_list: ["test"],
    tags: "test",
    canonical_url: "https://dev.to/test1",
    user: { username: "testuser", name: "Test User" },
    ...overrides,
  };
}

function makeComment(overrides: Partial<ForemComment> = {}): ForemComment {
  return {
    type_of: "comment",
    id_code: "c1",
    created_at: new Date().toISOString(),
    body_html: "<p>Nice post</p>",
    user: {
      name: "Commenter",
      username: "commenter1",
      twitter_username: null,
      github_username: null,
      website_url: null,
      profile_image: "",
      profile_image_90: "",
    },
    children: [],
    ...overrides,
  };
}

/** Resets the supabase.from mock to return a fresh upsert/select/delete chain.
 *  - select → eq → gte resolves to empty data (backfill is a no-op)
 *  - select → eq → maybeSingle resolves to null (no cached metrics for incremental scoring)
 *  - delete → lt → select resolves to empty data (purge is a no-op) */
function resetSupabaseMock() {
  const selectChain = {
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockResolvedValue({ data: [], error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
  const deleteChain = {
    lt: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
  };
  vi.mocked(supabase.from).mockReturnValue({
    upsert: vi.fn().mockResolvedValue({ error: null }),
    select: vi.fn().mockReturnValue(selectChain),
    delete: vi.fn().mockReturnValue(deleteChain),
  } as never);
}

function setupBasicMocks(
  articles: Record<string, unknown>[],
  comments: ForemComment[] | ((id: number) => Promise<ForemComment[]>) = [],
  user:
    ForemUser | ((username: string) => Promise<ForemUser | null>) = mockUser,
) {
  vi.mocked(ForemClient.getLatestArticles).mockImplementation(async (page) => {
    if (page === 1) return articles as never;
    return [];
  });
  vi.mocked(ForemClient.getArticle).mockImplementation(
    async (id: number, _?: boolean) => {
      const article = (articles as Record<string, unknown>[]).find(
        (a) => a.id === id,
      );
      return (article || makeArticle({ id })) as never;
    },
  );
  if (typeof user === "function") {
    vi.mocked(ForemClient.getUserByUsername).mockImplementation(user);
  } else {
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(user);
  }
  if (typeof comments === "function") {
    vi.mocked(ForemClient.getComments).mockImplementation(comments);
  } else {
    vi.mocked(ForemClient.getComments).mockResolvedValue(comments);
  }
  resetSupabaseMock();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isPublishedArticle predicate and getAgeHours(null)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips articles with null published_at — they are excluded from validArticles", async () => {
    // An article with published_at: null should be treated as a draft/unlisted
    // and never reach deepScoreAndPersist.
    const published = makeArticle({ id: 100, published_at: THREE_HOURS_AGO });
    const nullPublished = makeArticle({ id: 101, published_at: null });

    setupBasicMocks([published, nullPublished]);

    const result = await syncArticles(10);

    // Only the published article is synced
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("treats null published_at as Infinity age — excluded from window and author-frequency counts", async () => {
    // An article with null published_at has getAgeHours → Infinity, which
    // exceeds SYNC_WINDOW_HOURS and causes it to be filtered out of validArticles.
    // It also does not contribute to the 24h author-frequency map.
    const articles = [
      makeArticle({ id: 200, published_at: THREE_HOURS_AGO }),
      makeArticle({ id: 201, published_at: null }),
    ];

    setupBasicMocks(articles);

    const result = await syncArticles(10);

    // Article 201 is skipped; only 200 is synced
    expect(result.synced).toBe(1);
  });
});

describe("syncArticles scoring pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Category: NEEDS_RESPONSE ───────────────────────────────────────────

  it("classifies NEEDS_RESPONSE when support_score >= 3 and time_since_post >= 30", async () => {
    // time_since_post = 34h*60 = 2040 min, reactions=0, comments=0,
    // fresh user (is_first_post = true → +2), no reactions (+1), no comments (+2) → support = 5
    const article = makeArticle({
      id: 1,
      published_at: THIRTY_FOUR_HOURS_AGO,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 1,
      user: { username: "newuser", name: "New User" },
    });

    setupBasicMocks([article], [], freshUser);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: SIGNAL_AT_RISK ─────────────────────────────────────

  it("classifies SIGNAL_AT_RISK when risk_score >= 4", async () => {
    // freq penalty: 1 post (<=2 threshold) = 0, word_count=100 < 120 (+2),
    // no engagement (+2), author promo keywords "buy"+"subscribe" (+2) → risk = 6 - 0 engage = 6
    const article = makeArticle({
      id: 2,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 0.5,
    });

    // Promo comment from the article AUTHOR — only author promo words count
    const promoComment = makeComment({
      body_html: "<p>buy this product now subscribe</p>",
      user: {
        name: "Test User",
        username: "testuser",
        twitter_username: null,
        github_username: null,
        website_url: null,
        profile_image: "",
        profile_image_90: "",
      },
    });

    setupBasicMocks([article], [promoComment]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: NEEDS_REVIEW ─────────────────────────────────────────────

  it("classifies NEEDS_REVIEW when comment_count >= 6, heat_score >= 5, reaction/comment < 1.2", async () => {
    const article = makeArticle({
      id: 3,
      public_reactions_count: 2,
      comments_count: 20,
      reading_time_minutes: 5,
    });

    // 20 comments with negative sentiment to get high heat_score
    const comments = Array.from({ length: 20 }, (_, i) =>
      makeComment({
        id_code: `c3_${i}`,
        body_html: "<p>terrible bad awful broken issue</p>",
        user: {
          name: `User ${i}`,
          username: `user${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: BOOST_VISIBILITY ─────────────────────────────────────────

  it("classifies BOOST_VISIBILITY when effort is high but exposure is low", async () => {
    // word_count >= 600 (reading_time * 200 = 1000), distinct_commenters >= 2,
    // avg_comment_length >= 18, reaction_count <= 5, attention_delta >= 3
    const article = makeArticle({
      id: 4,
      public_reactions_count: 1,
      comments_count: 2,
      reading_time_minutes: 5,
    });

    const comments = [
      makeComment({
        id_code: "c4_1",
        body_html:
          "<p>" +
          "This is a great detailed insightful comment with many words ".repeat(
            5,
          ) +
          "</p>",
        user: {
          name: "User 1",
          username: "commenter_a",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
      makeComment({
        id_code: "c4_2",
        body_html:
          "<p>" +
          "Another excellent thoughtful response explaining the topic ".repeat(
            5,
          ) +
          "</p>",
        user: {
          name: "User 2",
          username: "commenter_b",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: SILENT_SIGNAL ────────────────────────────────────────────

  it("classifies SILENT_SIGNAL when reaction_count >= 5 and comment_count <= 1", async () => {
    // 10 reactions but 0 comments → noticed but nobody talking.
    // risk_score = 0 (engagement_credit=2 for reactions>=10), support_score = 2 (no comments)
    // < 3 threshold so NEEDS_RESPONSE is not triggered. Not BOOST_VISIBILITY (word_count < 600).
    const article = makeArticle({
      id: 6,
      public_reactions_count: 10,
      comments_count: 0,
      reading_time_minutes: 2,
    });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("does not classify SILENT_SIGNAL when comment_count > 1", async () => {
    // Same reactions but 2 comments → falls through to NORMAL
    const article = makeArticle({
      id: 7,
      public_reactions_count: 10,
      comments_count: 2,
      reading_time_minutes: 2,
    });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("does not classify SILENT_SIGNAL when reaction_count < 5", async () => {
    // 4 reactions and 0 comments → below the noticed threshold, falls to NORMAL
    const article = makeArticle({
      id: 8,
      public_reactions_count: 4,
      comments_count: 0,
      reading_time_minutes: 2,
    });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Category: NORMAL ───────────────────────────────────────────────────

  it("classifies NORMAL when no category thresholds are met", async () => {
    const article = makeArticle({
      id: 5,
      public_reactions_count: 10,
      comments_count: 2,
      reading_time_minutes: 2,
    });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── All 6 categories in a single run ───────────────────────────────────

  it("covers all 6 category branches in a single sync run", async () => {
    const articles = [
      // NEEDS_RESPONSE: old post, fresh user, no engagement
      makeArticle({
        id: 10,
        published_at: THIRTY_FOUR_HOURS_AGO,
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 1,
        user: { username: "newuser", name: "New User" },
      }),
      // SIGNAL_AT_RISK: short, no engagement
      makeArticle({
        id: 20,
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 0.5,
      }),
      // NEEDS_REVIEW: many heated comments
      makeArticle({
        id: 30,
        public_reactions_count: 2,
        comments_count: 20,
        reading_time_minutes: 5,
      }),
      // BOOST_VISIBILITY: quality content, low exposure
      makeArticle({
        id: 40,
        public_reactions_count: 1,
        comments_count: 2,
        reading_time_minutes: 5,
      }),
      // SILENT_SIGNAL: noticed (10 reactions) but nobody talking (0 comments)
      makeArticle({
        id: 45,
        public_reactions_count: 10,
        comments_count: 0,
        reading_time_minutes: 2,
      }),
      // NORMAL: average post
      makeArticle({
        id: 50,
        public_reactions_count: 10,
        comments_count: 2,
        reading_time_minutes: 2,
      }),
    ];

    setupBasicMocks(
      articles,
      async (id: number) => {
        if (id === 30) {
          return Array.from({ length: 20 }, (_, i) =>
            makeComment({
              id_code: `c30_${i}`,
              body_html: "<p>terrible bad awful broken</p>",
              user: {
                name: `User ${i}`,
                username: `user${i}`,
                twitter_username: null,
                github_username: null,
                website_url: null,
                profile_image: "",
                profile_image_90: "",
              },
            }),
          );
        }
        if (id === 40) {
          return [
            makeComment({
              id_code: "c40_1",
              body_html:
                "<p>" +
                "This is a great detailed insightful comment with many words ".repeat(
                  5,
                ) +
                "</p>",
              user: {
                name: "A",
                username: "commenter_a",
                twitter_username: null,
                github_username: null,
                website_url: null,
                profile_image: "",
                profile_image_90: "",
              },
            }),
            makeComment({
              id_code: "c40_2",
              body_html:
                "<p>" +
                "Another excellent thoughtful response explaining the topic ".repeat(
                  5,
                ) +
                "</p>",
              user: {
                name: "B",
                username: "commenter_b",
                twitter_username: null,
                github_username: null,
                website_url: null,
                profile_image: "",
                profile_image_90: "",
              },
            }),
          ];
        }
        return [];
      },
      async (username: string) => {
        if (username === "newuser") return freshUser;
        return mockUser;
      },
    );

    const result = await syncArticles(6);

    expect(result.synced).toBe(6);
    expect(result.failed).toBe(0);
    expect(supabase.from).toHaveBeenCalledWith("articles");
    expect(supabase.from).toHaveBeenCalledWith("users");
  });

  // ── repeated_links metric ──────────────────────────────────────────────

  it("adds repeated_links=2 to risk_score when a domain appears > 2 times", async () => {
    const article = makeArticle({
      id: 60,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 0.5,
    });

    // 3 comments each linking to the same external domain
    const spamComments = Array.from({ length: 3 }, (_, i) =>
      makeComment({
        id_code: `spam_${i}`,
        body_html: `<p>Check this <a href="https://spam.example.com/page${i}">link</a></p>`,
        user: {
          name: `Spammer ${i}`,
          username: `spammer${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], spamComments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("does not add repeated_links when no domain exceeds threshold", async () => {
    const article = makeArticle({
      id: 61,
      public_reactions_count: 10,
      comments_count: 2,
      reading_time_minutes: 2,
    });

    // 2 comments with different domains — neither exceeds 2
    const comments = [
      makeComment({
        id_code: "link1",
        body_html:
          '<p>See <a href="https://a.example.com">A</a> and <a href="https://b.example.com">B</a></p>',
      }),
      makeComment({
        id_code: "link2",
        body_html: '<p>Also <a href="https://c.example.com">C</a></p>',
        user: {
          name: "Other",
          username: "other",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("returns zero synced when article is older than the 120-hour sync window", async () => {
    // 200 hours = > 5 days, outside SYNC_WINDOW_HOURS
    const article = makeArticle({
      id: 70,
      published_at: new Date(NOW - 200 * 60 * 60 * 1000).toISOString(),
    });

    setupBasicMocks([article]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("syncs articles at exactly the 120-hour boundary (inclusive lower edge)", async () => {
    // 119 hours — just inside the window
    const article = makeArticle({
      id: 72,
      published_at: new Date(NOW - 119 * 60 * 60 * 1000).toISOString(),
    });

    setupBasicMocks([article]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("fetches page 2 when page 1 articles are still within the sync window", async () => {
    // Page 1 returns one article within the window
    const page1Article = makeArticle({ id: 300 });
    // Page 2 returns one more article (also within the window); page 3 returns []
    const page2Article = makeArticle({
      id: 301,
      published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
    });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [page1Article] as never;
        if (page === 2) return [page2Article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockImplementation(
      async (id: number) => makeArticle({ id }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles();

    // Both articles from page 1 and page 2 should be synced
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
    expect(ForemClient.getLatestArticles).toHaveBeenCalledWith(1, 100);
    expect(ForemClient.getLatestArticles).toHaveBeenCalledWith(2, 100);
  });

  it("stops fetching pages early when oldest article on the page exceeds SYNC_WINDOW_HOURS", async () => {
    // Page 1: articles within window
    const recentArticle = makeArticle({ id: 310 });
    // Page 2: oldest article is 200h old — triggers early exit, no page 3 request
    const staleArticle = makeArticle({
      id: 311,
      published_at: new Date(NOW - 200 * 60 * 60 * 1000).toISOString(),
    });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [recentArticle] as never;
        if (page === 2) return [staleArticle] as never;
        // page 3+ should never be called
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockImplementation(
      async (id: number) => makeArticle({ id }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles();

    // Only the recent article from page 1 is in the valid window
    expect(result.synced).toBe(1);
    // Page 3 was never requested
    expect(ForemClient.getLatestArticles).not.toHaveBeenCalledWith(3, 100);
  });

  it("processes all valid articles when maxToProcess is undefined (production path)", async () => {
    // 3 articles all within the sync window
    const articles = [
      makeArticle({ id: 320 }),
      makeArticle({
        id: 321,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
      }),
      makeArticle({
        id: 322,
        published_at: new Date(NOW - 6 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    setupBasicMocks(articles);

    // Call with no argument — production behavior, no cap
    const result = await syncArticles();

    expect(result.synced).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("returns zero synced when article is too fresh (< 2h)", async () => {
    const article = makeArticle({
      id: 71,
      published_at: new Date(NOW - 30 * 60 * 1000).toISOString(),
    });

    setupBasicMocks([article]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("returns zero synced when Forem returns empty article list", async () => {
    setupBasicMocks([]);

    const result = await syncArticles(5);

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("handles nested comment children for alternating_pairs detection", async () => {
    const article = makeArticle({
      id: 80,
      public_reactions_count: 2,
      comments_count: 20,
      reading_time_minutes: 5,
    });

    // A→B→A reply chain (alternating pair)
    const nestedComments: ForemComment[] = [
      {
        type_of: "comment",
        id_code: "root",
        created_at: new Date().toISOString(),
        body_html: "<p>terrible broken thing</p>",
        user: {
          name: "Alice",
          username: "alice",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
        children: [
          {
            type_of: "comment",
            id_code: "reply1",
            created_at: new Date().toISOString(),
            body_html: "<p>bad response wrong take</p>",
            user: {
              name: "Bob",
              username: "bob",
              twitter_username: null,
              github_username: null,
              website_url: null,
              profile_image: "",
              profile_image_90: "",
            },
            children: [
              {
                type_of: "comment",
                id_code: "reply2",
                created_at: new Date().toISOString(),
                body_html: "<p>terrible take</p>",
                user: {
                  name: "Alice",
                  username: "alice",
                  twitter_username: null,
                  github_username: null,
                  website_url: null,
                  profile_image: "",
                  profile_image_90: "",
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    setupBasicMocks([article], nestedComments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Fresh counts from individual article fetch ──────────────────────

  it("uses fresh counts from getArticle instead of stale list API counts", async () => {
    // List API returns stale counts (2 reactions, 0 comments)
    const article = makeArticle({
      id: 95,
      public_reactions_count: 2,
      comments_count: 0,
    });

    // Individual article fetch returns updated counts (15 reactions, 5 comments)
    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockResolvedValue(
      makeArticle({
        id: 95,
        public_reactions_count: 15,
        comments_count: 5,
        body_markdown: "word ".repeat(100),
      }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    // Track upserted article data to verify fresh counts are used
    const upsertedArticles: Array<{ reactions: number; comments: number }> = [];
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        if ("reactions" in data) {
          upsertedArticles.push(
            data as { reactions: number; comments: number },
          );
        }
        return { error: null };
      }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    // Verify fresh counts from getArticle were used, not stale list API counts
    expect(upsertedArticles).toHaveLength(1);
    expect(upsertedArticles[0].reactions).toBe(15);
    expect(upsertedArticles[0].comments).toBe(5);
  });

  it("falls back to list API counts when getArticle fails", async () => {
    const article = makeArticle({
      id: 96,
      public_reactions_count: 3,
      comments_count: 1,
    });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockRejectedValue(
      new Error("Article fetch failed"),
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    // Should still succeed using fallback counts from list API
    expect(result.failed).toBe(0);
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it("counts failed articles when user upsert fails", async () => {
    const article = makeArticle({ id: 90 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue({
        error: { message: "User upsert failed" },
      }),
      select: vi.fn().mockReturnThis(),
    } as never);

    const result = await syncArticles(1);

    expect(result.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("User upsert failed");
  });

  it("throws on fatal pipeline error (getLatestArticles fails)", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockRejectedValue(
      new Error("Forem API down"),
    );

    await expect(syncArticles(1)).rejects.toThrow("Forem API down");
  });

  it("throws wrapped error for non-Error fatal failures", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockRejectedValue("string error");

    await expect(syncArticles(1)).rejects.toThrow("Fatal Sync Pipeline Error");
  });

  it("processes comments with no body_html links gracefully", async () => {
    const article = makeArticle({ id: 100 });
    const comment = makeComment({
      body_html: "<p>Just a plain text comment with no links</p>",
    });

    setupBasicMocks([article], [comment]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles null user from resolveUser (user not found)", async () => {
    const article = makeArticle({ id: 110 });
    setupBasicMocks([article], [], null as unknown as ForemUser);

    const result = await syncArticles(1);

    // Should still sync — just skips user upsert
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("uses maxToProcess to limit shortlist size", async () => {
    const articles = Array.from({ length: 10 }, (_, i) =>
      makeArticle({ id: 200 + i }),
    );

    setupBasicMocks(articles);

    const result = await syncArticles(3);

    expect(result.synced).toBe(3);
    expect(result.failed).toBe(0);
  });

  // ── DevTeam org bypass ───────────────────────────────────────────────

  it("forces NORMAL for devteam org posts that would otherwise be NEEDS_REVIEW", async () => {
    const article = makeArticle({
      id: 400,
      public_reactions_count: 2,
      comments_count: 20,
      reading_time_minutes: 5,
      organization: {
        name: "The DEV Team",
        username: "devteam",
        slug: "devteam",
        profile_image: "",
        profile_image_90: "",
      },
    });

    // 20 heated comments — would trigger NEEDS_REVIEW without org bypass
    const comments = Array.from({ length: 20 }, (_, i) =>
      makeComment({
        id_code: `c400_${i}`,
        body_html: "<p>terrible bad awful broken issue</p>",
        user: {
          name: `User ${i}`,
          username: `user${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("does NOT bypass classification for non-devteam orgs", async () => {
    const article = makeArticle({
      id: 401,
      public_reactions_count: 0,
      comments_count: 0,
      reading_time_minutes: 0.5,
      organization: {
        name: "Some Org",
        username: "someorg",
        slug: "someorg",
        profile_image: "",
        profile_image_90: "",
      },
    });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    // Should still classify (not forced NORMAL) — low quality signals present
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Promo keyword scoping ──────────────────────────────────────────

  it("ignores promo keywords from non-author commenters", async () => {
    const article = makeArticle({
      id: 410,
      public_reactions_count: 15,
      comments_count: 2,
      reading_time_minutes: 3,
    });

    // Promo comment from someone OTHER than the article author
    const promoComment = makeComment({
      body_html: "<p>buy this subscribe to my channel follow me</p>",
      user: {
        name: "Random Commenter",
        username: "randomguy",
        twitter_username: null,
        github_username: null,
        website_url: null,
        profile_image: "",
        profile_image_90: "",
      },
    });

    setupBasicMocks([article], [promoComment]);

    const result = await syncArticles(1);

    // Should NOT be SIGNAL_AT_RISK because promo words are from a commenter, not the author
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Frequency penalty threshold ────────────────────────────────────

  it("does not penalize authors with 2 or fewer posts per day", async () => {
    // Two articles by the same author within 24h
    const articles = [
      makeArticle({
        id: 420,
        public_reactions_count: 15,
        comments_count: 3,
        reading_time_minutes: 3,
      }),
      makeArticle({
        id: 421,
        public_reactions_count: 12,
        comments_count: 2,
        reading_time_minutes: 2,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    setupBasicMocks(articles);

    const result = await syncArticles(2);

    // Both should sync as NORMAL — 2 posts/day = 0 frequency penalty
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  // ── Engagement credit ──────────────────────────────────────────────

  it("engagement credit offsets risk for high-traction posts", async () => {
    // Short post (word_count < 120 → +2 risk) but lots of engagement
    const article = makeArticle({
      id: 430,
      public_reactions_count: 50,
      comments_count: 10,
      reading_time_minutes: 0.5,
    });

    // 6 unique commenters to trigger distinct_commenters >= 5 credit
    const comments = Array.from({ length: 6 }, (_, i) =>
      makeComment({
        id_code: `c430_${i}`,
        body_html: "<p>Good stuff</p>",
        user: {
          name: `User ${i}`,
          username: `commenter${i}`,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    );

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    // reactions>=10 → -2, distinct_commenters>=5 → -1, total engage credit = -3
    // risk = 0 + 2 (short) + 0 + 0 + 0 - 3 = max(0, -1) = 0 → NORMAL
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  // ── Existing edge cases continue ───────────────────────────────────

  it("sets is_first_post=false for fresh user with multiple posts in 24h", async () => {
    // Two articles by the same fresh user within 24h → postsByAuthor24h > 1
    // so is_first_post condition (===1) fails even though joined < 30 days ago.
    const articles = [
      makeArticle({
        id: 500,
        published_at: THREE_HOURS_AGO,
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 1,
        user: { username: "newuser", name: "New User" },
      }),
      makeArticle({
        id: 501,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
        public_reactions_count: 0,
        comments_count: 0,
        reading_time_minutes: 1,
        user: { username: "newuser", name: "New User" },
      }),
    ];

    setupBasicMocks(articles, [], freshUser);

    const result = await syncArticles(2);

    // Both sync, but is_first_post is false since author has 2 posts in 24h
    // Support score is lower without the +2 bonus from is_first_post
    expect(result.synced).toBe(2);
    expect(result.failed).toBe(0);
  });

  it("counts failed articles when article upsert fails", async () => {
    const article = makeArticle({ id: 510 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    let callCount = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // User upsert succeeds
        return {
          upsert: vi.fn().mockResolvedValue({ error: null }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: null, error: null }),
              gte: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        } as never;
      }
      if (callCount === 2) {
        // Incremental scoring SELECT for existing article metrics
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi
                .fn()
                .mockResolvedValue({ data: null, error: null }),
            }),
          }),
        } as never;
      }
      // Article upsert fails
      return {
        upsert: vi.fn().mockResolvedValue({
          error: { message: "Article upsert constraint violation" },
        }),
        select: vi.fn().mockReturnThis(),
      } as never;
    });

    const result = await syncArticles(1);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Article upsert constraint violation");
  });

  it("records 'Unknown error' when per-article catch receives a non-Error value", async () => {
    const article = makeArticle({ id: 520 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    // Throw a non-Error value from getUserByUsername to trigger the non-Error branch
    vi.mocked(ForemClient.getUserByUsername).mockRejectedValue(
      "string rejection",
    );
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);
    resetSupabaseMock();

    const result = await syncArticles(1);

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("Unknown error");
  });

  it("caches resolved users to avoid duplicate upserts", async () => {
    // Two articles by the same author
    const articles = [
      makeArticle({ id: 300 }),
      makeArticle({
        id: 301,
        published_at: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    setupBasicMocks(articles);

    await syncArticles(2);

    // getUserByUsername should only be called once for the same author
    expect(ForemClient.getUserByUsername).toHaveBeenCalledTimes(1);
  });

  // ── Null username handling (deleted Forem accounts) ──────────────────

  it("skips commenter tracking for comments with null usernames", async () => {
    const article = makeArticle({
      id: 700,
      public_reactions_count: 5,
      comments_count: 2,
      reading_time_minutes: 3,
    });

    const comments: ForemComment[] = [
      // Normal commenter
      makeComment({
        id_code: "c700_1",
        body_html: "<p>great post</p>",
        user: {
          name: "Normal User",
          username: "normaluser",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
      // Deleted account with null username
      makeComment({
        id_code: "c700_2",
        body_html: "<p>deleted user comment</p>",
        user: {
          name: null,
          username: null,
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("handles nested replies from deleted accounts without crashing", async () => {
    const article = makeArticle({
      id: 710,
      public_reactions_count: 2,
      comments_count: 3,
      reading_time_minutes: 3,
    });

    const comments: ForemComment[] = [
      {
        type_of: "comment",
        id_code: "c710_root",
        created_at: new Date().toISOString(),
        body_html: "<p>root comment</p>",
        user: {
          name: "Alice",
          username: "alice",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
        children: [
          {
            type_of: "comment",
            id_code: "c710_deleted_reply",
            created_at: new Date().toISOString(),
            body_html: "<p>reply from deleted account</p>",
            user: {
              name: null,
              username: null,
              twitter_username: null,
              github_username: null,
              website_url: null,
              profile_image: "",
              profile_image_90: "",
            },
            children: [
              {
                type_of: "comment",
                id_code: "c710_grandchild",
                created_at: new Date().toISOString(),
                body_html: "<p>reply to deleted user</p>",
                user: {
                  name: "Bob",
                  username: "bob",
                  twitter_username: null,
                  github_username: null,
                  website_url: null,
                  profile_image: "",
                  profile_image_90: "",
                },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("includes metrics JSONB in the article upsert payload", async () => {
    const article = makeArticle({
      id: 600,
      public_reactions_count: 5,
      comments_count: 2,
      reading_time_minutes: 3,
    });

    const comments = [
      makeComment({
        id_code: "c600_1",
        body_html: "<p>awesome helpful post</p>",
        created_at: new Date(NOW - 2 * 60 * 60 * 1000).toISOString(),
        user: {
          name: "User A",
          username: "usera",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
      makeComment({
        id_code: "c600_2",
        body_html: "<p>terrible broken thing</p>",
        created_at: new Date(NOW - 1 * 60 * 60 * 1000).toISOString(),
        user: {
          name: "User B",
          username: "userb",
          twitter_username: null,
          github_username: null,
          website_url: null,
          profile_image: "",
          profile_image_90: "",
        },
      }),
    ];

    setupBasicMocks([article], comments);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);

    // Verify that the upsert was called with a metrics field
    const upsertMock = vi.mocked(supabase.from).mock.results;
    const articleUpsertCall = upsertMock.find(
      (r) =>
        r.type === "return" &&
        (r.value as { upsert: ReturnType<typeof vi.fn> }).upsert,
    );
    expect(articleUpsertCall).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Purge stale articles
// ---------------------------------------------------------------------------

describe("syncArticles — purge step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("purges stale articles as the FIRST step and reports count in errors (production path)", async () => {
    const article = makeArticle({ id: 900 });

    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockImplementation(
      async (id: number) => makeArticle({ id }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    // Mock select chain (backfill returns empty) and delete chain (purge returns 2 rows).
    // Purge now runs FIRST (before fetchAndFilterArticles), but mockReturnValue applies
    // to all supabase.from calls so the order does not affect the mock setup.
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 101 }, { id: 102 }],
          error: null,
        }),
      }),
    };
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    // No maxToProcess → production path (purge runs first, then sync, then backfill)
    const result = await syncArticles();

    expect(result.synced).toBe(1);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Purged 2 stale articles"),
    );
  });

  it("skips purge when maxToProcess is set (test path)", async () => {
    const article = makeArticle({ id: 910 });

    setupBasicMocks([article]);

    const result = await syncArticles(1);

    // With maxToProcess set, purge is skipped — no purge message in errors
    expect(result.errors).not.toContainEqual(expect.stringContaining("Purged"));
  });

  it("logs purge error and returns 0 purged when Supabase delete fails", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockResolvedValue([]);
    vi.mocked(ForemClient.getArticle).mockResolvedValue(
      makeArticle({ id: 920 }) as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    // Purge returns an error — covers the error branch in purgeStaleArticles
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi
          .fn()
          .mockResolvedValue({ data: null, error: { message: "DB timeout" } }),
      }),
    };
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    const result = await syncArticles();

    // Purge failed silently (returns 0), so no "Purged N" message in errors
    expect(result.errors).not.toContainEqual(expect.stringContaining("Purged"));
  });
});

// ---------------------------------------------------------------------------
// backfillEmptyMetrics tests
// ---------------------------------------------------------------------------

describe("syncArticles — backfill step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backfills articles with empty metrics from Supabase (production path)", async () => {
    const backfillArticle = makeArticle({ id: 950 });

    // No articles from the paginated API → main sync loop processes 0
    vi.mocked(ForemClient.getLatestArticles).mockResolvedValue([]);
    // getArticle is called during backfill with the row id
    vi.mocked(ForemClient.getArticle).mockResolvedValue(
      backfillArticle as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    // Sequence of supabase.from calls in the production path:
    //   1) purge:           delete → lt → select → {data:[], error:null}
    //   2) backfill query:  select → eq → gte → {data:[{id:950}], error:null}
    //   3+) deepScoreAndPersist upserts (commenters + articles)
    const purgeChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const backfillQueryChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [{ id: 950 }], error: null }),
    };
    const upsertOnlyMock = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
      delete: vi.fn().mockReturnValue(purgeChain),
    };

    let callCount = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: purge
        return { delete: vi.fn().mockReturnValue(purgeChain) } as never;
      }
      if (callCount === 2) {
        // Second call: backfill query
        return { select: vi.fn().mockReturnValue(backfillQueryChain) } as never;
      }
      // Remaining calls: upserts from deepScoreAndPersist
      return upsertOnlyMock as never;
    });

    const result = await syncArticles();

    // Backfill processed 1 article
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("records failure when backfill article has null published_at", async () => {
    const nullPublishedArticle = makeArticle({ id: 951, published_at: null });

    vi.mocked(ForemClient.getLatestArticles).mockResolvedValue([]);
    vi.mocked(ForemClient.getArticle).mockResolvedValue(
      nullPublishedArticle as never,
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    const purgeChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const backfillQueryChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [{ id: 951 }], error: null }),
    };

    let callCount = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { delete: vi.fn().mockReturnValue(purgeChain) } as never;
      }
      if (callCount === 2) {
        return { select: vi.fn().mockReturnValue(backfillQueryChain) } as never;
      }
      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      } as never;
    });

    const result = await syncArticles();

    expect(result.failed).toBe(1);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Backfill article 951: published_at is null"),
    );
  });

  it("records failure when backfill getArticle throws", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockResolvedValue([]);
    vi.mocked(ForemClient.getArticle).mockRejectedValue(
      new Error("API timeout"),
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    const purgeChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const backfillQueryChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [{ id: 952 }], error: null }),
    };

    let callCount = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { delete: vi.fn().mockReturnValue(purgeChain) } as never;
      }
      if (callCount === 2) {
        return { select: vi.fn().mockReturnValue(backfillQueryChain) } as never;
      }
      return {
        upsert: vi.fn().mockResolvedValue({ error: null }),
      } as never;
    });

    const result = await syncArticles();

    expect(result.failed).toBe(1);
    expect(result.errors).toContainEqual(
      expect.stringContaining("Backfill article 952: API timeout"),
    );
  });

  it("returns empty result when backfill query returns no rows", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockResolvedValue([]);
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    const purgeChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const backfillQueryChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
    };

    let callCount = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { delete: vi.fn().mockReturnValue(purgeChain) } as never;
      }
      return { select: vi.fn().mockReturnValue(backfillQueryChain) } as never;
    });

    const result = await syncArticles();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("returns empty result when backfill query errors", async () => {
    vi.mocked(ForemClient.getLatestArticles).mockResolvedValue([]);
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([]);

    const purgeChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    const backfillQueryChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "query failed" } }),
    };

    let callCount = 0;
    vi.mocked(supabase.from).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return { delete: vi.fn().mockReturnValue(purgeChain) } as never;
      }
      return { select: vi.fn().mockReturnValue(backfillQueryChain) } as never;
    });

    const result = await syncArticles();

    expect(result.synced).toBe(0);
    expect(result.failed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Metric builder function tests
// ---------------------------------------------------------------------------

describe("buildVelocityBuckets", () => {
  const publishedAt = "2024-01-01T10:00:00Z";

  it("buckets comments into hourly bins relative to publication", () => {
    const pubTime = new Date(publishedAt).getTime();
    const timestamps = [
      new Date(pubTime + 30 * 60 * 1000), // 0.5h → bucket 0
      new Date(pubTime + 90 * 60 * 1000), // 1.5h → bucket 1
      new Date(pubTime + 100 * 60 * 1000), // ~1.67h → bucket 1
    ];

    const result = buildVelocityBuckets(timestamps, publishedAt);

    expect(result).toEqual([
      { hour: 0, count: 1 },
      { hour: 1, count: 2 },
    ]);
  });

  it("returns empty array for no timestamps", () => {
    expect(buildVelocityBuckets([], publishedAt)).toEqual([]);
  });

  it("caps at 48 buckets", () => {
    const pubTime = new Date(publishedAt).getTime();
    const timestamps = Array.from(
      { length: 60 },
      (_, i) => new Date(pubTime + i * 60 * 60 * 1000),
    );

    const result = buildVelocityBuckets(timestamps, publishedAt);

    expect(result.length).toBeLessThanOrEqual(48);
  });

  it("handles comments before publication (negative offset clamped to 0)", () => {
    const pubTime = new Date(publishedAt).getTime();
    const timestamps = [new Date(pubTime - 60 * 60 * 1000)];

    const result = buildVelocityBuckets(timestamps, publishedAt);

    expect(result).toEqual([{ hour: 0, count: 1 }]);
  });
});

describe("buildConstructivenessBuckets", () => {
  const publishedAt = "2024-01-01T10:00:00Z";

  it("averages depth per hourly bucket", () => {
    const pubTime = new Date(publishedAt).getTime();
    const commentDepths = [
      { timestamp: new Date(pubTime + 30 * 60 * 1000), depth: 0 },
      { timestamp: new Date(pubTime + 40 * 60 * 1000), depth: 2 },
      { timestamp: new Date(pubTime + 90 * 60 * 1000), depth: 3 },
    ];

    const result = buildConstructivenessBuckets(commentDepths, publishedAt);

    expect(result).toEqual([
      { hour: 0, depth_index: 1 }, // avg(0, 2) = 1
      { hour: 1, depth_index: 3 }, // avg(3) = 3
    ]);
  });

  it("returns empty array for no data", () => {
    expect(buildConstructivenessBuckets([], publishedAt)).toEqual([]);
  });
});

describe("buildCommenterShares", () => {
  it("returns top-5 commenters sorted by share descending", () => {
    const counts = new Map([
      ["alice", 5],
      ["bob", 3],
      ["carol", 2],
      ["dave", 1],
      ["eve", 4],
      ["frank", 1],
    ]);

    const result = buildCommenterShares(counts, 16);

    expect(result).toHaveLength(5);
    expect(result[0].username).toBe("alice");
    expect(result[0].share).toBeCloseTo(5 / 16);
    expect(result[1].username).toBe("eve");
  });

  it("returns empty array when totalComments is 0", () => {
    const counts = new Map([["alice", 1]]);
    expect(buildCommenterShares(counts, 0)).toEqual([]);
  });

  it("returns all commenters when fewer than 5", () => {
    const counts = new Map([
      ["alice", 3],
      ["bob", 2],
    ]);
    const result = buildCommenterShares(counts, 5);
    expect(result).toHaveLength(2);
  });
});

describe("buildSignalSpread", () => {
  it("computes correct high/mid/low percentages from enriched scores", () => {
    // Quality composite = relevance*0.3 + depth*0.3 + constructiveness*0.3 + normalizedTone*0.1
    // High quality: all max → 0.3+0.3+0.3+0.1 = 1.0 (> 0.6)
    // Low quality: all zero, tone = -1 → 0+0+0+0 = 0.0 (< 0.3)
    // Mid quality: moderate scores
    const scores = [
      {
        index: 0,
        tone: 1,
        relevance: 1,
        depth: 1,
        constructiveness: 1,
        id_code: "a",
        body_hash: "h1",
      }, // quality=1.0 → high
      {
        index: 1,
        tone: 0,
        relevance: 0.5,
        depth: 0.5,
        constructiveness: 0.5,
        id_code: "b",
        body_hash: "h2",
      }, // quality=0.5*0.3*3 + 0.5*0.1 = 0.5 → mid
      {
        index: 2,
        tone: -1,
        relevance: 0,
        depth: 0,
        constructiveness: 0,
        id_code: "c",
        body_hash: "h3",
      }, // quality=0.0 → low
    ];
    const result = buildSignalSpread(scores);
    expect(result.signal_strong_pct).toBeCloseTo(100 / 3);
    expect(result.signal_moderate_pct).toBeCloseTo(100 / 3);
    expect(result.signal_faint_pct).toBeCloseTo(100 / 3);
  });

  it("returns all zeros for empty scores (empty state)", () => {
    const result = buildSignalSpread([]);
    expect(result).toEqual({
      signal_strong_pct: 0,
      signal_moderate_pct: 0,
      signal_faint_pct: 0,
    });
  });

  it("handles all strong-signal scores", () => {
    const scores = [
      {
        index: 0,
        tone: 0.8,
        relevance: 0.9,
        depth: 0.9,
        constructiveness: 0.9,
        id_code: "a",
        body_hash: "h1",
      },
      {
        index: 1,
        tone: 0.5,
        relevance: 0.8,
        depth: 0.8,
        constructiveness: 0.8,
        id_code: "b",
        body_hash: "h2",
      },
    ];
    const result = buildSignalSpread(scores);
    expect(result.signal_strong_pct).toBe(100);
    expect(result.signal_faint_pct).toBe(0);
  });

  it("handles all faint-signal scores", () => {
    const scores = [
      {
        index: 0,
        tone: -1,
        relevance: 0,
        depth: 0,
        constructiveness: 0,
        id_code: "a",
        body_hash: "h1",
      },
      {
        index: 1,
        tone: -0.5,
        relevance: 0.1,
        depth: 0.05,
        constructiveness: 0.05,
        id_code: "b",
        body_hash: "h2",
      },
    ];
    const result = buildSignalSpread(scores);
    expect(result.signal_faint_pct).toBe(100);
    expect(result.signal_strong_pct).toBe(0);
  });
});

describe("buildArticleMetrics", () => {
  it("assembles a complete ArticleMetrics object", () => {
    const pubAt = "2024-01-01T10:00:00Z";
    const pubTime = new Date(pubAt).getTime();

    const metrics = {
      uniqueCommenters: new Set(["alice", "bob"]),
      totalCommentWords: 50,
      pos_comments: 2,
      neg_comments: 1,
      alternating_pairs: 1,
      replies_with_parent: 3,
      promo_keywords: 0,
      help_keywords: 1,
      externalDomainCounts: new Map<string, number>(),
      comment_timestamps: [
        new Date(pubTime + 60 * 60 * 1000),
        new Date(pubTime + 2 * 60 * 60 * 1000),
        new Date(pubTime + 2 * 60 * 60 * 1000),
      ],
      commenter_comment_counts: new Map([
        ["alice", 2],
        ["bob", 1],
      ]),
      comment_depths: [
        { timestamp: new Date(pubTime + 60 * 60 * 1000), depth: 0 },
        { timestamp: new Date(pubTime + 2 * 60 * 60 * 1000), depth: 1 },
        { timestamp: new Date(pubTime + 2 * 60 * 60 * 1000), depth: 2 },
      ],
    };

    const result = buildArticleMetrics({
      metrics,
      publishedAt: pubAt,
      commentCount: 3,
      ageHours: 5,
      riskScore: 2,
      frequencyPenalty: 0,
      engagementCredit: 1,
      wordCount: 500,
      reactionCount: 10,
      repeatedLinks: 0,
      isFirstPost: false,
      llmResult: null,
      needsSupport: false,
    });

    expect(result.velocity_buckets).toHaveLength(2);
    expect(result.comments_per_hour).toBeCloseTo(3 / 5);
    expect(result.commenter_shares).toHaveLength(2);
    expect(result.commenter_shares[0].username).toBe("alice");
    expect(result.constructiveness_buckets).toHaveLength(2);
    expect(result.avg_comment_length).toBeCloseTo(50 / 3);
    expect(result.reply_ratio).toBeCloseTo(3 / 3);
    expect(result.alternating_pairs).toBe(1);
    expect(result.risk_score).toBe(2);
    expect(result.risk_components.frequency_penalty).toBe(0);
    expect(result.risk_components.short_content).toBe(false);
    expect(result.risk_components.no_engagement).toBe(false);
    expect(result.risk_components.engagement_credit).toBe(1);
    expect(result.interaction_method).toBe("heuristic");
    expect(result.interaction_signal).toBeGreaterThanOrEqual(0);
    expect(result.signal_strong_pct).toBeDefined();
    expect(result.signal_moderate_pct).toBeDefined();
    expect(result.signal_faint_pct).toBeDefined();
    expect(result.is_first_post).toBe(false);
    expect(result.help_keywords).toBe(1);
    expect(result.needs_support).toBe(false);
  });

  it("handles zero comments gracefully", () => {
    const metrics = {
      uniqueCommenters: new Set<string>(),
      totalCommentWords: 0,
      pos_comments: 0,
      neg_comments: 0,
      alternating_pairs: 0,
      replies_with_parent: 0,
      promo_keywords: 0,
      help_keywords: 0,
      externalDomainCounts: new Map<string, number>(),
      comment_timestamps: [],
      commenter_comment_counts: new Map<string, number>(),
      comment_depths: [],
    };

    const result = buildArticleMetrics({
      metrics,
      publishedAt: "2024-01-01T10:00:00Z",
      commentCount: 0,
      ageHours: 3,
      riskScore: 4,
      frequencyPenalty: 2,
      engagementCredit: 0,
      wordCount: 50,
      reactionCount: 0,
      repeatedLinks: 0,
      isFirstPost: true,
      llmResult: null,
      needsSupport: false,
    });

    expect(result.velocity_buckets).toEqual([]);
    expect(result.comments_per_hour).toBe(0);
    expect(result.commenter_shares).toEqual([]);
    expect(result.signal_moderate_pct).toBe(0);
    expect(result.avg_comment_length).toBe(0);
    expect(result.reply_ratio).toBe(0);
    expect(result.risk_components.short_content).toBe(true);
    expect(result.risk_components.no_engagement).toBe(true);
    expect(result.is_first_post).toBe(true);
    expect(result.interaction_method).toBe("heuristic");
  });

  it("uses LLM interaction data when llmResult is present", () => {
    const metrics = {
      uniqueCommenters: new Set(["a"]),
      totalCommentWords: 10,
      pos_comments: 1,
      neg_comments: 0,
      alternating_pairs: 0,
      replies_with_parent: 0,
      promo_keywords: 0,
      help_keywords: 0,
      externalDomainCounts: new Map<string, number>(),
      comment_timestamps: [new Date()],
      commenter_comment_counts: new Map([["a", 2]]),
      comment_depths: [],
    };

    const llmResult: LLMConversationResponse = {
      comments: [
        {
          index: 0,
          tone: 0.8,
          relevance: 0.9,
          depth: 0.7,
          constructiveness: 0.8,
        },
        {
          index: 1,
          tone: -0.5,
          relevance: 0.4,
          depth: 0.3,
          constructiveness: 0.2,
        },
      ],
      volatility: 0.7,
      topic_tags: ["javascript", "testing"],
      needs_support: false,
    };

    const enrichedScores = [
      {
        index: 0,
        tone: 0.8,
        relevance: 0.9,
        depth: 0.7,
        constructiveness: 0.8,
        id_code: "c1",
        body_hash: "h1",
      },
      {
        index: 1,
        tone: -0.5,
        relevance: 0.4,
        depth: 0.3,
        constructiveness: 0.2,
        id_code: "c2",
        body_hash: "h2",
      },
    ];

    const result = buildArticleMetrics({
      metrics,
      publishedAt: "2024-01-01T10:00:00Z",
      commentCount: 2,
      ageHours: 3,
      riskScore: 0,
      frequencyPenalty: 0,
      engagementCredit: 0,
      wordCount: 500,
      reactionCount: 5,
      repeatedLinks: 0,
      isFirstPost: false,
      llmResult,
      enrichedScores,
      needsSupport: false,
    });

    expect(result.interaction_method).toBe("llm");
    expect(result.interaction_scores).toEqual(enrichedScores);
    expect(result.interaction_volatility).toBe(0.7);
    expect(result.topic_tags).toEqual(["javascript", "testing"]);
    // interaction_signal is mean of per-comment composite signal strengths
    expect(result.interaction_signal).toBeGreaterThan(0);
    expect(result.interaction_signal).toBeLessThanOrEqual(1);
    // Signal spread should have values
    expect(result.signal_strong_pct).toBeDefined();
    expect(result.signal_moderate_pct).toBeDefined();
    expect(result.signal_faint_pct).toBeDefined();
    const sumPct =
      (result.signal_strong_pct ?? 0) +
      (result.signal_moderate_pct ?? 0) +
      (result.signal_faint_pct ?? 0);
    expect(sumPct).toBeCloseTo(100);
  });
});

// ---------------------------------------------------------------------------
// computeCommentSignal
// ---------------------------------------------------------------------------

describe("computeCommentSignal", () => {
  it("returns max signal for perfect scores", () => {
    const result = computeCommentSignal({
      tone: 1.0,
      relevance: 1.0,
      depth: 1.0,
      constructiveness: 1.0,
    });
    // (1.0*0.3 + 1.0*0.3 + 1.0*0.3) + ((1+1)/2)*0.1 = 0.9 + 0.1 = 1.0
    expect(result).toBeCloseTo(1.0);
  });

  it("returns minimum signal for worst scores", () => {
    const result = computeCommentSignal({
      tone: -1.0,
      relevance: 0,
      depth: 0,
      constructiveness: 0,
    });
    // 0 + 0 + 0 + ((-1+1)/2)*0.1 = 0.0
    expect(result).toBeCloseTo(0.0);
  });

  it("computes weighted composite for mixed scores", () => {
    const result = computeCommentSignal({
      tone: 0.0,
      relevance: 0.5,
      depth: 0.5,
      constructiveness: 0.5,
    });
    // (0.5*0.3 + 0.5*0.3 + 0.5*0.3) + ((0+1)/2)*0.1 = 0.45 + 0.05 = 0.50
    expect(result).toBeCloseTo(0.5);
  });

  it("weights tone at 10% and substance signals at 90%", () => {
    // High substance, negative tone
    const highSubstance = computeCommentSignal({
      tone: -1.0,
      relevance: 1.0,
      depth: 1.0,
      constructiveness: 1.0,
    });
    // (1*0.3 + 1*0.3 + 1*0.3) + ((−1+1)/2)*0.1 = 0.9 + 0.0 = 0.9
    expect(highSubstance).toBeCloseTo(0.9);

    // Low substance, positive tone
    const lowSubstance = computeCommentSignal({
      tone: 1.0,
      relevance: 0,
      depth: 0,
      constructiveness: 0,
    });
    // 0 + 0 + 0 + ((1+1)/2)*0.1 = 0.1
    expect(lowSubstance).toBeCloseTo(0.1);
  });
});

// ---------------------------------------------------------------------------
// LLM interaction signal integration in syncArticles
// ---------------------------------------------------------------------------

describe("LLM interaction signal integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls analyzeConversation during sync and falls back to heuristic on null", async () => {
    const article = makeArticle({ id: 900 });
    // Provide a comment so there is at least one new/uncached text to score.
    const comment = makeComment({ body_html: "<p>interesting point</p>" });
    setupBasicMocks([article], [comment]);

    // Default mock returns null → heuristic fallback
    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(analyzeConversation).toHaveBeenCalled();
  });

  it("passes LLM result through when analyzeConversation succeeds", async () => {
    const article = makeArticle({ id: 901 });
    const comment = makeComment({
      body_html: "<p>great post</p>",
    });

    vi.mocked(analyzeConversation).mockResolvedValueOnce({
      comments: [
        {
          index: 0,
          tone: 0.8,
          relevance: 0.9,
          depth: 0.7,
          constructiveness: 0.8,
        },
      ],
      volatility: 0.1,
      topic_tags: ["testing"],
    });

    setupBasicMocks([article], [comment]);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(analyzeConversation).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.any(String)]),
    );
  });
});

// ---------------------------------------------------------------------------
// computeVolatilityFromScores
// ---------------------------------------------------------------------------

describe("computeVolatilityFromScores", () => {
  it("returns 0 for empty input", () => {
    expect(computeVolatilityFromScores([])).toBe(0);
  });

  it("returns 0 for a single score", () => {
    expect(computeVolatilityFromScores([0.5])).toBe(0);
  });

  it("returns 0 when all scores are identical", () => {
    expect(computeVolatilityFromScores([0.3, 0.3, 0.3])).toBe(0);
  });

  it("clamps to 1 for extreme opposite scores", () => {
    // std dev of [-1, 1] = 1.0
    const result = computeVolatilityFromScores([-1, 1]);
    expect(result).toBe(1);
  });

  it("returns std dev clamped to [0, 1] for mixed scores", () => {
    // scores: [0, 0.5, 1] — mean = 0.5, variance = (0.25+0+0.25)/3 ≈ 0.1667, std ≈ 0.408
    const result = computeVolatilityFromScores([0, 0.5, 1]);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(1);
    expect(result).toBeCloseTo(Math.sqrt((0.25 + 0 + 0.25) / 3), 5);
  });
});

// ---------------------------------------------------------------------------
// Incremental LLM scoring
// ---------------------------------------------------------------------------

describe("incremental LLM scoring", () => {
  // Mirrors hashText() in sync.ts — iterates Unicode code points (for...of)
  // so surrogate pairs (emoji, non-BMP CJK) are counted exactly once, matching
  // the production implementation that was fixed in a prior commit.
  function djb2Hash(text: string): string {
    let hash = 0;
    for (const char of text) {
      hash = ((hash << 5) - hash + (char.codePointAt(0) ?? 0)) >>> 0;
    }
    return hash.toString(16);
  }

  function stripHtml(html: string): string {
    let out = "";
    let inTag = false;
    for (const ch of html) {
      if (ch === "<") {
        inTag = true;
      } else if (ch === ">") {
        inTag = false;
      } else if (!inTag) {
        out += ch;
      }
    }
    return out;
  }

  /** Compute the expected body_hash for a given raw body_html (mirrors sync.ts). */
  function bodyHash(bodyHtml: string): string {
    return djb2Hash(stripHtml(bodyHtml));
  }

  /** Set up mocks so the articles SELECT for existing metrics returns specific data. */
  function setupMockWithCachedMetrics(
    articles: Record<string, unknown>[],
    comments: ForemComment[],
    cachedInteractionScores: Array<{
      tone: number;
      relevance: number;
      depth: number;
      constructiveness: number;
      id_code: string;
      body_hash: string;
    }> | null,
  ) {
    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return articles as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockImplementation(
      async (id: number, _?: boolean) => {
        const article = articles.find((a) => a.id === id);
        return (article || makeArticle({ id })) as never;
      },
    );
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue(comments);

    const existingMetrics =
      cachedInteractionScores !== null
        ? { interaction_scores: cachedInteractionScores }
        : null;

    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: existingMetrics ? { metrics: existingMetrics } : null,
        error: null,
      }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: null }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips LLM call when all comments are cached with matching body hashes", async () => {
    const cachedBodyHtml = "<p>cached comment text</p>";
    const comment = makeComment({
      id_code: "inc1",
      body_html: cachedBodyHtml,
    });
    const article = makeArticle({ id: 800 });

    setupMockWithCachedMetrics(
      [article],
      [comment],
      [
        {
          tone: 0.5,
          relevance: 0.6,
          depth: 0.4,
          constructiveness: 0.5,
          id_code: "inc1",
          body_hash: bodyHash(cachedBodyHtml),
        },
      ],
    );

    // analyzeConversation default mock returns null; we verify it is never called
    vi.mocked(analyzeConversation).mockResolvedValue(null);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    // All comments hit the cache — LLM not needed
    expect(analyzeConversation).not.toHaveBeenCalled();
  });

  it("calls LLM only for new comment when one is cached and one is new", async () => {
    const cachedBodyHtml = "<p>old comment</p>";
    const newBodyHtml = "<p>brand new comment</p>";

    const cachedComment = makeComment({
      id_code: "inc2_cached",
      body_html: cachedBodyHtml,
    });
    const newComment = makeComment({
      id_code: "inc2_new",
      body_html: newBodyHtml,
    });
    const article = makeArticle({ id: 801 });

    setupMockWithCachedMetrics(
      [article],
      [cachedComment, newComment],
      [
        {
          tone: 0.3,
          relevance: 0.5,
          depth: 0.4,
          constructiveness: 0.3,
          id_code: "inc2_cached",
          body_hash: bodyHash(cachedBodyHtml),
        },
      ],
    );

    vi.mocked(analyzeConversation).mockResolvedValue({
      comments: [
        {
          index: 0,
          tone: 0.7,
          relevance: 0.8,
          depth: 0.6,
          constructiveness: 0.7,
        },
      ],
      volatility: 0.2,
      topic_tags: ["topic"],
    });

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(analyzeConversation).toHaveBeenCalledTimes(1);
    // Only the new (uncached) comment text should be sent to the LLM
    expect(analyzeConversation).toHaveBeenCalledWith(expect.any(String), [
      stripHtml(newBodyHtml),
    ]);
  });

  it("re-scores an edited comment whose body_hash mismatches the cache", async () => {
    const editedBodyHtml = "<p>updated content</p>";
    const editedComment = makeComment({
      id_code: "inc3_edited",
      body_html: editedBodyHtml,
    });
    const article = makeArticle({ id: 802 });

    // Cache has a stale hash (old text) for the same id_code
    setupMockWithCachedMetrics(
      [article],
      [editedComment],
      [
        {
          tone: 0.2,
          relevance: 0.3,
          depth: 0.2,
          constructiveness: 0.1,
          id_code: "inc3_edited",
          body_hash: "0000stale",
        },
      ],
    );

    vi.mocked(analyzeConversation).mockResolvedValue({
      comments: [
        {
          index: 0,
          tone: 0.6,
          relevance: 0.7,
          depth: 0.5,
          constructiveness: 0.6,
        },
      ],
      volatility: 0.1,
      topic_tags: ["update"],
    });

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    // Hash mismatch → comment treated as edited → LLM re-scores it
    expect(analyzeConversation).toHaveBeenCalledTimes(1);
  });

  it("preserves cached scores when LLM fails for a new comment in a partial batch", async () => {
    const cachedBodyHtml = "<p>old stable comment</p>";
    const newBodyHtml = "<p>new comment to score</p>";

    const cachedComment = makeComment({
      id_code: "inc4_cached",
      body_html: cachedBodyHtml,
    });
    const newComment = makeComment({
      id_code: "inc4_new",
      body_html: newBodyHtml,
    });
    const article = makeArticle({ id: 803 });

    setupMockWithCachedMetrics(
      [article],
      [cachedComment, newComment],
      [
        {
          tone: 0.4,
          relevance: 0.5,
          depth: 0.3,
          constructiveness: 0.4,
          id_code: "inc4_cached",
          body_hash: bodyHash(cachedBodyHtml),
        },
      ],
    );

    // LLM fails for the new comment
    vi.mocked(analyzeConversation).mockResolvedValue(null);

    const result = await syncArticles(1);

    // Sync succeeds: cached score for inc4_cached is preserved; inc4_new gets no score
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("falls back to heuristic mode when LLM fails with unscored new comments", async () => {
    const cachedBodyHtml = "<p>cached comment</p>";
    const newBodyHtml = "<p>new comment</p>";
    const cachedComment = makeComment({
      id_code: "inc5_cached",
      body_html: cachedBodyHtml,
    });
    const newComment = makeComment({
      id_code: "inc5_new",
      body_html: newBodyHtml,
    });
    const article = makeArticle({ id: 804 });

    const upsertCalls: Record<string, unknown>[] = [];
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          metrics: {
            interaction_scores: [
              {
                tone: 0.4,
                relevance: 0.5,
                depth: 0.3,
                constructiveness: 0.4,
                id_code: "inc5_cached",
                body_hash: bodyHash(cachedBodyHtml),
              },
            ],
          },
        },
        error: null,
      }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockResolvedValue(article as never);
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([
      cachedComment,
      newComment,
    ]);
    vi.mocked(analyzeConversation).mockResolvedValue(null); // LLM fails

    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        upsertCalls.push(data);
        return Promise.resolve({ error: null });
      }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    // LLM failed for the new comment → heuristic mode, no placeholder scores cached
    const articleUpsert = upsertCalls.find((d) => "metrics" in d) as
      Record<string, unknown> | undefined;
    expect(articleUpsert).toBeDefined();
    const metrics = articleUpsert?.metrics as Record<string, unknown>;
    expect(metrics.interaction_method).toBe("heuristic");
    expect(metrics.interaction_scores).toBeUndefined();
  });

  it("runs keyword safety net when LLM fails and article has support signals", async () => {
    // Article body contains two distinct support-signal phrases
    const article = makeArticle({
      id: 805,
      body_markdown: "I am dealing with burnout and mental health issues.",
    });
    const comment = makeComment({
      id_code: "inc6_new",
      body_html: "<p>comment</p>",
    });

    const upsertCalls: Record<string, unknown>[] = [];
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockResolvedValue(article as never);
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([comment]);
    vi.mocked(analyzeConversation).mockResolvedValue(null); // LLM unavailable

    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        upsertCalls.push(data);
        return Promise.resolve({ error: null });
      }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    // Keyword safety net: >= 2 support phrases in body → needs_support: true
    const articleUpsert = upsertCalls.find((d) => "metrics" in d) as
      Record<string, unknown> | undefined;
    expect(articleUpsert).toBeDefined();
    const metrics = articleUpsert?.metrics as Record<string, unknown>;
    expect(metrics.needs_support).toBe(true);
  });

  it("preserves stored needs_support when all comments are cache hits and LLM not called", async () => {
    const cachedBodyHtml = "<p>all cached</p>";
    const comment = makeComment({
      id_code: "inc7_cached",
      body_html: cachedBodyHtml,
    });
    const article = makeArticle({ id: 806 });

    const upsertCalls: Record<string, unknown>[] = [];
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: [], error: null }),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          metrics: {
            needs_support: true, // stored from a prior LLM run
            interaction_scores: [
              {
                tone: 0.6,
                relevance: 0.7,
                depth: 0.5,
                constructiveness: 0.6,
                id_code: "inc7_cached",
                body_hash: bodyHash(cachedBodyHtml),
              },
            ],
          },
        },
        error: null,
      }),
    };
    const deleteChain = {
      lt: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };
    vi.mocked(ForemClient.getLatestArticles).mockImplementation(
      async (page) => {
        if (page === 1) return [article] as never;
        return [];
      },
    );
    vi.mocked(ForemClient.getArticle).mockResolvedValue(article as never);
    vi.mocked(ForemClient.getUserByUsername).mockResolvedValue(mockUser);
    vi.mocked(ForemClient.getComments).mockResolvedValue([comment]);
    // analyzeConversation not called — all cache hits

    vi.mocked(supabase.from).mockReturnValue({
      upsert: vi.fn().mockImplementation((data: Record<string, unknown>) => {
        upsertCalls.push(data);
        return Promise.resolve({ error: null });
      }),
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn().mockReturnValue(deleteChain),
    } as never);

    const result = await syncArticles(1);

    expect(result.synced).toBe(1);
    expect(analyzeConversation).not.toHaveBeenCalled(); // all cache hits
    const articleUpsert = upsertCalls.find((d) => "metrics" in d) as
      Record<string, unknown> | undefined;
    expect(articleUpsert).toBeDefined();
    const metrics = articleUpsert?.metrics as Record<string, unknown>;
    // Stored needs_support preserved — keyword scan does not run when LLM cached
    expect(metrics.needs_support).toBe(true);
    expect(metrics.interaction_method).toBe("llm"); // all cache hits = llm mode
  });
});

// ---------------------------------------------------------------------------
// buildArticleMetrics — needs_support field
// ---------------------------------------------------------------------------

describe("buildArticleMetrics needs_support", () => {
  const emptyMetrics = {
    uniqueCommenters: new Set<string>(),
    totalCommentWords: 0,
    pos_comments: 0,
    neg_comments: 0,
    alternating_pairs: 0,
    replies_with_parent: 0,
    promo_keywords: 0,
    help_keywords: 0,
    externalDomainCounts: new Map<string, number>(),
    comment_timestamps: [] as Date[],
    commenter_comment_counts: new Map<string, number>(),
    comment_depths: [] as Array<{ timestamp: Date; depth: number }>,
  };

  const baseInput = {
    metrics: emptyMetrics,
    publishedAt: "2024-01-01T10:00:00Z",
    commentCount: 0,
    ageHours: 3,
    riskScore: 0,
    frequencyPenalty: 0,
    engagementCredit: 0,
    wordCount: 500,
    reactionCount: 0,
    repeatedLinks: 0,
    isFirstPost: false,
    llmResult: null,
  };

  it("stores needs_support: true when needsSupport is true", () => {
    const result = buildArticleMetrics({
      ...baseInput,
      needsSupport: true,
    });
    expect(result.needs_support).toBe(true);
  });

  it("stores needs_support: false when needsSupport is false", () => {
    const result = buildArticleMetrics({
      ...baseInput,
      needsSupport: false,
    });
    expect(result.needs_support).toBe(false);
  });
});
