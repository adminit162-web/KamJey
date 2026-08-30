import type { Metadata } from "next";
import { Battambang } from "next/font/google";
import "./globals.css";
import "./readability.css";
import "./tailwind.css";
import "./portfolio.css";
import DashboardShell from "./dashboard-shell";
import { LanguageProvider } from "./language-provider";

const battambang = Battambang({
  subsets: ["khmer"],
  weight: ["400", "700", "900"],
  variable: "--font-khmer",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KamJey — Loan dashboard",
  description: "A calm, personal way to manage loans.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={battambang.variable} suppressHydrationWarning><body><LanguageProvider><DashboardShell>{children}</DashboardShell></LanguageProvider></body></html>;
}
