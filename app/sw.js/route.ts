import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
export const dynamic = "force-dynamic";
export async function GET() {
  const source = await readFile(
    path.join(process.cwd(), "lib/pwa/worker.js"),
    "utf8",
  );
  const directory =
    process.env.LOGIFA_LOCAL_RECIPE_BUILD === "true"
      ? "tmp/next-recipe-build"
      : ".next";
  let deployment = "development";
  try {
    deployment = await readFile(
      path.join(process.cwd(), directory, "BUILD_ID"),
      "utf8",
    );
  } catch {
    /* next dev */
  }
  const version = createHash("sha256")
    .update(source + deployment)
    .digest("hex")
    .slice(0, 20);
  return new Response(`const VERSION=${JSON.stringify(version)};\n${source}`, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "Service-Worker-Allowed": "/",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
