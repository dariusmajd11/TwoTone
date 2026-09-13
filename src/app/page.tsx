"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AuthMenu } from "@/components/AuthMenu";
import { GarmentCard } from "@/components/GarmentCard";
import type { IdentificationRecord } from "@/lib/types";

type Entry = {
  id: string;
  previewUrl: string;
  fileName: string;
  status: "pending" | "done" | "error";
  record?: IdentificationRecord;
  error?: string;
};

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  const identify = useCallback(async (file: File) => {
    const id = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    setEntries((prev) => [
      ...prev,
      { id, previewUrl, fileName: file.name, status: "pending" },
    ]);

    const body = new FormData();
    body.append("image", file);

    try {
      const res = await fetch("/api/identify", { method: "POST", body });
      const data = await res.json();
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id !== id
            ? entry
            : res.ok
              ? { ...entry, status: "done", record: data.record }
              : { ...entry, status: "error", error: data.error },
        ),
      );
    } catch {
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? { ...entry, status: "error", error: "Network request failed." }
            : entry,
        ),
      );
    }
  }, []);

  // Pasting a screenshot is the fastest path from "saw a fit online" to a result.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = Array.from(event.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (file) identify(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [identify]);

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = Array.from(event.dataTransfer.files).find((f) =>
      f.type.startsWith("image/"),
    );
    if (file) identify(file);
  };

  return (
    <div
      className="flex min-h-dvh flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-background/80 px-6 py-4 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <span className="text-lg font-medium tracking-tight">TwoTone</span>
          <span className="hidden text-xs text-muted sm:inline">
            Identify any garment from a photo
          </span>
        </div>
        <AuthMenu />
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        {entries.length === 0 ? (
          <Empty onPick={() => inputRef.current?.click()} />
        ) : (
          <div className="space-y-10">
            {entries.map((entry) => (
              <section key={entry.id} className="space-y-4">
                <div className="flex justify-end">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.previewUrl}
                    alt={entry.fileName}
                    className="max-h-64 rounded-2xl border border-line object-contain"
                  />
                </div>
                {entry.status === "pending" && <Thinking />}
                {entry.status === "error" && (
                  <p className="rounded-2xl border border-line bg-panel p-5 text-sm text-muted">
                    {entry.error}
                  </p>
                )}
                {entry.record && <GarmentCard record={entry.record} />}
              </section>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </main>

      <footer className="sticky bottom-0 border-t border-line bg-background/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex-1 rounded-full border border-line px-5 py-3 text-left text-sm text-muted transition hover:border-accent hover:text-accent"
          >
            Drop a photo, paste a screenshot, or click to choose a file
          </button>
        </div>
      </footer>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) identify(file);
          e.target.value = "";
        }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-4 z-20 flex items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-background/70 text-sm tracking-widest text-accent uppercase">
          Drop to identify
        </div>
      )}
    </div>
  );
}

function Empty({ onPick }: { onPick: () => void }) {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <h1 className="max-w-md text-3xl leading-tight font-medium tracking-tight text-balance">
        What is that piece?
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
        Drop in a photo of any garment. TwoTone works out the brand, the year it
        was made, whether it is still in production, and where to find it new or
        secondhand.
      </p>
      <button
        type="button"
        onClick={onPick}
        className="mt-8 rounded-full border border-accent px-6 py-2.5 text-sm text-accent transition hover:bg-accent hover:text-background"
      >
        Choose a photo
      </button>
    </div>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-5">
      <span className="size-2 animate-pulse rounded-full bg-accent" />
      <span className="text-sm text-muted">Reading the details…</span>
    </div>
  );
}
