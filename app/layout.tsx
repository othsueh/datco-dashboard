import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { loadSnapshot } from "@/lib/data";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_TITLE = "DATco Dashboard — Bitcoin Treasury Monitor";
const SITE_DESCRIPTION =
  "Track mNAV, premium-to-NAV, and 30-day BTC correlation for public Digital Asset Treasury companies.";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s — DATco Dashboard",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    type: "website",
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Pull the snapshot timestamp so the footer can display "data as of ...".
  // Read defensively: a missing snapshot during the very first build should
  // not break the whole layout.
  let generatedAt: string | null = null;
  try {
    const snap = await loadSnapshot();
    generatedAt = snap.generated_at;
  } catch {
    generatedAt = null;
  }
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link
              href="/"
              className="flex items-center gap-2 font-semibold tracking-tight"
            >
              <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
              <span>DAT.co Dashboard</span>
            </Link>
            <nav className="flex items-center gap-6 text-sm text-muted-foreground">
              <Link
                href="/"
                className="hover:text-foreground transition-colors"
              >
                Overview
              </Link>
              <Link
                href="/compare"
                className="hover:text-foreground transition-colors"
              >
                Compare
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
        </main>

        <footer className="border-t border-border/60 mt-12">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground space-y-1">
            <p>
              Data sources: BTC/USD from{" "}
              <a
                href="https://www.coingecko.com/en/coins/bitcoin"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                CoinGecko
              </a>
              , equity prices and shares outstanding from{" "}
              <a
                href="https://finance.yahoo.com/"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Yahoo Finance
              </a>{" "}
              via yfinance, BTC holdings aggregated from company IR pages and
              8-K filings.
            </p>
            <p>
              AI-generated summaries by{" "}
              <a
                href="https://www.anthropic.com/claude"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Anthropic Claude
              </a>
              .
            </p>
            <p>
              {generatedAt
                ? `Data generated ${new Date(generatedAt).toUTCString()}.`
                : "Data timestamp unavailable."}{" "}
              Informational use only. Not investment advice.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
