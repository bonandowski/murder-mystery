import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cena con Delitto",
    short_name: "Delitto",
    description: "Cene con delitto dal vivo, con il telefono come regista.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e0c0b",
    theme_color: "#0e0c0b",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
