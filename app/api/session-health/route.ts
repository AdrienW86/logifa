import { auth, currentUser } from "@clerk/nextjs/server";
import { requireAdmin, AdminAccessError } from "@/lib/auth/require-admin";
import { privateJson, errorResponse } from "@/lib/workspace/http";

export const dynamic = "force-dynamic";

// Private operator diagnostic. No identity, cookie or token is returned.
export async function GET() {
  try {
    const administrator = await requireAdmin();
    const session = await auth({ acceptsToken: "session_token" });
    const user = await currentUser();
    if (!user || user.id !== administrator || session.userId !== administrator)
      throw new AdminAccessError(403);
    return privateJson({
      authenticated: session.isAuthenticated === true,
      current_user_verified: true,
      native_supabase_role: session.sessionClaims?.role === "authenticated",
      persistence_enabled: process.env.LOGIFA_PERSISTENCE_ENABLED === "true",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
