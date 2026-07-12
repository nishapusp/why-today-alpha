// app/robots.ts — served at https://whytoday.in/robots.txt
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/"] }],
    sitemap: "https://whytoday.in/sitemap.xml",
  };
}
