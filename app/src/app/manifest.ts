import type { MetadataRoute } from "next";

// PWA manifest (ADR-006): installable on the home screen, opens standalone.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Combacia",
    short_name: "Bandi",
    description: "Trova i bandi pubblici e privati più compatibili con il tuo ente.",
    lang: "it",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#2563eb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
