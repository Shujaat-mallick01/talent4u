import { PublicChrome } from "@/components/shell/public-chrome";

/**
 * Sign in, sign up and onboarding keep the public chrome: someone half way
 * through signing up still needs a way back to browse jobs, and the header is
 * the only thing on these pages that says whose site this is.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <PublicChrome>{children}</PublicChrome>;
}
