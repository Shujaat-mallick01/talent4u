import type { Metadata } from "next";
import Link from "next/link";

import { AuthDivider, AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

import { resolveNotice } from "../notices";
import { signInWithGoogle, signUpWithPassword } from "../actions";

export const metadata: Metadata = {
  title: "Create an account",
  robots: { index: true, follow: true },
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = resolveNotice(params.error);
  const message = resolveNotice(params.message);

  const signInHref = params.next ? `/signin?next=${encodeURIComponent(params.next)}` : "/signin";

  return (
    <AuthLayout
      title="Create an account"
      intro={
        <>Free, no card. Browsing and applying costs nothing. We ask what you are here for next.</>
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href={signInHref} className="font-medium text-foreground underline">
            Sign in
          </Link>
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

      <form action={signUpWithPassword} className="space-y-5">
        {params.next ? <input type="hidden" name="next" value={params.next} /> : null}

        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" name="email" autoComplete="email" required />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          hint="At least 8 characters."
        >
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
            aria-describedby="password-hint"
          />
        </Field>

        <Button type="submit" size="lg" className="w-full">
          Create account
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

        <p className="text-[13px] leading-[18px] text-muted-foreground">
          Signing up with Google takes you to the same role question — we ask it once, because it
          decides which product you get.
        </p>
      </form>
    </AuthLayout>
  );
}
