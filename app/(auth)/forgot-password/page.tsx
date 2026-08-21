import type { Metadata } from "next";
import Link from "next/link";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

import { resolveNotice } from "../notices";
import { requestPasswordReset } from "../actions";

export const metadata: Metadata = {
  title: "Reset your password",
  robots: { index: false, follow: true },
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const error = resolveNotice(params.error);
  const message = resolveNotice(params.message);

  return (
    <AuthLayout
      title="Reset your password"
      intro={<>We&apos;ll email you a link. It works once and expires in an hour.</>}
      footer={
        <>
          Remembered it?{" "}
          <Link href="/signin" className="font-medium text-foreground underline">
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
        <Notice tone="success" className="mb-5">
          {message}
        </Notice>
      ) : null}

      <form action={requestPasswordReset} className="space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" type="email" name="email" autoComplete="email" required autoFocus />
        </Field>
        <Button type="submit" size="lg" className="w-full">
          Send the link
        </Button>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          We give the same answer whether or not the address has an account — otherwise this form
          would tell anyone who asks which people are on Talent4u.
        </p>
      </form>
    </AuthLayout>
  );
}
