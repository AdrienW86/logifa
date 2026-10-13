import 'server-only';

export function clerkIsConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    process.env.CLERK_SECRET_KEY?.trim());
}

export function adminUserId() {
  return process.env.LOGIFA_ADMIN_CLERK_USER_ID?.trim() || '';
}
