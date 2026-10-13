import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "LOGIFA",
    short_name: "LOGIFA",
    lang: "fr",
    start_url: "/",
    scope: "/",
    description: "Votre espace privé de devis et factures multi-émetteurs.",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#173d32",
    icons: [
      {
        src: "/pwa/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
