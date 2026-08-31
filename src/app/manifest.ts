import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "KamJey Loan Dashboard",
    short_name: "KamJey",
    description: "A calm, personal way to manage loans, borrowers, and payments.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f7f8fa",
    theme_color: "#294f69",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/kamjey-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/kamjey-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
