import type { MetadataRoute } from "next";

// Manifest de PWA: permite «Añadir a la pantalla de inicio» en el móvil.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lucilingo",
    short_name: "Lucilingo",
    description: "Repaso espaciado de tus errores reales de inglés.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f3ea",
    theme_color: "#f7f3ea",
    icons: [
      { src: "/lucy.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/lucy.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
