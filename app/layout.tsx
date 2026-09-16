import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const sans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

const title = "CW Passport — Construction Waste Intelligence Platform";
const description = "Trusted digital infrastructure for material identity, traceability, cross-border data and circular construction trade.";

export const metadata: Metadata = { title, description };

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return <html lang="en"><head><meta property="og:title" content={title} /><meta property="og:description" content={description} /><meta property="og:type" content="website" /><meta property="og:image" content={image} /><meta name="twitter:card" content="summary_large_image" /><meta name="twitter:title" content={title} /><meta name="twitter:description" content={description} /><meta name="twitter:image" content={image} /></head><body className={`${sans.variable} ${mono.variable}`}>{children}</body></html>;
}
