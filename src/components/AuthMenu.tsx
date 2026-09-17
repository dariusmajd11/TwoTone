"use client";

import { useState } from "react";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE } from "@/lib/password";
import type { User } from "@/lib/types";

/** Which side of the form is showing. Exported for callers that open it. */
export type AuthMode = "login" | "register";

/**
 * The way in, and only the way in.
 *
 * Signing *out* deliberately lives in the three-bar menu instead of here, next
 * to the account it ends. That leaves this with one job, so the page renders it
 * only while signed out — an account's header has a house and a menu and no
 * third control competing with them.
 *
 * Controlled by the page rather than owning the session itself, because more
 * than this button depends on who is signed in.
 */
export function AuthMenu({ onUser }: { onUser: (user: User) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full border border-line px-4 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent"
      >
        Sign in
      </button>
      {open && (
        <AuthForm
          className="absolute right-0 z-20 mt-3 w-72"
          onClose={() => setOpen(false)}
          onSignedIn={(u) => {
            onUser(u);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/**
 * Email, password, and the switch between signing in and signing up.
 *
 * Exported because it has two homes: a dropdown under the header button, and
 * the middle of the welcome screen. Only the placement differs, so only the
 * placement is passed in — the form itself brings no position of its own, and
 * `initialMode` lets the welcome screen's two buttons open the same form on
 * the side each of them named.
 */
export function AuthForm({
  initialMode = "login",
  className = "",
  onClose,
  onSignedIn,
}: {
  initialMode?: AuthMode;
  className?: string;
  onClose: () => void;
  onSignedIn: (user: User) => void;
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error((await res.json()).error);

      const me = await (await fetch("/api/auth/me")).json();
      onSignedIn(me.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className={`slab-menu space-y-3 rounded-2xl p-4 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="archive-label">
          {mode === "login" ? "Sign in" : "Create account"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-accent"
        >
          Close
        </button>
      </div>

      <input
        type="email"
        required
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <input
        type="password"
        required
        minLength={mode === "register" ? PASSWORD_MIN_LENGTH : undefined}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {/* Stating the rule up front beats making someone discover it one
          rejected submission at a time. Existing accounts predate the rule,
          so only registration shows it. */}
      {mode === "register" && !error && (
        <p className="text-xs text-muted">{PASSWORD_RULE}</p>
      )}

      {/* red-400 was tuned for the dark theme and washes out to roughly 2:1 on
          the pale panel; red-700 is the same hue at a weight that survives it. */}
      {error && <p className="text-xs text-red-700">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg border border-accent px-3 py-2 text-sm text-accent transition hover:bg-accent hover:text-background disabled:opacity-50"
      >
        {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="w-full text-xs text-muted hover:text-accent"
      >
        {mode === "login"
          ? "Need an account? Create one"
          : "Already have an account? Sign in"}
      </button>
    </form>
  );
}
