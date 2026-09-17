"use client";

import { useEffect, useState } from "react";
import type { Recommendation } from "@/lib/types";

/**
 * The For You feed: pieces picked from the taste profile, one per row.
 *
 * Opening a row hands its search terms to the identifier, which is what turns a
 * suggestion into the full card — the description, the market links and the
 * live listings with their prices and sizes. This page deliberately does not
 * fetch listings itself: eight recommendations would be eight searches plus a
 * detail call per item shown, and the wearer has not said they are interested
 * in any of them yet.
 */

/** Shared column track, so the header and every row line up. */
const COLUMNS =
  "sm:grid sm:grid-cols-[8rem_1fr_7rem_6rem] sm:gap-x-4 sm:items-baseline";

function money(amount: number) {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

export function ForYou({
  onOpen,
  onSetup,
}: {
  onOpen: (query: string) => void;
  onSetup: () => void;
}) {
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [live, setLive] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;

    fetch("/api/recommendations")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (!current) return;
        setItems(data.recommendations);
        setNeedsSetup(data.needsSetup);
        setLive(data.live);
      })
      .catch(() => current && setFailed(true));

    return () => {
      current = false;
    };
  }, []);

  if (needsSetup) {
    return (
      <div className="slab-card rounded-2xl p-6">
        <p className="archive-label">For you</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          Tell TwoTone what you are into and this becomes a feed of pieces
          picked for you.
        </p>
        <button
          type="button"
          onClick={onSetup}
          className="mt-4 rounded-full border border-line px-4 py-2 text-xs tracking-[0.16em] uppercase transition hover:border-accent hover:text-accent"
        >
          Set up your taste
        </button>
      </div>
    );
  }

  // A feed that cannot be built is not worth an error block: the search bar
  // below still works, and that is the app's actual proposition.
  if (failed) return null;

  return (
    <div>
      <p className="archive-label">
        {live ? "For you" : "For you · sample data"}
      </p>

      <div className="mt-2 overflow-hidden rounded-xl border border-line">
        <div
          className={`hidden ${COLUMNS} border-b border-line px-4 py-2 text-[10px] tracking-[0.14em] text-muted uppercase`}
        >
          <span>House</span>
          <span>Piece</span>
          <span>Category</span>
          <span>Resale</span>
        </div>

        {items === null ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 5 }, (_, index) => (
              <div key={index} className={`px-4 py-3.5 ${COLUMNS}`}>
                <span className="block h-3 w-24 animate-pulse rounded bg-foreground/10" />
                <span className="mt-2 block h-3 animate-pulse rounded bg-foreground/10 sm:mt-0" />
                <span className="hidden h-3 animate-pulse rounded bg-foreground/10 sm:block" />
                <span className="hidden h-3 animate-pulse rounded bg-foreground/10 sm:block" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    onOpen(item.searchTerms[0] ?? `${item.brand} ${item.name}`)
                  }
                  className={`group w-full px-4 py-3.5 text-left transition hover:bg-foreground/5 ${COLUMNS}`}
                >
                  <span className="block text-sm transition-colors group-hover:text-accent">
                    {item.brand}
                  </span>

                  <span className="mt-1 block sm:mt-0">
                    <span className="block text-sm">{item.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {item.description}
                    </span>
                    {/* The reason is what makes this a recommendation rather
                        than a list. It stays with the piece on every width,
                        where the tidier columns drop away on a phone. */}
                    <span className="mt-1 block text-[11px] text-muted italic">
                      {item.reason}
                    </span>
                  </span>

                  <span className="mt-1 block text-xs text-muted sm:mt-0">
                    {item.category}
                  </span>

                  <span className="block text-xs text-muted tabular-nums">
                    {item.estimatedResaleUsd
                      ? `${money(item.estimatedResaleUsd.low)}–${money(
                          item.estimatedResaleUsd.high,
                        )}`
                      : "—"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
