"use client";

import { useEffect, useRef, useState } from "react";

export type MenuView = "history" | "wishlist";

/**
 * The three-bar menu at the top right: everywhere you can go that is not the
 * home page, plus the account the going belongs to.
 *
 * Home is the one destination deliberately kept out. It is where you land and
 * the place you return to most, so it keeps a permanent mark of its own in the
 * header — the rows in here are all places you visit and leave again, which is
 * what a menu is for.
 *
 * The For You feed is not in here either, for the opposite reason: it is part
 * of the home page now rather than a place of its own, and a menu row leading
 * to something already on screen is a row that teaches you the menu is
 * unreliable.
 */
const ITEMS: { view: MenuView; label: string }[] = [
  { view: "history", label: "History" },
  { view: "wishlist", label: "WishList" },
];

export function MainMenu({
  email,
  active,
  onSelect,
  onSignOut,
}: {
  email: string;
  active: MenuView | null;
  onSelect: (view: MenuView) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    // Pointerdown rather than click: a menu that survives until mouseup feels
    // stuck when you press on the page behind it.
    const onPointerDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Menu"
        className="flex size-9 flex-col items-center justify-center gap-[5px] rounded-full border border-line transition hover:border-accent"
      >
        {/* Drawn rather than an icon font, so the bars take the text colour and
            the middle one can shorten on hover without loading anything. */}
        <span className="block h-px w-4 bg-current transition-all" />
        <span className="block h-px w-4 bg-current transition-all" />
        <span className="block h-px w-4 bg-current transition-all" />
      </button>

      {open && (
        <div
          role="menu"
          className="slab-menu absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl"
        >
          {/* Who you are, now that the header no longer says it. Not a control
              and not a menu item — it is the label on the drawer everything
              below it acts on, which matters most right above "Sign out". */}
          <p className="truncate border-b border-line px-4 py-2.5 text-[10px] tracking-[0.14em] text-muted uppercase">
            {email}
          </p>

          {ITEMS.map(({ view, label }) => (
            <button
              key={view}
              type="button"
              role="menuitem"
              onClick={() => {
                onSelect(view);
                setOpen(false);
              }}
              aria-current={active === view ? "page" : undefined}
              className={`block w-full px-4 py-2.5 text-left text-xs tracking-[0.14em] uppercase transition ${
                active === view
                  ? "bg-accent text-background"
                  : "text-muted hover:text-accent"
              }`}
            >
              {label}
            </button>
          ))}

          {/* Ruled off from the navigation above it. The other rows move you
              between screens and cost nothing to undo; this one ends the
              session, so it should not sit flush against them where a slipped
              click lands. */}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="block w-full border-t border-line px-4 py-2.5 text-left text-xs tracking-[0.14em] text-muted uppercase transition hover:text-accent"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
