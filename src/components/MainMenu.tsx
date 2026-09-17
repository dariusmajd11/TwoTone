"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The three-bar menu at the top right, holding the two screens that are not
 * the home page.
 *
 * History and WishList moved in here when the home page took over the header.
 * They are both places you go occasionally and leave again, which is what a
 * menu is for; the home page is where you land, so it keeps a permanent mark
 * of its own rather than a row in here.
 */
export function MainMenu({
  active,
  onSelect,
}: {
  active: "history" | "wishlist" | null;
  onSelect: (view: "history" | "wishlist") => void;
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
          className="slab-menu absolute right-0 z-20 mt-2 w-40 overflow-hidden rounded-xl"
        >
          {(["history", "wishlist"] as const).map((view) => (
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
              {view === "history" ? "History" : "WishList"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
