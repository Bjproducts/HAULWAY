import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/", "/privacy", "/terms", "/sms-terms"], disallow: ["/api/", "/driver", "/driver/"] },
    sitemap: "https://haulway.ca/sitemap.xml",
    host: "https://haulway.ca",
  };
}
