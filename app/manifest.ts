import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HAULWAY — Junk removal & small moves",
    short_name: "HAULWAY",
    description: "Book and track junk removal and small moves in Edmonton and area.",
    start_url: "/",
    display: "standalone",
    background_color: "#fffefa",
    theme_color: "#14453a",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
