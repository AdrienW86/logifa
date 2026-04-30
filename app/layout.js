import { ClerkProvider } from '@clerk/nextjs' // <-- Ajout de l'import
import { frFR } from '@clerk/localizations'
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Logifa - Gestion de devis et factures", // <-- Un titre plus sympa !
  description: "Gérez vos clients et vos factures en toute simplicité",
};

export default function RootLayout({ children }) {
  return (
    <ClerkProvider localization={frFR}>
      <html lang="fr" className={`${geistSans.variable} ${geistMono.variable}`}>
        <body className="antialiased">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}