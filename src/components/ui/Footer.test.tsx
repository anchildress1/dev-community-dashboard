import { render, screen } from "@testing-library/react";
import { Footer } from "@/components/ui/Footer";

describe("Footer", () => {
  it("renders the interaction scoring attribution", () => {
    render(<Footer />);
    expect(screen.getByText("OpenAI / heuristic fallback")).toBeInTheDocument();
    expect(screen.getByText(/Interaction scoring by/)).toBeInTheDocument();
  });

  it("renders the copyright notice with the current year", () => {
    render(<Footer />);
    const year = new Date().getFullYear();
    expect(
      screen.getByText(
        new RegExp(`© ${year} ChecKMarK DevTools & Ashley\\s+Childress`),
      ),
    ).toBeInTheDocument();
  });

  it("renders the DEV Weekend Challenge link", () => {
    render(<Footer />);
    const link = screen.getByRole("link", {
      name: /Created for DEV Weekend Challenge/,
    });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://dev.to");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("has the contentinfo landmark role", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("applies the footer-glass class for styling", () => {
    render(<Footer />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveClass("footer-glass");
  });

  it("does not expose decorative icons to assistive technology", () => {
    const { container } = render(<Footer />);
    const svgs = container.querySelectorAll("svg");
    for (const svg of svgs) {
      expect(svg).toHaveAttribute("aria-hidden", "true");
    }
  });
});
