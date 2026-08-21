import Link from "next/link";

import { resolveNotice } from "../notices";
import { signInWithGoogle, signInWithPassword } from "../actions";

// Unstyled by design — Phase 1 owns all UI. This page only proves the flow.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const params = await searchParams;
  const error = resolveNotice(params.error);
  const message = resolveNotice(params.message);

  return (
    <main id="main">
      <h1>Sign in</h1>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p>{message}</p> : null}

      <form action={signInWithPassword}>
        {params.next ? <input type="hidden" name="next" value={params.next} /> : null}
        <label>
          Email <input type="email" name="email" autoComplete="email" />
        </label>
        <br />
        <label>
          Password <input type="password" name="password" autoComplete="current-password" />
        </label>
        <br />
        <button type="submit">Sign in</button>
        <button formAction={signInWithGoogle} formNoValidate>
          Continue with Google
        </button>
      </form>

      <p>
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </main>
  );
}
