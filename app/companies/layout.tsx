import { PublicChrome } from "@/components/shell/public-chrome";

/** SEO-critical public surface: the same chrome a marketing page gets. */
export default function CompaniesLayout({ children }: { children: React.ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
