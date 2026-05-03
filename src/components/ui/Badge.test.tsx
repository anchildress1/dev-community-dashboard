import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/Badge";

describe("Badge", () => {
  it("renders default badge", () => {
    render(<Badge>Test Badge</Badge>);
    const badge = screen.getByText("Test Badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-accent-primary");
  });

  it("renders neutral badge", () => {
    render(<Badge variant="neutral">Routine</Badge>);
    const badge = screen.getByText("Routine");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-neutral-200");
  });

  it("renders lime badge", () => {
    render(<Badge variant="lime">Trending</Badge>);
    const badge = screen.getByText("Trending");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-lime-100");
  });

  it("renders warm badge", () => {
    render(<Badge variant="warm">Active</Badge>);
    const badge = screen.getByText("Active");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-warm-100");
  });

  it("renders violet badge", () => {
    render(<Badge variant="violet">Silent</Badge>);
    const badge = screen.getByText("Silent");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-violet-100");
  });

  it("renders rose badge", () => {
    render(<Badge variant="rose">Support</Badge>);
    const badge = screen.getByText("Support");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-rose-100");
  });

  it("renders secondary badge", () => {
    render(<Badge variant="secondary">Sec</Badge>);
    const badge = screen.getByText("Sec");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("bg-surface-secondary");
  });

  it("renders outline badge", () => {
    render(<Badge variant="outline">Out</Badge>);
    const badge = screen.getByText("Out");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("text-foreground");
  });

  it("applies custom class names", () => {
    render(<Badge className="custom-class">Test</Badge>);
    const badge = screen.getByText("Test");
    expect(badge).toHaveClass("custom-class");
  });

  it("renders a tone dot when withDot is true", () => {
    render(
      <Badge variant="lime" withDot>
        Trending
      </Badge>,
    );
    const badge = screen.getByText("Trending");
    const dot = badge.querySelector("span[aria-hidden='true']");
    expect(dot).not.toBeNull();
    expect(dot).toHaveClass("bg-tone-lime");
  });

  it("omits the tone dot by default", () => {
    render(<Badge variant="lime">Trending</Badge>);
    const badge = screen.getByText("Trending");
    expect(badge.querySelector("span[aria-hidden='true']")).toBeNull();
  });
});
