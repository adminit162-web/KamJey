import type { Metadata } from "next";
import "./globals.css";
import "./readability.css";
import "./tailwind.css";
import DashboardShell from "./dashboard-shell";

export const metadata: Metadata = {
  title: "KamJey — Loan dashboard",
  description: "A calm, personal way to manage loans.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><DashboardShell>{children}</DashboardShell></body></html>;
}
