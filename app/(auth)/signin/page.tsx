import type { Metadata } from "next";
import Link from "next/link";

import { AuthDivider, AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

import { resolveNotice } from "../notices";
import { signInWithGoogle, signInWithPassword } from "../actions";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = resolveNotice(params.error);
  const message = resolveNotice(params.message);

  // Carried through to signup so someone who lands here from a job post, then
  // realises they have no account, still ends up back at that job.
  const signUpHref = params.next
    ? `/signup?next=${encodeURIComponent(params.next)}`
    : "/signup";

  return (
    <AuthLayout
      title="Sign in"
      intro={
        params.next ? (
          <>You&apos;ll go straight back to what you were doing.</>
        ) : (
          <>Welcome back.</>
        )
      }
      footer={
        <>
          New here?{" "}
          <Link href={signUpHref} className="font-medium text-foreground underline">
            Create an account
          </Link>{" "}
          — it takes an email and nothing else.
        </>
      }
    >
      {error ? (
        <Notice tone="error" className="mb-5">
          {error}
        </Notice>
      ) : null}
      {message ? (
        <Notice tone="info" className="mb-5">
          {message}
        </Notice>
      ) : null}

      <form action={signInWithPassword} className="space-y-4">
        {params.next ? <input type="hidden" name="next" value={params.next} /> : null}

        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" name="email" autoComplete="email" required autoFocus />
        </Field>

        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </Field>

        <Button type="submit" size="lg" className="w-full">
          Sign in
        </Button>

        <AuthDivider />

        <Button
          type="submit"
          formAction={signInWithGoogle}
          formNoValidate
          variant="outline"
          size="lg"
          className="w-full"
        >
          Continue with Google
        </Button>
      </form>
    </AuthLayout>
  );
}
