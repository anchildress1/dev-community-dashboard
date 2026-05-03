import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Dashboard } from "@/components/Dashboard";
import { vi, Mock } from "vitest";

// Set up mock fetch
const mockPosts = [
  {
    id: 1,
    title: "Needs review post",
    canonical_url: "https://dev.to/test/post-1",
    score: 85,
    attention_level: "NEEDS_REVIEW",
    explanations: ["Heat Score: 7.50", "Risk Score: 2"],
    published_at: "2023-10-27T10:00:00Z",
    author: "testauthor",
    reactions: 10,
    comments: 50,
  },
  {
    id: 2,
    title: "Normal post",
    canonical_url: "https://dev.to/test/post-2",
    score: 15,
    attention_level: "NORMAL",
    explanations: [],
    published_at: "2023-10-26T10:00:00Z",
    author: "gooduser",
    reactions: 20,
    comments: 5,
  },
];

const mockPostDetails = {
  ...mockPosts[0],
  dev_url: "https://dev.to/testauthor/post-1",
  recent_posts: [
    {
      id: 3,
      title: "Previous post",
      canonical_url: "https://dev.to/test/post-3",
      dev_url: "https://dev.to/testauthor/post-3",
      score: 10,
      attention_level: "NORMAL",
      published_at: "2023-10-20T10:00:00Z",
    },
  ],
};

globalThis.fetch = vi.fn() as Mock;

