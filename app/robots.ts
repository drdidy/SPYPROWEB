import type { MetadataRoute } from "next";

const SITE_URL = "https://www.spyprophet.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // The dashboard + per-symbol channel surfaces are part of the
        // closed beta and aren't useful in search results until we
        // open them up. Disallow indexing while keeping them
        // crawlable for owners and authed sessions.
        disallow: ["/api/", "/dashboard", "/spy", "/spx", "/replay", "/foresight", "/options", "/log"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
