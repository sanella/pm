"use client";

import { useEffect, useState } from "react";
import { Workspace } from "@/components/Workspace";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser, logout } from "@/lib/api";

export default function Home() {
  // undefined while checking the session, null when signed out.
  const [user, setUser] = useState<string | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then(setUser)
      .catch(() => setUnreachable(true));
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  if (unreachable) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p role="alert" className="font-display text-xl font-semibold text-[var(--navy-dark)]">
          Cannot reach the server.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Retry
        </button>
      </main>
    );
  }
  if (user === undefined) {
    return null;
  }
  if (user === null) {
    return <LoginForm onLogin={setUser} />;
  }
  return (
    <Workspace username={user} onLogout={handleLogout} onAccountDeleted={() => setUser(null)} />
  );
}
