import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header/Header";
import "./globals.css";
import "@/components/Pwa/global.css";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkIsConfigured } from "@/lib/auth/config";
import Pwa, { PrivateSessionBoundary } from "@/components/Pwa/Pwa";
import type { Viewport } from "next";

// Authorization must be evaluated for every request, never at build time.
export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "LOGIFA",
  description: "Espace privé de devis et factures multi-émetteurs",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "LOGIFA", statusBarStyle: "default" },
  icons: {
    apple: "/pwa/apple-touch-icon.png",
    other: [
      {
        rel: "apple-touch-startup-image",
        url: "/pwa/splash-1170.png",
        media:
          "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
      {
        rel: "apple-touch-startup-image",
        url: "/pwa/splash-1284.png",
        media:
          "(device-width: 428px) and (device-height: 926px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)",
      },
    ],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#173d32",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {clerkIsConfigured() ? (
          <ClerkProvider
            signInUrl="/sign-in"
            signUpUrl="/sign-in"
            signInForceRedirectUrl="/"
            signUpForceRedirectUrl="/"
            afterSignOutUrl="/sign-in"
          >
            <Pwa />
            <PrivateSessionBoundary>
              <Header />
              {children}
            </PrivateSessionBoundary>
          </ClerkProvider>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