describe("Dashboard Component", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Re-stub matchMedia + localStorage after resetAllMocks (ThemeToggle needs these)
    Object.defineProperty(globalThis, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    Object.defineProperty(globalThis, "localStorage", {
      writable: true,
      value: {
        getItem: vi.fn().mockReturnValue(null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      },
    });
  });

  it("renders loading state initially", () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
    const { container } = render(<Dashboard />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("fetches and renders a list of posts with new category labels", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.queryByText("DEV Community Dashboard")).toBeInTheDocument();
    });

    expect(screen.getByText("Needs review post")).toBeInTheDocument();
    expect(screen.getByText("Normal post")).toBeInTheDocument();
    // New analyst-briefing labels
    expect(screen.getByText("Rapid Discussion")).toBeInTheDocument();
    expect(screen.getByText("Steady Signal")).toBeInTheDocument();
  });

  it("handles post selection and fetching details", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({ ok: true, json: async () => mockPostDetails });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    const postCard = screen
      .getByText("Needs review post")
      .closest("div.border")!;
    fireEvent.click(postCard);

    await waitFor(() => {
      expect(screen.getByText("Discussion State")).toBeInTheDocument();
    });

    // @testauthor now appears in both the list card and the detail panel
    expect(screen.getAllByText("@testauthor").length).toBeGreaterThanOrEqual(2);
    // Heat 7.5 (Notable) and Risk 2 (Notable) both show qualitative labels
    const moderateLabels = screen.getAllByText("Notable");
    expect(moderateLabels.length).toBeGreaterThanOrEqual(2);
  });

  it("displays BOOST_VISIBILITY category correctly", async () => {
    const boostPosts = [
      {
        id: 4,
        title: "Boost me",
        canonical_url: "https://dev.to/test/post-4",
        score: 30,
        attention_level: "BOOST_VISIBILITY",
        explanations: ["Attention Delta: 5.20"],
        published_at: "2023-10-27T10:00:00Z",
        author: "writer",
        reactions: 2,
        comments: 3,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => boostPosts });
    render(<Dashboard />);

    await waitFor(() => {
      // BOOST_VISIBILITY triggers "Trending Signal" badge
      expect(screen.getByText("Trending Signal")).toBeInTheDocument();
    });
  });

  it("displays NEEDS_RESPONSE category correctly", async () => {
    const responsePosts = [
      {
        id: 5,
        title: "Help needed",
        canonical_url: "https://dev.to/test/post-5",
        score: 20,
        attention_level: "NEEDS_RESPONSE",
        explanations: ["Support Score: 5"],
        published_at: "2023-10-27T10:00:00Z",
        author: "newbie",
        reactions: 0,
        comments: 0,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => responsePosts });
    render(<Dashboard />);

    await waitFor(() => {
      // NEEDS_RESPONSE triggers "Awaiting Collaboration"
      expect(screen.getByText("Awaiting Collaboration")).toBeInTheDocument();
    });
  });

  it("displays NEEDS_SUPPORT category with rose badge", async () => {
    const supportPosts = [
      {
        id: 10,
        title: "Struggling with burnout",
        canonical_url: "https://dev.to/test/post-10",
        score: 5,
        attention_level: "NEEDS_SUPPORT",
        explanations: ["Support Score: 2"],
        published_at: "2023-10-27T10:00:00Z",
        author: "burntout",
        reactions: 0,
        comments: 0,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => supportPosts });
    render(<Dashboard />);

    await waitFor(() => {
      // NEEDS_SUPPORT triggers "Needs Support" badge
      expect(screen.getByText("Needs Support")).toBeInTheDocument();
    });

    // Verify the badge has the rose variant class
    const badge = screen.getByText("Needs Support");
    expect(badge).toHaveClass("bg-rose-100");
  });

  it("displays SIGNAL_AT_RISK category correctly", async () => {
    const lowQPosts = [
      {
        id: 6,
        title: "Buy crypto now",
        canonical_url: "https://dev.to/test/post-6",
        score: 5,
        attention_level: "SIGNAL_AT_RISK",
        explanations: ["Risk Score: 8"],
        published_at: "2023-10-27T10:00:00Z",
        author: "spammer",
        reactions: 0,
        comments: 0,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => lowQPosts });
    render(<Dashboard />);

    await waitFor(() => {
      // SIGNAL_AT_RISK triggers "Anomalous Signal"
      expect(screen.getByText("Anomalous Signal")).toBeInTheDocument();
    });
  });

  it("handles empty post list", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => [] });

    render(<Dashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("No posts found. Waiting for data sync."),
      ).toBeInTheDocument();
    });
  });

  it("sorts posts by attention priority: NEEDS_RESPONSE > BOOST > NEEDS_REVIEW > LOW_QUALITY > NORMAL", async () => {
    const mixedPosts = [
      {
        ...mockPosts[1],
        id: 10,
        title: "Normal post",
        attention_level: "NORMAL",
        score: 100,
      },
      {
        ...mockPosts[0],
        id: 11,
        title: "Needs review",
        attention_level: "NEEDS_REVIEW",
        score: 50,
      },
      {
        ...mockPosts[0],
        id: 12,
        title: "Needs response",
        attention_level: "NEEDS_RESPONSE",
        score: 10,
      },
      {
        ...mockPosts[0],
        id: 13,
        title: "Boost post",
        attention_level: "BOOST_VISIBILITY",
        score: 30,
      },
      {
        ...mockPosts[0],
        id: 14,
        title: "Low quality",
        attention_level: "SIGNAL_AT_RISK",
        score: 5,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mixedPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs response")).toBeInTheDocument();
    });

    const titles = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent);
    expect(titles).toEqual([
      "Needs response",
      "Low quality",
      "Boost post",
      "Needs review",
      "Normal post",
    ]);
  });

  it("displays computed word count and age from explanations and published_at", async () => {
    const threeHoursAgo = new Date(
      Date.now() - 3 * 60 * 60 * 1000,
    ).toISOString();
    const detailWithMetrics = {
      ...mockPosts[0],
      published_at: threeHoursAgo,
      explanations: ["Word Count: 1200", "Heat Score: 5.00"],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithMetrics,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      // Metrics rendered as emphasized numbers inside a labeled container
      const metricsBar = screen.getByLabelText("Post engagement metrics");
      expect(metricsBar).toHaveTextContent("1200");
      expect(metricsBar).toHaveTextContent("words");
      expect(metricsBar).toHaveTextContent("3h");
      expect(metricsBar).toHaveTextContent("old");
    });
  });

  it("renders GitHub feedback link in header", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("DEV Community Dashboard")).toBeInTheDocument();
    });

    const feedbackLink = screen.getByText("Feedback").closest("a");
    expect(feedbackLink).toHaveAttribute(
      "href",
      "https://github.com/ChecKMarKDevTools/dev-community-dashboard/issues",
    );
    expect(feedbackLink).toHaveAttribute("target", "_blank");
    expect(feedbackLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("displays score narratives explaining each score in plain language", async () => {
    const detailWithScores = {
      ...mockPosts[0],
      explanations: [
        "Heat Score: 7.50",
        "Risk Score: 2 (freq: 0, promo: 1, engage: -1)",
        "Support Score: 0",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithScores,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Discussion State")).toBeInTheDocument();
    });

    // Heat 7.5 >= 5 triggers elevated narrative
    expect(
      screen.getByText("Replies are arriving faster than usual."),
    ).toBeInTheDocument();
    // Risk 2 >= 1 triggers minor flags narrative
    expect(
      screen.getByText("Minor divergence from baseline patterns."),
    ).toBeInTheDocument();
    // Support 0 triggers established narrative
    expect(
      screen.getByText("Replies are frequent but rarely build on each other."),
    ).toBeInTheDocument();
  });

  it("parses scores from explanations and shows qualitative labels", async () => {
    const detailFromExplanations = {
      ...mockPosts[0],
      explanations: [
        "Word Count: 500",
        "Heat Score: 12.00",
        "Risk Score: 5 (freq: 2, promo: 1, engage: -0)",
        "Support Score: 4",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailFromExplanations,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      // Qualitative labels instead of "X pts"
      // Heat 12 >= 10 = Elevated, Risk 5 >= 4 = Elevated, Support 4 >= 4 = Elevated
      const highLabels = screen.getAllByText("Elevated");
      expect(highLabels.length).toBe(3);
    });

    // High heat narrative
    expect(
      screen.getByText(
        "Reply rate is higher than typical; reactions are mixed.",
      ),
    ).toBeInTheDocument();
    // High risk narrative
    expect(
      screen.getByText("Noticeable deviation from normal discussion behavior."),
    ).toBeInTheDocument();
    // High support narrative
    expect(
      screen.getByText(
        "Author appears to need community help — new user with little engagement.",
      ),
    ).toBeInTheDocument();
  });

  it("renders Conversation Signals with tooltips, excluding scores shown in Discussion State", async () => {
    const detailWithSignals = {
      ...mockPosts[0],
      explanations: [
        "Word Count: 800",
        "Unique Commenters: 5",
        "Effort: 30.01",
        "Attention Delta: 12.50",
        "Heat Score: 3.00",
        "Risk Score: 0 (freq: 0, promo: 0, engage: -0)",
        "Support Score: 1",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithSignals,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Conversation Signals")).toBeInTheDocument();
    });

    // Activity signals card should show only non-score signals (4 items)
    const tooltips = screen.getAllByRole("tooltip");
    const tooltipTexts = tooltips.map((el) => el.textContent);

    expect(tooltipTexts).toContain(
      "Total words across the conversation; long threads usually mean debate or explanation, not automatically a problem.",
    );
    expect(tooltipTexts).toContain(
      "How many different people joined; higher numbers suggest community interest rather than one person arguing with themselves.",
    );
    expect(tooltipTexts).toContain(
      "Rough estimate of how much thinking and replying participants put in; long thoughtful replies raise it, short reactions barely move it.",
    );
    expect(tooltipTexts).toContain(
      "Measures how quickly people started paying attention compared to normal; spikes mean the topic suddenly caught eyes.",
    );

    // Heat/Risk/Support should NOT appear in the signals card (they're in Discussion State)
    expect(tooltipTexts).not.toContain(
      "Emotional intensity of replies; disagreement and passion raise it, calm discussion lowers it.",
    );

    // Qualitative labels should appear in Discussion State
    const lowLabels = screen.getAllByText("Nominal");
    expect(lowLabels.length).toBeGreaterThanOrEqual(2);
  });

  it("handles fetch rejection for post details without crashing", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      // Details fetch rejects (network error, CORS, etc.)
      return Promise.reject(new Error("Network error"));
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    // Detail panel should not crash — just stays in a non-loaded state
    // The loading spinner appears, then disappears once the catch fires
    await waitFor(() => {
      // No "Discussion State" should appear since the fetch failed
      expect(screen.queryByText("Discussion State")).not.toBeInTheDocument();
    });

    // Posts list should still be accessible
    expect(screen.getByText("Needs review post")).toBeInTheDocument();
  });

  it("does not render the API error for non-ok posts fetch", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<Dashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("No posts found. Waiting for data sync."),
      ).toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });

  it("handles api error for posts list", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Failed to fetch"));

    render(<Dashboard />);

    await waitFor(() => {
      expect(
        screen.getByText("No posts found. Waiting for data sync."),
      ).toBeInTheDocument();
    });

    consoleErrorSpy.mockRestore();
  });

  it("shows Thread Momentum card in detail panel", async () => {
    const detailWithHighRisk = {
      ...mockPosts[0],
      explanations: [
        "Heat Score: 3.00",
        "Risk Score: 7 (freq: 3, promo: 2, engage: -0)",
        "Support Score: 0",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithHighRisk,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Thread Momentum")).toBeInTheDocument();
    });

    // Risk 7 >= 6 triggers problem-behavior observation
    expect(
      screen.getByText("Patterns match known problem behaviors."),
    ).toBeInTheDocument();
  });

  it("shows default observation when no signals are elevated", async () => {
    const detailRoutine = {
      ...mockPosts[0],
      explanations: [
        "Heat Score: 2.00",
        "Risk Score: 0 (freq: 0, promo: 0, engage: -0)",
        "Support Score: 1",
      ],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
    };
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailRoutine,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Thread Momentum")).toBeInTheDocument();
    });

    expect(
      screen.getByText("It's pretty quiet—just routine discussion so far."),
    ).toBeInTheDocument();
  });

  it("renders Conversation Signals before Discussion State in DOM order", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({ ok: true, json: async () => mockPostDetails });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Conversation Signals")).toBeInTheDocument();
    });

    const signals = screen.getByText("Conversation Signals");
    const surfaced = screen.getByText("Discussion State");

    // Conversation Signals should appear before Discussion State in DOM
    expect(
      signals.compareDocumentPosition(surfaced) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("renders badge on the right side of list cards after title", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    // The title should come before the badge in DOM order (badge on right)
    const title = screen.getByText("Needs review post");
    const badge = screen.getByText("Rapid Discussion");

    expect(
      title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows behavior description based on heat signals", async () => {
    const highHeatPosts = [
      {
        id: 7,
        title: "Hot discussion",
        canonical_url: "https://dev.to/test/post-7",
        score: 60,
        attention_level: "NEEDS_REVIEW",
        explanations: [
          "Heat Score: 12.00",
          "Risk Score: 1",
          "Support Score: 0",
        ],
        published_at: "2023-10-27T10:00:00Z",
        author: "hotauthor",
        reactions: 5,
        comments: 30,
      },
    ];
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => highHeatPosts });
    render(<Dashboard />);

    await waitFor(() => {
      // NEEDS_REVIEW triggers "Rapid Discussion"
      expect(screen.getAllByText("Rapid Discussion").length).toBeGreaterThan(0);
    });
  });

  it("shows qualitative level on recent post badges instead of numeric score", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({ ok: true, json: async () => mockPostDetails });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Previous post")).toBeInTheDocument();
    });

    // Recent post badge now shows attention category label instead of qualitative score
    const recentSection = screen.getByText(/Recent Posts by @/);
    expect(recentSection).toBeInTheDocument();

    // NORMAL attention_level maps to "Routine Discussion" label
    // The badge in the recent posts section uses getCategoryLabel(rp.attention_level)
    const recentCard = screen.getByText("Previous post").closest(".border")!;
    const badge = recentCard.querySelector(String.raw`.text-\[10px\]`);
    expect(badge?.textContent).toBe("Steady Signal");
  });

  // ── Close button & Escape key ───────────────────────────────────────────

  it("closes detail panel when close button is clicked", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({ ok: true, json: async () => mockPostDetails });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Discussion State")).toBeInTheDocument();
    });

    // Click the close button
    const closeBtn = screen.getByRole("button", {
      name: "Close detail panel",
    });
    fireEvent.click(closeBtn);

    // Detail panel should be gone
    await waitFor(() => {
      expect(screen.queryByText("Discussion State")).not.toBeInTheDocument();
    });
  });

  it("closes detail panel when Escape key is pressed", async () => {
    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({ ok: true, json: async () => mockPostDetails });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Discussion State")).toBeInTheDocument();
    });

    // Press Escape
    fireEvent.keyDown(document, { key: "Escape" });

    // Detail panel should be gone
    await waitFor(() => {
      expect(screen.queryByText("Discussion State")).not.toBeInTheDocument();
    });
  });

  it("renders theme toggle button in header", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => mockPosts });
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText("DEV Community Dashboard")).toBeInTheDocument();
    });

    // ThemeToggle renders a button with aria-label
    expect(
      screen.getByRole("button", { name: "Light mode" }),
    ).toBeInTheDocument();
  });

  // ── Module-grid chart visualizations ──────────────────────────────────

  it("renders chart modules when metrics data is present", async () => {
    const detailWithMetrics = {
      ...mockPosts[0],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
      metrics: {
        velocity_buckets: [
          { hour: 0, count: 3 },
          { hour: 1, count: 5 },
        ],
        comments_per_hour: 2.5,
        commenter_shares: [
          { username: "alice", share: 0.5 },
          { username: "bob", share: 0.3 },
        ],
        constructiveness_buckets: [
          { hour: 0, depth_index: 0.5 },
          { hour: 1, depth_index: 1.5 },
        ],
        avg_comment_length: 25,
        reply_ratio: 0.6,
        alternating_pairs: 1,
        risk_components: {
          frequency_penalty: 0,
          short_content: false,
          no_engagement: false,
          promo_keywords: 0,
          repeated_links: 0,
          engagement_credit: 1,
        },
        risk_score: 0,
        is_first_post: false,
        help_keywords: 0,
        interaction_signal: 0.65,
        interaction_method: "llm",
        topic_tags: ["testing", "react"],
        interaction_scores: [
          {
            index: 0,
            tone: 0.5,
            relevance: 0.8,
            depth: 0.7,
            constructiveness: 0.6,
          },
          {
            index: 1,
            tone: 0.3,
            relevance: 0.6,
            depth: 0.4,
            constructiveness: 0.5,
          },
        ],
        interaction_volatility: 0.3,
        signal_strong_pct: 40,
        signal_moderate_pct: 40,
        signal_faint_pct: 20,
      },
    };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithMetrics,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Reply Velocity")).toBeInTheDocument();
    });

    // All chart modules should be visible in the unified module grid
    expect(screen.getByText("Participation Distribution")).toBeInTheDocument();
    expect(screen.getByText("Interaction Signal")).toBeInTheDocument();
    expect(screen.getByText("Constructiveness Trend")).toBeInTheDocument();
    expect(screen.getByText("Contributing Signals")).toBeInTheDocument();
    expect(screen.queryByText("Risk Signal Timeline")).not.toBeInTheDocument();
  });

  it("shows chart modules with empty states when metrics is null", async () => {
    const detailNoMetrics = {
      ...mockPosts[0],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
      metrics: null,
    };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailNoMetrics,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Discussion State")).toBeInTheDocument();
    });

    // Chart modules always rendered, even without metrics data
    expect(screen.getByText("Reply Velocity")).toBeInTheDocument();
    expect(screen.getByText("Contributing Signals")).toBeInTheDocument();
    expect(screen.queryByText("Risk Signal Timeline")).not.toBeInTheDocument();
  });

  it("renders Contributing Signals chart with risk marker labels", async () => {
    const detailWithRisk = {
      ...mockPosts[0],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
      metrics: {
        velocity_buckets: [{ hour: 0, count: 1 }],
        comments_per_hour: 0.5,
        commenter_shares: [{ username: "alice", share: 1 }],
        constructiveness_buckets: [],
        avg_comment_length: 10,
        reply_ratio: 0,
        alternating_pairs: 0,
        risk_components: {
          frequency_penalty: 2,
          short_content: true,
          no_engagement: false,
          promo_keywords: 1,
          repeated_links: 0,
          engagement_credit: 0,
        },
        risk_score: 5,
        is_first_post: false,
        help_keywords: 0,
        interaction_signal: 0.2,
        interaction_method: "heuristic",
        signal_strong_pct: 0,
        signal_moderate_pct: 0,
        signal_faint_pct: 100,
      },
    };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithRisk,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Discussion State")).toBeInTheDocument();
    });

    // Contributing Signals chart appears in the module grid
    expect(screen.getByText("Contributing Signals")).toBeInTheDocument();
    expect(screen.getByText("Frequency Penalty")).toBeInTheDocument();
    expect(screen.getByText("Short Content")).toBeInTheDocument();
    expect(screen.getByText("Promotional Keywords")).toBeInTheDocument();
    // Old name "Risk Signal Timeline" should not exist
    expect(screen.queryByText("Risk Signal Timeline")).not.toBeInTheDocument();
    // Inline "Contributing signals:" label in Discussion State should not exist
    expect(screen.queryByText("Contributing signals:")).not.toBeInTheDocument();
  });

  it("shows signal score and volatility with hover helpers when interaction_method is 'llm'", async () => {
    const detailWithLLM = {
      ...mockPosts[0],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
      metrics: {
        velocity_buckets: [],
        comments_per_hour: 0,
        commenter_shares: [],
        constructiveness_buckets: [],
        avg_comment_length: 20,
        reply_ratio: 0,
        alternating_pairs: 0,
        risk_components: {
          frequency_penalty: 0,
          short_content: false,
          no_engagement: false,
          promo_keywords: 0,
          repeated_links: 0,
          engagement_credit: 0,
        },
        risk_score: 0,
        is_first_post: false,
        help_keywords: 0,
        interaction_signal: 0.72,
        interaction_method: "llm",
        topic_tags: ["typescript", "testing"],
        interaction_scores: [
          {
            index: 0,
            tone: 0.8,
            relevance: 0.9,
            depth: 0.7,
            constructiveness: 0.6,
          },
          {
            index: 1,
            tone: -0.1,
            relevance: 0.5,
            depth: 0.3,
            constructiveness: 0.4,
          },
        ],
        interaction_volatility: 0.6,
        signal_strong_pct: 50,
        signal_moderate_pct: 25,
        signal_faint_pct: 25,
      },
    };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithLLM,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Interaction Signal")).toBeInTheDocument();
    });

    // Signal score with hover helper
    const signalSpan = screen.getByTitle(/Composite interaction quality/);
    expect(signalSpan).toBeInTheDocument();
    expect(signalSpan.textContent).toContain("0.72");

    // Volatility with hover helper (LLM only)
    const volSpan = screen.getByTitle(/How much scores vary/);
    expect(volSpan).toBeInTheDocument();
    expect(volSpan.textContent).toContain("60%");

    // Topic tags ARE rendered (metric transparency — all computed values must be visible)
    expect(screen.getByText("typescript")).toBeInTheDocument();
    expect(screen.getByText("testing")).toBeInTheDocument();

    // Method label IS rendered (users can see how scores were produced)
    const methodSpan = screen.getByTitle(
      /How interaction scores were produced/,
    );
    expect(methodSpan).toBeInTheDocument();
    expect(methodSpan.textContent).toContain("llm");
  });

  it("shows signal score without volatility when interaction_method is 'heuristic'", async () => {
    const detailWithHeuristic = {
      ...mockPosts[0],
      dev_url: "https://dev.to/testauthor/post-1",
      recent_posts: [],
      metrics: {
        velocity_buckets: [],
        comments_per_hour: 0,
        commenter_shares: [],
        constructiveness_buckets: [],
        avg_comment_length: 20,
        reply_ratio: 0,
        alternating_pairs: 0,
        risk_components: {
          frequency_penalty: 0,
          short_content: false,
          no_engagement: false,
          promo_keywords: 0,
          repeated_links: 0,
          engagement_credit: 0,
        },
        risk_score: 0,
        is_first_post: false,
        help_keywords: 0,
        interaction_signal: 0.45,
        interaction_method: "heuristic",
        signal_strong_pct: 20,
        signal_moderate_pct: 60,
        signal_faint_pct: 20,
      },
    };

    globalThis.fetch = vi.fn().mockImplementation((url) => {
      if (url === "/api/posts")
        return Promise.resolve({ ok: true, json: async () => mockPosts });
      if (url === "/api/posts/1")
        return Promise.resolve({
          ok: true,
          json: async () => detailWithHeuristic,
        });
      return Promise.reject(new Error("Not found"));
    });

    render(<Dashboard />);
    await waitFor(() => {
      expect(screen.getByText("Needs review post")).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByText("Needs review post").closest("div.border")!,
    );

    await waitFor(() => {
      expect(screen.getByText("Interaction Signal")).toBeInTheDocument();
    });

    // Signal score with hover helper
    const signalSpan = screen.getByTitle(/Composite interaction quality/);
    expect(signalSpan).toBeInTheDocument();
    expect(signalSpan.textContent).toContain("0.45");

    // Volatility should NOT be shown for heuristic method
    expect(screen.queryByTitle(/How much scores vary/)).not.toBeInTheDocument();
  });
});
