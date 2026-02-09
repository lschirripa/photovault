import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PhotoVault",
    short_name: "PhotoVault",
    description: "Private group-based photo and video sharing",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192x192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    categories: ["photo", "social"],
    screenshots: [],
    shortcuts: [
      {
        name: "My Groups",
        url: "/groups",
        description: "View your photo groups",
      },
      {
        name: "Upload",
        url: "/upload",
        description: "Upload new photos or videos",
      },
    ],
  };
}
