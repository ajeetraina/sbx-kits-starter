import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sbx Kit Builder",
  description:
    "Build Docker Sandbox (sbx) kits for your product — schema v2 — with AI-assisted generation from your repository.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-mono antialiased">{children}</body>
    </html>
  );
}
