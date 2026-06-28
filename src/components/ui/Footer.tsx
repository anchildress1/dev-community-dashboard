import { ExternalLink, Sparkles } from "lucide-react";

export function Footer() {
  return (
    <footer
      className="footer-glass border-surface-border relative z-10 border-t"
      role="contentinfo"
    >
      <div className="mx-auto max-w-7xl px-6 py-5">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          {/* Left — Copyright */}
          <p className="text-text-muted text-xs">
            &copy;{" "}
            {`${new Date().getFullYear()} ChecKMarK DevTools & Ashley Childress`}
          </p>

          {/* Center — AI attribution */}
          <div className="flex items-center gap-2 text-sm">
            <Sparkles
              className="text-accent-primary h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span className="text-text-secondary">
              Interaction scoring by{" "}
              <span className="text-text-primary font-semibold">
                OpenAI / heuristic fallback
              </span>
            </span>
          </div>

          {/* Right — DEV Weekend Challenge */}
          <a
            href="https://dev.to"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-primary hover:text-accent-hover group inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
          >
            Created for DEV Weekend Challenge
            <ExternalLink
              className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
