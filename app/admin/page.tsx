import { requireRole } from "@/lib/auth/guards";

import { signOut } from "../(auth)/actions";

export default async function AdminPage() {
  // ADMIN accounts exist only via seed or manual SQL — no signup path
  // creates one. Guarded here, not just in the proxy.
  const { user } = await requireRole("ADMIN");

  return (
    <main>
      <h1>Admin</h1>
      <p>Signed in as {user.email}.</p>
      <p>The moderation queue ships in Phase 4.</p>
      <form action={signOut}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
