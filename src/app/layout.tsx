import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/berkshire-swash/400.css";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { MotionProvider } from "@/components/motion";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: `${SITE.name} Hub`, template: `%s · ${SITE.name}` },
  description: `${SITE.fullName}: events, tickets and memories.`,
};

export const viewport: Viewport = {
  themeColor: "#faf9f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-HK" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <MotionProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:py-12">{children}</main>
          <footer className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 pb-10 pt-6 text-xs text-muted print:hidden">
            <span>© {new Date().getFullYear()} {SITE.fullName}</span>
            <span className="font-brand text-sm text-ink/40">{SITE.name}</span>
          </footer>
        </MotionProvider>
      </body>
    </html>
  );
}
