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

// 800 carries display-1. Without it the browser synthesises a fake bold with
// distorted stems, so the largest type in the system renders wrong everywhere.
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  weight: ["500", "600", "700", "800"],
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
        {/* Every navigation here is a full page load, so without this a
            keyboard user re-tabs the header on every single page — and on
            /jobs, the entire filter form before reaching a result. */}
        <a
          href="#main"
          className="sr-only rounded-[2px] focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-background focus:outline-2 focus:outline-offset-2 focus:outline-ring"
        >
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
