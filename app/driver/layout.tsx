import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Owner Portal | HAULWAY",
  robots: { index: false, follow: false, nocache: true },
};

export default function DriverLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
