import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth/session";

import { resolveNotice } from "../notices";
import { setNewPassword } from "../actions";

export const metadata: Metadata = {
  title: "Choose a new password",
  robots: { index: false, follow: false },
};

/**
 * Reached only through the emailed recovery link, which the shared callback
 * exchanges into a session before routing here. No session means the link
 * expired, was already used, or someone typed the URL — all of which lead back
 * to requesting a fresh one rather than to a form that cannot work.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/forgot-password?error=reset_link_expired");

  const { error: errorCode } = await searchParams;
  const error = resolveNotice(errorCode);

  return (
    <AuthLayout
      title="Choose a new password"
      intro={
        <>
          Signing in as <span className="font-medium text-foreground">{session.email}</span>. This
          replaces your old password everywhere.
        </>
      }
    >
      {error ? (
        <Notice tone="error" className="mb-5">
          {error}
        </Notice>
      ) : null}

      <form action={setNewPassword} className="space-y-4">
        <Field label="New password" htmlFor="password" hint="At least 8 characters.">
          <Input
            id="password"
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
            aria-describedby="password-hint"
          />
        </Field>
        <Field label="Type it again" htmlFor="confirm">
          <Input
            id="confirm"
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </Field>
        <Button type="submit" size="lg" className="w-full">
          Change password
        </Button>
      </form>
    </AuthLayout>
  );
}
