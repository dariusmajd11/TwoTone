"use client";

import { useCallback, useEffect, useState } from "react";
import { RecordRow, formatDate } from "@/components/RecordRow";
import { HISTORY_MAX_LIMIT } from "@/lib/history";
import type { IdentificationRecord, Wishlist } from "@/lib/types";
import { WISHLIST_NAME_MAX } from "@/lib/wishlist-limits";

async function json(res: Response, fallback: string) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? fallback);
  return data;
}

/**
 * Wishlists store ids, not copies of the pieces, so this loads the lists and
 * the history together and joins them here.
 *
 * Doing the join on the client rather than in the route is what lets the picker
 * and the saved rows come from one fetch: the dropdown needs the full history
 * anyway, and once it is in hand, resolving entries against it is a map lookup.
 * The alternative — a route that returns lists with records already embedded —
 * would send the same garment down the wire twice on every load.
 */
export function WishlistPanel() {
  const [wishlists, setWishlists] = useState<Wishlist[] | null>(null);
  const [history, setHistory] = useState<IdentificationRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [naming, setNaming] = useState<"create" | "rename" | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        // The History tab's default window is the 25 most recent, but "choose
        // from your history" means all of it, so this asks for the widest page
        // the route will serve.
        const [lists, past] = await Promise.all([
          fetch("/api/wishlists").then((r) =>
            json(r, "Could not load your lists."),
          ),
          fetch(`/api/history?limit=${HISTORY_MAX_LIMIT}`).then((r) =>
            json(r, "Could not load your history."),
          ),
        ]);
        if (!active) return;
        setWishlists(lists.wishlists as Wishlist[]);
        setHistory(past.records as IdentificationRecord[]);
      } catch (err) {
        if (active) {
          setLoadError(
            err instanceof Error ? err.message : "Something went wrong.",
          );
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  /**
   * Closes everything and clears the last failure.
   *
   * Clearing the error matters as much as closing the menus: without it a
   * message outlives the thing that caused it, so text that was true one action
   * ago sits on screen while the next action succeeds — which reads as the app
   * still being broken when it is not. An error should describe the attempt you
   * just made, so anything that begins a new attempt wipes it.
   *
   * Defined above the effect that uses it because a `const` is not hoisted, and
   * it has to be listed in that effect's dependencies.
   */
  const resetPanelState = useCallback(() => {
    setNaming(null);
    setPicking(false);
    setConfirmingDelete(false);
    setActionError(null);
  }, []);

  // Escape backs out of whatever is open, which is the one gesture people try
  // without being told about it.
  useEffect(() => {
    if (!picking && naming === null && !confirmingDelete) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      resetPanelState();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, naming, confirmingDelete, resetPanelState]);

  /**
   * Every mutation answers with the full set of lists, so the client never
   * computes the new state itself and the two cannot drift.
   */
  async function send(
    url: string,
    init?: RequestInit,
  ): Promise<Wishlist[] | null> {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(url, init);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not update the list.");
      const next = data.wishlists as Wishlist[];
      setWishlists(next);
      return next;
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }

  function sendJson(url: string, method: string, body: unknown) {
    return send(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  const selected =
    wishlists?.find((list) => list.id === selectedId) ?? wishlists?.[0] ?? null;

  function selectList(id: string) {
    setSelectedId(id);
    // Anything open belonged to the list you just left.
    resetPanelState();
    setOpenId(null);
  }

  async function create(name: string) {
    const before = new Set((wishlists ?? []).map((list) => list.id));
    const next = await sendJson("/api/wishlists", "POST", { name });
    // On failure the form stays up with the name still in it — a rejected name
    // is exactly the moment you least want to retype it.
    if (!next) return;
    setNaming(null);
    const created = next.find((list) => !before.has(list.id));
    if (created) setSelectedId(created.id);
  }

  async function rename(name: string) {
    if (!selected) return;
    const next = await sendJson(
      `/api/wishlists/${selected.id}`,
      "PATCH",
      { name },
    );
    if (next) setNaming(null);
  }

  async function destroy() {
    if (!selected) return;
    await send(`/api/wishlists/${selected.id}`, { method: "DELETE" });
    setConfirmingDelete(false);
    // `selected` falls back to the first list on its own once this one is gone.
    setSelectedId(null);
  }

  function add(recordId: string) {
    if (!selected) return;
    return sendJson(`/api/wishlists/${selected.id}/items`, "POST", { recordId });
  }

  function remove(recordId: string) {
    if (!selected) return;
    return send(
      `/api/wishlists/${selected.id}/items?recordId=${encodeURIComponent(recordId)}`,
      { method: "DELETE" },
    );
  }

  if (loadError) {
    return (
      <p className="slab-card rounded-2xl p-5 text-sm text-muted">{loadError}</p>
    );
  }

  if (!wishlists || !history) {
    return (
      <div className="flex items-center gap-3 slab-card rounded-2xl p-5">
        <span className="size-2 animate-pulse rounded-full bg-accent" />
        <span className="text-sm text-muted">Loading your lists…</span>
      </div>
    );
  }

  if (wishlists.length === 0) {
    return (
      <div className="py-24 text-center">
        <h2 className="text-2xl font-medium tracking-tight">No lists yet</h2>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
          A list is somewhere to keep the pieces you actually want. Name it
          whatever you like — season, silhouette, the shop you are saving for —
          and pull anything you have identified into it.
        </p>
        <div className="mx-auto mt-8 max-w-sm">
          <NameForm
            action="Create list"
            busy={busy}
            onSubmit={create}
          />
          {actionError && (
            <p className="mt-3 text-xs text-red-700">{actionError}</p>
          )}
        </div>
        {history.length === 0 && (
          <p className="mx-auto mt-6 max-w-xs text-xs leading-relaxed text-muted">
            You have not identified anything yet, so there is nothing to add to
            a list — start on the Identify tab.
          </p>
        )}
      </div>
    );
  }

  // Entries whose record is outside the history window resolve to nothing. They
  // stay in storage rather than being pruned, so they come back if the piece
  // ever falls inside the window again.
  const byId = new Map(history.map((record) => [record.id, record]));
  const saved = (selected?.entries ?? [])
    .map((entry) => byId.get(entry.recordId))
    .filter((record): record is IdentificationRecord => Boolean(record));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {wishlists.map((list) => {
          const active = list.id === selected?.id;
          return (
            <button
              key={list.id}
              type="button"
              onClick={() => selectList(list.id)}
              aria-current={active ? "true" : undefined}
              /**
               * The cap is on the border box, so the 2rem of horizontal padding
               * comes out of the same budget — at 18ch it left 13ch of room and
               * clipped "Winter coats". 25ch keeps roughly 20 characters, which
               * covers any name anyone actually types while still stopping a
               * 60-character one from owning the whole row.
               */
              className={`max-w-[25ch] truncate rounded-full border px-4 py-1.5 text-xs transition ${
                active
                  ? "border-accent bg-accent text-background"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {list.name}
              <span className={active ? "ml-2 opacity-60" : "ml-2 opacity-70"}>
                {list.entries.length}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            const opening = naming !== "create";
            resetPanelState();
            if (opening) setNaming("create");
          }}
          className="rounded-full border border-dashed border-line px-4 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent"
        >
          New list
        </button>
      </div>

      {naming === "create" && (
        <NameForm key="create" action="Create" busy={busy} onSubmit={create} onCancel={() => setNaming(null)} />
      )}

      {selected && (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            {naming === "rename" ? (
              <NameForm
                key={`rename-${selected.id}`}
                initial={selected.name}
                action="Save"
                busy={busy}
                onSubmit={rename}
                onCancel={() => setNaming(null)}
              />
            ) : (
              <>
                <h2 className="min-w-0 truncate text-2xl font-medium tracking-tight">
                  {selected.name}
                </h2>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      resetPanelState();
                      setNaming("rename");
                    }}
                    className="text-muted hover:text-accent"
                  >
                    Rename
                  </button>
                  {/* Two taps rather than a browser confirm dialog, which would
                      be the one piece of chrome on the page the theme cannot
                      reach. Deleting a list is not undoable, so it should not
                      be a single stray click either. */}
                  {confirmingDelete ? (
                    <>
                      <button
                        type="button"
                        onClick={destroy}
                        disabled={busy}
                        className="text-red-700 hover:underline disabled:opacity-50"
                      >
                        Delete for good
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="text-muted hover:text-accent"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(true)}
                      className="text-muted hover:text-accent"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </>
            )}
          </div>

          {actionError && <p className="text-xs text-red-700">{actionError}</p>}

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                const opening = !picking;
                resetPanelState();
                if (opening) setPicking(true);
              }}
              aria-expanded={picking}
              disabled={history.length === 0}
              className="rounded-full border border-accent px-5 py-2 text-sm text-accent transition hover:bg-accent hover:text-background disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-accent"
            >
              Add from history
            </button>

            {history.length === 0 && (
              <p className="mt-3 text-xs text-muted">
                Identify a piece first and it will show up here.
              </p>
            )}

            {picking && selected && (
              <div className="slab-menu absolute left-0 z-20 mt-3 w-full max-w-md rounded-2xl p-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <p className="archive-label">Your history</p>
                  <button
                    type="button"
                    onClick={() => setPicking(false)}
                    className="text-xs text-muted hover:text-accent"
                  >
                    Close
                  </button>
                </div>

                {/* The menu deliberately stays open after a pick — saving one
                    piece is rare, saving four in a row is the normal case. */}
                <div className="max-h-80 overflow-y-auto">
                  {history.map((record) => {
                    const already = selected.entries.some(
                      (entry) => entry.recordId === record.id,
                    );
                    return (
                      <button
                        key={record.id}
                        type="button"
                        disabled={already || busy}
                        onClick={() => add(record.id)}
                        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition hover:bg-foreground/5 disabled:opacity-45 disabled:hover:bg-transparent"
                      >
                        {record.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={record.imageUrl}
                            alt=""
                            className="size-10 shrink-0 rounded-md border border-line object-cover"
                          />
                        ) : (
                          <span className="size-10 shrink-0 rounded-md border border-line" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {record.result.name}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {record.result.brand} ·{" "}
                            {formatDate(record.createdAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted">
                          {already ? "Added" : "Add"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {saved.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted">
              Nothing in this list yet.
            </p>
          ) : (
            <div className="space-y-3">
              {saved.map((record) => (
                <RecordRow
                  key={record.id}
                  record={record}
                  open={openId === record.id}
                  onToggle={() =>
                    setOpenId(openId === record.id ? null : record.id)
                  }
                  action={
                    <button
                      type="button"
                      onClick={() => remove(record.id)}
                      disabled={busy}
                      className="text-xs text-muted transition hover:text-accent disabled:opacity-50"
                    >
                      Remove
                    </button>
                  }
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Used for both creating and renaming. It holds the text itself rather than
 * lifting it to the panel, so a failed submit keeps what you typed; callers
 * pass a `key` to get a fresh one when the thing being named changes.
 */
function NameForm({
  initial,
  action,
  busy,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  action: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initial ?? "");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
      className="flex w-full items-center gap-2"
    >
      <input
        autoFocus
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={WISHLIST_NAME_MAX}
        placeholder="Name this list"
        aria-label="List name"
        className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <button
        type="submit"
        disabled={busy || value.trim().length === 0}
        className="shrink-0 rounded-lg border border-accent px-3 py-2 text-xs text-accent transition hover:bg-accent hover:text-background disabled:opacity-50"
      >
        {action}
      </button>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="shrink-0 text-xs text-muted hover:text-accent"
        >
          Cancel
        </button>
      )}
    </form>
  );
}
