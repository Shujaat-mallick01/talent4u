import Link from "next/link";

import { resolveNotice } from "../notices";
import { signInWithGoogle, signUpWithPassword } from "../actions";

// Unstyled by design — Phase 1 owns all UI. This page only proves the flow.
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;
  const error = resolveNotice(params.error);
  const message = resolveNotice(params.message);

  return (
    <main id="main">
      <h1>Create your account</h1>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <form action={signUpWithPassword}>
        <fieldset>
          <legend>I am a…</legend>
          <label>
            <input type="radio" name="role" value="FREELANCER" required /> Freelancer — I want to
            find work
          </label>
          <br />
          <label>
            <input type="radio" name="role" value="RECRUITER" required /> Recruiter — I want to
            hire
          </label>
        </fieldset>

        <label>
          Email <input type="email" name="email" autoComplete="email" />
        </label>
        <br />
        <label>
          Password <input type="password" name="password" autoComplete="new-password" />
        </label>
        <br />

        <button type="submit">Sign up</button>
        <button formAction={signInWithGoogle} formNoValidate>
          Continue with Google
        </button>
      </form>

      <p>
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </main>
  );
}
