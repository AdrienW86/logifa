import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import {
  accessStatus,
  isApiPath,
  isPublicPath,
  isPwaPublicPath,
} from "./lib/auth/policy.ts";
import { adminUserId, clerkIsConfigured } from "./lib/auth/config";

function deny(request: NextRequest, status: 401 | 403 | 503) {
  const headers = { "Cache-Control": "private, no-store" };
  if (
    isApiPath(request.nextUrl.pathname) ||
    status === 503 ||
    !["GET", "HEAD"].includes(request.method)
  ) {
    return NextResponse.json(
      { error: "Accès non autorisé" },
      { status, headers },
    );
  }
  // Fixed relative targets: query parameters never control the destination.
  const target = status === 401 ? "/sign-in" : "/access-denied";
  const response = NextResponse.redirect(new URL(target, request.url));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

const authenticate = clerkMiddleware(
  async (auth, request) => {
    if (isPublicPath(request.nextUrl.pathname, request.method))
      return NextResponse.next();
    const session = await auth({ acceptsToken: "session_token" });
    const userId = session.isAuthenticated === false ? null : session.userId;
    const status = accessStatus(userId, adminUserId());
    if (status !== 200) return deny(request, status);
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  },
  {
    signInUrl: "/sign-in",
    signUpUrl: "/sign-in",
    frontendApiProxy: { enabled: false },
  },
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isPwaPublicPath(request.nextUrl.pathname, request.method))
    return NextResponse.next();
  // Do not invoke Clerk's keyless flow or expose the app when configuration is missing.
  if (!clerkIsConfigured() || !adminUserId()) {
    return isPublicPath(request.nextUrl.pathname, request.method)
      ? NextResponse.next()
      : deny(request, 503);
  }
  return authenticate(request, event);
}

export const config = {
  // No extension-based exemption: future .json APIs and public files stay protected.
  matcher: [
    "/((?!_next/static/|_next/image(?:/|$)|_next/webpack-hmr(?:/|$)).*)",
  ],
};
