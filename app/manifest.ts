import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SPY Prophet",
    short_name: "SPY Prophet",
    description:
      "A decision workspace for serious retail traders. Read the day before the day reads you.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    // Marketing surface lives on cream; in-app dashboard is the same
    // canvas. Single value here so installed PWA matches the visual
    // language at launch.
    background_color: "#FAF8F3",
    theme_color: "#FAF8F3",
    icons: [
      // 32 + 180 served by app/icon.tsx + app/apple-icon.tsx routes.
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      // 192 + 512 PWA sizes — Next renders the same icon.tsx response,
      // sized via the URL fragment so installed app shortcuts get
      // the right artwork. Until a dedicated 192/512 icon route lands
      // we re-serve the existing icon (the icon route is generated
      // per request size — the 32×32 is just the default size; PWA
      // installers will accept any matching MIME).
      { src: "/icon?size=192", sizes: "192x192", type: "image/png" },
      { src: "/icon?size=512", sizes: "512x512", type: "image/png" },
    ],
  };
}
