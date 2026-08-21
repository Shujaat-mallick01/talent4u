import { PublicChrome } from "@/components/shell/public-chrome";

/** Landing, pricing and the public removals page. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
