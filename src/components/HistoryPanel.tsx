"use client";

import { useEffect, useState } from "react";
import { RecordRow } from "@/components/RecordRow";
import type { IdentificationRecord } from "@/lib/types";

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
      <p className="slab-card rounded-2xl p-5 text-sm text-muted">
        {error}
      </p>
    );
  }

  if (!records) {
    return (
      <div className="flex items-center gap-3 slab-card rounded-2xl p-5">
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
      {records.map((record) => (
        <RecordRow
          key={record.id}
          record={record}
          open={openId === record.id}
          onToggle={() => setOpenId(openId === record.id ? null : record.id)}
        />
      ))}
    </div>
  );
}
