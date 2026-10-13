import { logifaIcon } from "@/lib/pwa/icon-response";

export const runtime = "nodejs";
export function GET() {
  return logifaIcon(192, false);
}
