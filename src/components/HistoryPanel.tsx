"use client";

import { useEffect, useState } from "react";
import { GarmentCard } from "@/components/GarmentCard";
import type { IdentificationRecord } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Fetches on every mount rather than caching, because the page unmounts this
 * whenever you switch back to identifying — so a piece you just identified is
 * already in the list by the time you return to it.
 */
export function HistoryPanel() {
  const [records, setRecords] = useState<IdentificationRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/history")
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not load your history.");
        return data.records as IdentificationRecord[];
      })
      .then((rows) => {
        if (active) setRecords(rows);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
        {error}
      </p>
    );
  }

  if (!records) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-5">
        <span className="size-2 animate-pulse rounded-full bg-accent" />
        <span className="text-sm text-muted">Loading your history…</span>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="py-24 text-center">
        <h2 className="text-2xl font-medium tracking-tight">Nothing saved yet</h2>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-muted">
          Every garment you identify while signed in is kept here, with the photo
          you used.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => {
        const open = openId === record.id;
        return (
          <article
            key={record.id}
            className="overflow-hidden rounded-2xl border border-line bg-panel"
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : record.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-4 p-4 text-left transition hover:bg-foreground/5"
            >
              {record.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={record.imageUrl}
                  alt={record.result.name}
                  className="size-16 shrink-0 rounded-lg border border-line object-cover"
                />
              ) : (
                <span className="size-16 shrink-0 rounded-lg border border-line" />
              )}

              <span className="min-w-0 flex-1">
                <span className="block text-[11px] tracking-widest text-muted uppercase">
                  {record.result.brand}
                </span>
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

            {open && (
              <div className="border-t border-line p-4">
                <GarmentCard record={record} />
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
