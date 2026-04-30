import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 1. Définir les routes publiques avec une syntaxe plus large
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/auth/reset-password(.*)',
  '/auth/reset-password' // On l'ajoute explicitement sans le (.*) au cas où
]);

export default clerkMiddleware(async (auth, req) => {
  const session = await auth();

  // 2. Si l'utilisateur n'est pas connecté et essaie d'aller sur une route privée
  if (!session.userId && !isPublicRoute(req)) {
    // On construit l'URL de redirection vers le sign-in
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('redirect_url', req.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};