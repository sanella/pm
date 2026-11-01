import { useState, type FormEvent } from "react";
import { login, register } from "@/lib/api";

type LoginFormProps = {
  onLogin: (username: string) => void;
};

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"signIn" | "register">("signIn");
  const registering = mode === "register";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      if (registering) {
        const problem = await register(username.trim(), password);
        if (!problem) {
          onLogin(username.trim());
          return;
        }
        setError(problem);
      } else {
        const signedIn = await login(username.trim(), password);
        if (signedIn) {
          onLogin(signedIn);
          return;
        }
        setError("Invalid username or password.");
      }
    } catch {
      setError("Cannot reach the server. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-[32px] border border-[var(--stroke)] bg-white p-8 shadow-[var(--shadow)]"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
            Kanban Studio
          </p>
          <h1 className="mt-3 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            {registering ? "Create account" : "Sign in"}
          </h1>
          {registering && (
            <p className="mt-3 text-sm leading-6 text-[var(--gray-text)]">
              3-32 letters, digits, dots, dashes or underscores; a password of at least 8
              characters.
            </p>
          )}
        </div>
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Username"
          aria-label="Username"
          autoComplete="username"
          className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoComplete={registering ? "new-password" : "current-password"}
          className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          required
        />
        {error && (
          <p role="alert" className="text-sm font-semibold text-[var(--secondary-purple)]">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {submitting ? "Please wait..." : registering ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(registering ? "signIn" : "register");
            setError("");
          }}
          className="w-full text-xs font-semibold text-[var(--primary-blue)] transition hover:text-[var(--navy-dark)]"
        >
          {registering ? "I already have an account" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
};
