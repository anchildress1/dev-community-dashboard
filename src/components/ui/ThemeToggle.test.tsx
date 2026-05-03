import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi, beforeEach, afterEach } from "vitest";
import { ThemeToggle } from "./ThemeToggle";

/* Stub matchMedia — returns "not dark" by default */
const listeners: Array<() => void> = [];
let prefersDark = false;

const mockMatchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: query.includes("dark") ? prefersDark : false,
  media: query,
  addEventListener: (_: string, cb: () => void) => listeners.push(cb),
  removeEventListener: (_: string, cb: () => void) => {
    const idx = listeners.indexOf(cb);
    if (idx !== -1) listeners.splice(idx, 1);
  },
}));

const storage: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, val: string) => {
    storage[key] = val;
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

beforeEach(() => {
  Object.defineProperty(globalThis, "matchMedia", {
    writable: true,
    value: mockMatchMedia,
  });
  Object.defineProperty(globalThis, "localStorage", {
    writable: true,
    value: mockLocalStorage,
  });
  prefersDark = false;
  listeners.length = 0;
  delete storage.theme;
  document.documentElement.classList.remove("dark", "paper");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("renders with light mode by default", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: "Light mode" });
    expect(btn).toBeInTheDocument();
  });

  it("cycles light → dark → paper → system → light", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");

    // Start: light
    expect(btn).toHaveAccessibleName("Light mode");

    // Click → dark
    fireEvent.click(btn);
    expect(btn).toHaveAccessibleName("Dark mode");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    // Click → paper
    fireEvent.click(btn);
    expect(btn).toHaveAccessibleName("Paper mode");
    expect(document.documentElement.classList.contains("paper")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Click → system
    fireEvent.click(btn);
    expect(btn).toHaveAccessibleName("System theme");
    expect(document.documentElement.classList.contains("paper")).toBe(false);

    // Click → light
    fireEvent.click(btn);
    expect(btn).toHaveAccessibleName("Light mode");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists theme choice to localStorage", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button");

    fireEvent.click(btn); // → dark
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "dark");

    fireEvent.click(btn); // → paper
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "paper");

    fireEvent.click(btn); // → system
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "system");

    fireEvent.click(btn); // → light
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith("theme", "light");
  });

  it("restores dark mode from localStorage on mount", () => {
    storage.theme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAccessibleName("Dark mode");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores system mode from localStorage on mount", () => {
    storage.theme = "system";
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAccessibleName("System theme");
  });

  it("adds .dark class when system prefers dark and theme is system", () => {
    prefersDark = true;
    storage.theme = "system";
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores paper mode from localStorage on mount", () => {
    storage.theme = "paper";
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAccessibleName("Paper mode");
    expect(document.documentElement.classList.contains("paper")).toBe(true);
  });

  it("removes .dark class when switching to light", () => {
    storage.theme = "dark";
    render(<ThemeToggle />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const btn = screen.getByRole("button");
    fireEvent.click(btn); // → paper
    fireEvent.click(btn); // → system
    fireEvent.click(btn); // → light
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.classList.contains("paper")).toBe(false);
  });

  it("reacts to system preference changes in system mode", () => {
    storage.theme = "system";
    prefersDark = false;
    render(<ThemeToggle />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Simulate system switching to dark
    prefersDark = true;
    act(() => {
      for (const cb of listeners) cb();
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("does not react to system changes when not in system mode", () => {
    render(<ThemeToggle />); // starts in light
    prefersDark = true;

    act(() => {
      for (const cb of listeners) cb();
    });

    // Should stay light — not in system mode
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("applies custom className", () => {
    render(<ThemeToggle className="ml-2" />);
    expect(screen.getByRole("button")).toHaveClass("ml-2");
  });

  it("defaults to light when localStorage has an invalid value", () => {
    storage.theme = "invalid";
    render(<ThemeToggle />);
    expect(screen.getByRole("button")).toHaveAccessibleName("Light mode");
  });
});
