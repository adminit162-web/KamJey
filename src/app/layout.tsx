import type { Metadata, Viewport } from "next";
import { Battambang } from "next/font/google";
import "./globals.css";
import "./readability.css";
import "./tailwind.css";
import "./portfolio.css";
import "./pwa.css";
import DashboardShell from "./dashboard-shell";
import { LanguageProvider } from "./language-provider";
import PwaRegistration from "./pwa-registration";

const battambang = Battambang({
  subsets: ["khmer"],
  weight: ["400", "700", "900"],
  variable: "--font-khmer",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KamJey — Loan dashboard",
  description: "A calm, personal way to manage loans.",
  applicationName: "KamJey",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "KamJey", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f8fa",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="km" data-language="km" className={battambang.variable} suppressHydrationWarning><body><LanguageProvider><PwaRegistration /><DashboardShell>{children}</DashboardShell></LanguageProvider></body></html>;
}
