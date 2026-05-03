import { render } from "@testing-library/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";

describe("Card components", () => {
  it("renders Card", () => {
    const { container } = render(<Card className="test-card">Content</Card>);
    expect(container.firstChild).toHaveClass(
      "test-card",
      "rounded-[10px]",
      "border",
      "bg-card",
    );
    expect(container).toHaveTextContent("Content");
  });

  it("renders CardHeader", () => {
    const { container } = render(
      <CardHeader className="test-header">Header</CardHeader>,
    );
    expect(container.firstChild).toHaveClass("test-header", "flex-col", "p-6");
    expect(container).toHaveTextContent("Header");
  });

  it("renders CardTitle", () => {
    const { container } = render(
      <CardTitle className="test-title">Title</CardTitle>,
    );
    expect(container.firstChild?.nodeName).toBe("H3");
    expect(container.firstChild).toHaveClass(
      "test-title",
      "font-semibold",
      "tracking-tight",
    );
    expect(container).toHaveTextContent("Title");
  });

  it("renders CardDescription", () => {
    const { container } = render(
      <CardDescription className="test-desc">Desc</CardDescription>,
    );
    expect(container.firstChild?.nodeName).toBe("P");
    expect(container.firstChild).toHaveClass(
      "test-desc",
      "text-muted-foreground",
    );
    expect(container).toHaveTextContent("Desc");
  });

  it("renders CardContent", () => {
    const { container } = render(
      <CardContent className="test-content">Body</CardContent>,
    );
    expect(container.firstChild).toHaveClass("test-content", "p-6", "pt-0");
    expect(container).toHaveTextContent("Body");
  });

  it("renders CardFooter", () => {
    const { container } = render(
      <CardFooter className="test-footer">Footer</CardFooter>,
    );
    expect(container.firstChild).toHaveClass(
      "test-footer",
      "flex",
      "items-center",
      "p-6",
      "pt-0",
    );
    expect(container).toHaveTextContent("Footer");
  });
});
