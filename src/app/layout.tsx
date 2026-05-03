import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const interTight = Inter_Tight({
  weight: ["400", "500", "600"],
  variable: "--font-inter-tight",
  subsets: ["latin"],
  display: "swap",
});

const jetBrainsMono = JetBrains_Mono({
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "DEV Community Dashboard",
  description:
    "Surface meaningful conversations on dev.to. Posts ranked by interaction quality, not popularity.",
  icons: {
    icon: { url: "/favicon.svg", type: "image/svg+xml" },
  },
};

const themeScript = `
(function(){
  try {
    var t = localStorage.getItem("theme");
    var prefersDark = matchMedia("(prefers-color-scheme:dark)").matches;
    var root = document.documentElement;
    root.classList.remove("dark", "paper");
    if (t === "paper") root.classList.add("paper");
    else if (t === "dark" || (t !== "light" && prefersDark)) root.classList.add("dark");
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* suppressHydrationWarning: browser extensions (e.g. Colorzilla)
         inject attributes like cz-shortcut-listen on <body> before React
         hydrates, causing a harmless mismatch. */}
      <body
        suppressHydrationWarning
        className={`${interTight.variable} ${jetBrainsMono.variable} ${fraunces.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
