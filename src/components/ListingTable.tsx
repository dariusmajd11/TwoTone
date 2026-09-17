"use client";

import { useEffect, useState } from "react";
import type { Listing } from "@/lib/types";

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * The shared column track, declared once so the header and every row stay in
 * the same grid.
 *
 * Columns only exist from `sm` up. Four of them in a phone-width card leaves
 * the title about sixty pixels, which truncates to "Stone I…" and tells the
 * reader nothing, so below that breakpoint a row stacks into two lines
 * instead — the numbers on one, the title on its own underneath.
 */
const COLUMNS =
  "sm:grid sm:grid-cols-[6rem_5rem_7rem_1fr] sm:gap-x-4 sm:items-baseline";

/**
 * Real items for sale under an identification: price, size and condition, each
 * row opening the listing it came from.
 *
 * Fetched from the client on mount rather than passed down, because a listing
 * is the one part of a result with a shelf life. A record saved to a wishlist
 * in March should not show March's prices when opened in June — the garment
 * details are worth keeping, and what it costs today is worth re-asking.
 */
export function ListingTable({ query }: { query: string }) {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [live, setLive] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guards against a response landing after the card has gone, which would
    // set state on nothing. Stale results across a *changed* query are handled
    // by the `key` at the call site: a new query mounts a new table rather than
    // resetting this one, which keeps the effect free of a synchronous reset.
    let current = true;

    fetch(`/api/listings?q=${encodeURIComponent(query)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data) => {
        if (!current) return;
        setListings(data.listings);
        setLive(data.live);
      })
      .catch(() => current && setFailed(true));

    return () => {
      current = false;
    };
  }, [query]);

  // The table is an extra, so it stays silent when it has nothing to add. A
  // marketplace being unreachable is not something to interrupt the reader
  // with when the identification above it is perfectly good.
  if (failed || (listings && listings.length === 0)) return null;

  return (
    <div>
      {/* Naming the marketplace matters more now that there are no photos:
          every row leaves the site, and the reader should know where to. */}
      <p className="archive-label">
        {live
          ? `For sale now · ${listings?.[0]?.marketplace ?? "eBay"}`
          : "For sale now · sample data"}
      </p>

      <div className="mt-2 overflow-hidden rounded-xl border border-line">
        {/* The header is the columns' labels, so it goes when they do. */}
        <div
          className={`hidden ${COLUMNS} border-b border-line px-4 py-2 text-[10px] tracking-[0.14em] text-muted uppercase`}
        >
          <span>Price</span>
          <span>Size</span>
          <span>Condition</span>
          <span>Listing</span>
        </div>

        {listings === null ? (
          <div className="divide-y divide-line">
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className={`flex flex-col gap-2 px-4 py-3 sm:gap-0 ${COLUMNS}`}
              >
                <span className="h-3 w-20 animate-pulse rounded bg-foreground/10 sm:w-auto" />
                <span className="h-3 w-10 animate-pulse rounded bg-foreground/10 sm:w-auto" />
                <span className="hidden h-3 animate-pulse rounded bg-foreground/10 sm:block" />
                <span className="h-3 animate-pulse rounded bg-foreground/10" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {listings.map((listing) => (
              <li key={listing.id}>
                <a
                  href={listing.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`group flex flex-col gap-1 px-4 py-3 transition hover:bg-foreground/5 sm:gap-0 ${COLUMNS}`}
                >
                  {/* `sm:contents` dissolves this wrapper once the columns
                      exist, so the three spans become grid cells in their own
                      right instead of sharing one. Below that it keeps them
                      together on the row's first line. */}
                  <span className="flex items-baseline gap-3 sm:contents">
                    {/* Tabular figures so the prices line up digit for digit
                        rather than drifting with the width of each numeral. */}
                    <span className="text-sm tabular-nums transition-colors group-hover:text-accent">
                      {listing.price
                        ? money(listing.price.amount, listing.price.currency)
                        : "On site"}
                    </span>

                    {/* Size is the reason someone clicks or does not, so it
                        says so plainly when the seller left it out rather than
                        leaving a gap that reads as "not loaded yet". */}
                    <span className="text-sm">
                      {listing.size ?? <span className="text-muted">—</span>}
                    </span>

                    <span className="truncate text-xs text-muted">
                      {listing.condition ?? "—"}
                    </span>
                  </span>

                  <span className="truncate text-xs text-muted transition-colors group-hover:text-accent">
                    {listing.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
