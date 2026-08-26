import { AdaptiveChrome } from "@/components/shell/adaptive-chrome";

/**
 * SEO-critical public surface. The page is identical for everyone; the chrome
 * around it is the marketing header for a visitor and the product rail for a
 * signed-in account, so browsing does not eject you from the product.
 */
export default function FreelancersLayout({ children }: { children: React.ReactNode }) {
  return <AdaptiveChrome>{children}</AdaptiveChrome>;
}
