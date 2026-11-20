import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// The site's old address. Old links (WhatsApp, Instagram, calendar invites)
// still point here, so it permanently redirects to NEXT_PUBLIC_SITE_URL.
// Only this exact host: Vercel's per-deployment preview URLs are left alone.
const OLD_HOST = "sass-hub.vercel.app";

function oldAddressRedirect(request: NextRequest) {
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (!site || request.nextUrl.hostname !== OLD_HOST) return null;
  const target = new URL(site);
  if (target.hostname === OLD_HOST) return null;
  target.pathname = request.nextUrl.pathname;
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target, 308);
}

// Refreshes the Supabase session cookie on every request.
export async function proxy(request: NextRequest) {
  const moved = oldAddressRedirect(request);
  if (moved) return moved;

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers ?? {}).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4)$).*)",
  ],
};
