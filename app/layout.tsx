import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
    title: "Haulway — Junk removal & small moves",
    description: "Direct junk removal and small moving service for Haulway customers across Edmonton.",
    openGraph: { title: "Haulway", description: "Junk gone. Small moves made simple.", images: [{ url: "/og.png", width: 1672, height: 941, alt: "Haulway" }] },
    twitter: { card: "summary_large_image", title: "Haulway", description: "Junk gone. Small moves made simple.", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
