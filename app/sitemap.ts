import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-08-21T00:00:00-06:00");
  return [
    { url: "https://haulway.ca/", lastModified, changeFrequency: "weekly", priority: 1 },
    { url: "https://haulway.ca/privacy", lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: "https://haulway.ca/terms", lastModified, changeFrequency: "monthly", priority: 0.4 },
    { url: "https://haulway.ca/sms-terms", lastModified, changeFrequency: "monthly", priority: 0.4 },
  ];
}
