import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffefa" },
    { media: "(prefers-color-scheme: dark)", color: "#0b2c24" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL("https://haulway.ca"),
    applicationName: "HAULWAY",
    title: "HAULWAY — Junk removal & small moves",
    description: "Direct junk removal and small moving service for Haulway customers across Edmonton.",
    alternates: { canonical: "/" },
    category: "local services",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Haulway", statusBarStyle: "default" },
    openGraph: { type: "website", url: "/", siteName: "HAULWAY", locale: "en_CA", title: "Haulway", description: "Junk gone. Small moves made simple.", images: [{ url: "/og.png", width: 1672, height: 941, alt: "Haulway" }] },
    twitter: { card: "summary_large_image", title: "Haulway", description: "Junk gone. Small moves made simple.", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
