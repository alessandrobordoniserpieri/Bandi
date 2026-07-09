import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // API routes handle their own auth (cron routes check CRON_SECRET; the rest
  // call supabase.auth.getUser() themselves) and must return JSON, not an
  // HTML redirect — a fetch() client can't follow a 307 to /login the way a
  // browser navigation can, and Vercel Cron never carries a session cookie at
  // all, so this branch previously made every cron invocation an unconditional
  // 401-via-redirect regardless of CRON_SECRET.
  if (path.startsWith("/api/")) return response;

  // Public, and redirected to "/" once already signed in — same as login/signup.
  const isPublicOnlyRoute = path === "/login" || path === "/signup" || path === "/recupera-password";
  // Reached via the emailed recovery link, which itself establishes a session:
  // must stay reachable both signed-out and signed-in, so it's excluded from
  // both redirect branches below.
  const isAlwaysAccessibleRoute = path === "/aggiorna-password";

  // Unauthenticated user on a protected route → /login
  if (!user && !isPublicOnlyRoute && !isAlwaysAccessibleRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Authenticated user on a public-only route → home
  if (user && isPublicOnlyRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}
