import type { Metadata, Viewport } from "next";
import "@fontsource/berkshire-swash/400.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: `${SITE.name} Hub`, template: `%s · ${SITE.name}` },
  description: `${SITE.fullName}: events, tickets and memories.`,
};

export const viewport: Viewport = {
  themeColor: "#ae4547",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body className="min-h-dvh antialiased">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-muted print:hidden">
          © {new Date().getFullYear()} {SITE.fullName}
        </footer>
      </body>
    </html>
  );
}
