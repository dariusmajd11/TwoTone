"use client";

import { useEffect, useRef, useState } from "react";
import type { Wishlist } from "@/lib/types";
import { WISHLIST_NAME_MAX } from "@/lib/wishlist-limits";

/**
 * Puts the piece you are looking at into a wishlist, or takes it back out,
 * from the card itself.
 *
 * The WishList tab can already do this, but only by finding the piece again in
 * a list of everything you have ever looked up. The moment you know you want
 * something is the moment you are reading about it, so the control belongs
 * here — on the answer, not two screens away from it.
 *
 * Each row toggles rather than only adding. Saving to the wrong list is the
 * likeliest mistake this panel invites, and the panel that made it is the
 * obvious place to look for the undo — being sent to another screen to take
 * back something you did here would be the tab problem all over again.
 *
 * Rendered only for signed-in wearers, and not because of the 401: a search
 * made signed out is never written to history, so its `recordId` would point at
 * a record that does not exist and the entry would resolve to nothing in the
 * panel. There is genuinely nothing to save, so there is no button.
 */
export function WishlistAdd({ recordId }: { recordId: string }) {
  const [open, setOpen] = useState(false);
  /** Null until the first open — see `toggle`. */
  const [lists, setLists] = useState<Wishlist[] | null>(null);
  const [naming, setNaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Pointerdown rather than click, matching the header menu: a panel that
    // survives until mouseup feels stuck when you press the page behind it.
    const onPointerDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    // Escape backs out one layer at a time, so a half-typed list name is not
    // also the thing that closes the panel holding it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (naming) setNaming(false);
      else setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, naming]);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/wishlists");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load your lists.");
      setLists(data.wishlists as Wishlist[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    setNaming(false);
    setError(null);
    // Fetched on first open rather than on mount, so a page of results does not
    // cost a request per card for a panel nobody may open. Only once after
    // that: every mutation below answers with the whole set, and leaving the
    // card unmounts this, so there is no stale copy to go back to.
    if (next && lists === null) load();
  }

  /**
   * Every mutation answers with the full set of lists, so the new state is
   * never computed here and client and server cannot drift.
   */
  async function send(url: string, init: RequestInit): Promise<Wishlist[] | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update the list.");
      const next = data.wishlists as Wishlist[];
      setLists(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const postJson = (url: string, body: unknown) =>
    send(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  const addTo = (id: string) =>
    postJson(`/api/wishlists/${id}/items`, { recordId });

  /**
   * The id travels in the query string because the route takes it there — a
   * `DELETE` with a body is unevenly supported and the server reads
   * `searchParams`.
   */
  const removeFrom = (id: string) =>
    send(
      `/api/wishlists/${id}/items?recordId=${encodeURIComponent(recordId)}`,
      { method: "DELETE" },
    );

  async function createAndAdd(name: string) {
    const before = new Set((lists ?? []).map((list) => list.id));
    const next = await postJson("/api/wishlists", { name });
    // On failure the form stays up with the name still in it — a rejected name
    // is the moment you least want to retype it.
    if (!next) return;

    // A list made from here exists to hold this piece. Creating it empty would
    // make one intention into two clicks, and leave you looking at a panel that
    // did half of what you asked.
    const created = next.find((list) => !before.has(list.id));
    if (created) await addTo(created.id);
    setNaming(false);
  }

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Add to a WishList"
        className="group relative flex size-9 items-center justify-center rounded-full border border-line text-muted transition hover:border-accent hover:text-accent"
      >
        <PlusMark />

        {/* Written rather than left to the `title` attribute: the native
            tooltip takes about a second to appear, cannot be styled to match
            anything, and never shows for a keyboard user at all. Hidden from
            assistive tech because the button's `aria-label` already says this —
            announcing both would say it twice. Suppressed while the panel is
            open, where it would ask a question that is already answered. */}
        {!open && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-full right-0 z-20 mt-2 translate-y-1 rounded-lg border border-line bg-background px-2.5 py-1.5 text-[11px] whitespace-nowrap text-muted opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
          >
            Add to WishList?
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="slab-menu absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl"
        >
          <p className="archive-label border-b border-line px-4 py-2.5">
            Add to WishList
          </p>

          {error && (
            <p className="border-b border-line px-4 py-2.5 text-xs text-red-700">
              {error}
            </p>
          )}

          {lists === null ? (
            <p className="px-4 py-3 text-xs text-muted">Loading your lists…</p>
          ) : (
            <>
              {lists.length === 0 ? (
                <p className="px-4 py-3 text-xs leading-relaxed text-muted">
                  No lists yet. Name one and this piece goes straight into it.
                </p>
              ) : (
                // Capped and scrollable: twenty lists is the ceiling, and
                // twenty rows would run off the bottom of the screen.
                <div className="max-h-56 overflow-y-auto">
                  {lists.map((list) => {
                    const saved = list.entries.some(
                      (entry) => entry.recordId === recordId,
                    );
                    return (
                      <button
                        key={list.id}
                        type="button"
                        /**
                         * A checkbox rather than a plain menu item, because
                         * this row is a state and not an action — it reports
                         * whether the piece is in the list and flips it. That
                         * is what `aria-checked` says, and it saves the label
                         * from having to be read out as "Saved" separately.
                         */
                        role="menuitemcheckbox"
                        aria-checked={saved}
                        aria-label={
                          saved
                            ? `Remove from ${list.name}`
                            : `Add to ${list.name}`
                        }
                        disabled={busy}
                        onClick={() =>
                          saved ? removeFrom(list.id) : addTo(list.id)
                        }
                        className="group/row flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition hover:bg-foreground/5 disabled:opacity-50"
                      >
                        <CheckMark on={saved} />
                        <span className="min-w-0 flex-1 truncate">
                          {list.name}
                        </span>
                        {/* The word only appears under the cursor, so a panel
                            at rest reads as a list of states rather than a
                            column of things that might delete something. The
                            tick carries the meaning when there is no pointer
                            to hover with, which is the whole of touch. */}
                        {saved && (
                          <span
                            aria-hidden
                            className="shrink-0 text-[10px] tracking-[0.14em] text-muted uppercase opacity-0 transition group-hover/row:opacity-100 group-focus-visible/row:opacity-100"
                          >
                            Remove
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {naming ? (
                <NewListForm
                  busy={busy}
                  onSubmit={createAndAdd}
                  onCancel={() => setNaming(false)}
                />
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNaming(true);
                    setError(null);
                  }}
                  className="block w-full border-t border-line px-4 py-2.5 text-left text-xs tracking-[0.14em] text-muted uppercase transition hover:text-accent"
                >
                  New list
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Names a list and saves the piece to it in one submit.
 *
 * Holds the name itself so typing re-renders this and not the panel above it,
 * which would re-render every row on every keystroke.
 */
function NewListForm({
  busy,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(name);
      }}
      className="border-t border-line p-3"
    >
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={WISHLIST_NAME_MAX}
        placeholder="Name this list"
        aria-label="List name"
        className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="rounded-lg border border-accent px-3 py-1.5 text-xs text-accent transition hover:bg-accent hover:text-background disabled:opacity-50"
        >
          Create and add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-muted transition hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Whether the piece is in this list, in a slot that holds its width either way
 * — a tick that appeared and vanished would shift the name beside it on every
 * toggle, and the row would twitch each time you pressed it.
 */
function CheckMark({ on }: { on: boolean }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {on && (
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="size-3.5 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 8.5 6.5 12 13 4.5" />
        </svg>
      )}
    </span>
  );
}

/**
 * Drawn rather than imported, for the same reason as the house in the header:
 * an icon set would be a dependency for one glyph, and `currentColor` is what
 * matters — the mark has to pick up the accent when the button is hovered.
 */
function PlusMark() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    >
      <path d="M8 3.5v9" />
      <path d="M3.5 8h9" />
    </svg>
  );
}
