"use client";

import type { ReactNode } from "react";
import { GarmentCard } from "@/components/GarmentCard";
import type { IdentificationRecord } from "@/lib/types";

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * One collapsed garment in a list, shared by History and WishList so a piece
 * looks the same wherever you meet it.
 *
 * The row is split into a button and an optional `action` slot rather than
 * being one big button, because a wishlist row needs a Remove control inside it
 * and a button cannot legally contain another button — browsers recover from it
 * unpredictably and screen readers announce it wrong.
 */
export function RecordRow({
  record,
  open,
  onToggle,
  action,
}: {
  record: IdentificationRecord;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
}) {
  return (
    <article className="slab-card overflow-hidden rounded-2xl">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-4 p-4 text-left transition hover:bg-foreground/5"
        >
          {record.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={record.imageUrl}
              alt={record.result.name}
              className="size-16 shrink-0 rounded-lg border border-line object-cover"
            />
          ) : (
            // A searched piece has no photo by nature rather than by failure,
            // so the slot gets a mark. An empty frame reads as an image that
            // did not load, which is a bug report waiting to happen.
            <span
              aria-hidden
              className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-line text-muted"
            >
              —
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="archive-label block">{record.result.brand}</span>
            <span className="mt-0.5 block truncate text-sm">
              {record.result.name}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {record.result.year ?? "Year unknown"} ·{" "}
              {formatDate(record.createdAt)}
            </span>
          </span>

          <span aria-hidden className="shrink-0 text-xs text-muted">
            {open ? "Hide" : "View"}
          </span>
        </button>

        {action && <div className="flex shrink-0 items-center pr-4">{action}</div>}
      </div>

      {open && (
        <div className="border-t border-line p-4">
          <GarmentCard record={record} />
        </div>
      )}
    </article>
  );
}
