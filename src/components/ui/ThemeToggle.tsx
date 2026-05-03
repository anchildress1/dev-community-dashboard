"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, Newspaper, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "paper" | "system";
const CYCLE: Theme[] = ["light", "dark", "paper", "system"];
const THEME_ICON = {
  light: Sun,
  dark: Moon,
  paper: Newspaper,
  system: Monitor,
} as const;
const THEME_LABEL = {
  light: "Light mode",
  dark: "Dark mode",
  paper: "Paper mode",
  system: "System theme",
} as const;

function applyTheme(theme: Theme): void {
  const prefersDark = matchMedia("(prefers-color-scheme:dark)").matches;
  const root = document.documentElement;
  root.classList.remove("dark", "paper");
  if (theme === "paper") root.classList.add("paper");
  else if (theme === "dark" || (theme === "system" && prefersDark))
    root.classList.add("dark");
}

type ThemeToggleProps = Readonly<{ className?: string }>;

function getInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem("theme");
    if (stored === "dark" || stored === "paper" || stored === "system")
      return stored;
  } catch {
    /* SSR or restricted localStorage — fall back to light */
  }
  return "light";
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  /* Apply theme class on mount and when theme changes */
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  /* Listen for system-level preference changes while in "system" mode */
  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme:dark)");
    const handler = () => {
      if (theme === "system") applyTheme("system");
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const cycle = () => {
    const next = CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length];
    setTheme(next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* localStorage may be unavailable in privacy mode or restricted environments */
    }
    applyTheme(next);
  };

  const Icon = THEME_ICON[theme];
  const label = THEME_LABEL[theme];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={label}
      className={cn(
        "text-text-muted hover:text-text-primary rounded-lg p-2 transition-colors",
        className,
      )}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
