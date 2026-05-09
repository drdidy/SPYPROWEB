import type { MetadataRoute } from "next";

const SITE_URL = "https://www.spyprophet.app";

// Marketing-only routes — the in-app surfaces (/dashboard, /spy, etc.)
// are blocked in robots.ts during closed beta and don't belong in the
// public sitemap.
const ROUTES: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/press", changeFrequency: "monthly", priority: 0.3 },
  { path: "/careers", changeFrequency: "monthly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/disclosures", changeFrequency: "yearly", priority: 0.3 },
  { path: "/risk", changeFrequency: "yearly", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
