"use client";

import { useEffect, useState } from "react";
import type { User } from "@/lib/types";

type Mode = "login" | "register";

export function AuthMenu() {
  const [user, setUser] = useState<User | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  if (user) {
    return (
      <div className="flex items-center gap-3 text-xs">
        <span className="text-muted">{user.displayName ?? user.email}</span>
        <button type="button" onClick={signOut} className="text-muted hover:text-accent">
          Sign out
        </button>
      </div>
    );
  }

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
          onClose={() => setOpen(false)}
          onSignedIn={(u) => {
            setUser(u);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function AuthForm({
  onClose,
  onSignedIn,
}: {
  onClose: () => void;
  onSignedIn: (user: User) => void;
}) {
  const [mode, setMode] = useState<Mode>("login");
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
      className="absolute right-0 z-20 mt-3 w-72 space-y-3 rounded-2xl border border-line bg-panel p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs tracking-widest text-muted uppercase">
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
        minLength={8}
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />

      {error && <p className="text-xs text-red-400">{error}</p>}

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
