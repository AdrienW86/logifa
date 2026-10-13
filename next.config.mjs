/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { "/sw.js": ["./lib/pwa/worker.js"] },
  async headers() {
    return [
      {
        source: "/pwa/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  // Verification builds do not interrupt the active browser session.
  distDir:
    process.env.LOGIFA_LOCAL_RECIPE_BUILD === "true"
      ? "tmp/next-recipe-build"
      : ".next",
};

export default nextConfig;
