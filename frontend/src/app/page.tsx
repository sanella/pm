"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser, logout } from "@/lib/api";

export default function Home() {
  // undefined while checking the session, null when signed out.
  const [user, setUser] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  if (user === undefined) {
    return null;
  }
  if (user === null) {
    return <LoginForm onLogin={setUser} />;
  }
  return <KanbanBoard onLogout={handleLogout} />;
}
