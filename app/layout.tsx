import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

import { SiteFooter } from "@/components/shell/site-footer";
import { SiteHeader } from "@/components/shell/site-header";
import { cn } from "@/lib/utils";

// Brand type system (BRANDGUIDE): Archivo display, Inter interface,
// IBM Plex Mono data. The mono face keeps the --font-geist-mono variable
// name so the existing --font-mono theme mapping continues to resolve.
const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: {
    default: "Talent4u — hiring without the commission",
    template: "%s · Talent4u",
  },
  description:
    "A commission-free hiring marketplace. Recruiters post jobs, freelancers apply, and we take 0% of anyone's earnings.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        inter.variable,
        archivo.variable,
        plexMono.variable,
        "font-sans",
      )}
    >
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
