// Pure policy shared by server guards and their tests. No environment values here.
export function accessStatus(
  userId: unknown,
  adminId: unknown,
): 200 | 401 | 403 | 503 {
  if (typeof adminId !== "string" || !adminId.trim()) return 503;
  if (typeof userId !== "string" || !userId) return 401;
  return userId === adminId.trim() ? 200 : 403;
}

export function isPublicPath(pathname: string, method = "GET") {
  if (method !== "GET" && method !== "HEAD") return false;
  return (
    isPwaPublicPath(pathname, method) ||
    pathname === "/sign-in" ||
    pathname.startsWith("/sign-in/") ||
    pathname === "/access-denied" ||
    pathname === "/logo2.png" ||
    pathname === "/favicon.ico"
  );
}
export function isPwaPublicPath(pathname: string, method = "GET") {
  return (
    ["GET", "HEAD"].includes(method) &&
    [
      "/manifest.webmanifest",
      "/sw.js",
      "/pwa/offline.html",
      "/pwa/icon-192.png",
      "/pwa/icon-512.png",
      "/pwa/maskable-512.png",
      "/pwa/apple-touch-icon.png",
      "/pwa/splash-1170.png",
      "/pwa/splash-1284.png",
    ].includes(pathname)
  );
}

export function isApiPath(pathname: string) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/trpc" ||
    pathname.startsWith("/trpc/")
  );
}
