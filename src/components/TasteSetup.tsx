"use client";

import { useState } from "react";
import {
  ACCESSORIES,
  BRANDS,
  ERAS,
  NOTES_MAX,
  SILHOUETTES,
  SIZES,
} from "@/lib/taste";
import type { TasteProfile } from "@/lib/types";

/**
 * The setup page: what the wearer likes, asked once after signing up and
 * editable afterwards.
 *
 * Chips rather than dropdowns throughout. The whole point of the screen is that
 * someone scanning fifty houses recognises four of them, and recognition needs
 * the options on the page — a select box hides exactly the thing being asked
 * for. It costs vertical space, which is why the brand list is the only one
 * that scrolls in its own box.
 */

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        selected
          ? "border-accent bg-accent text-background"
          : "border-line text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {label}
    </button>
  );
}

function Section({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="archive-label">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      <div className="mt-3 flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

const EMPTY = {
  brands: [] as string[],
  silhouettes: [] as string[],
  accessories: [] as string[],
  eras: [] as string[],
  tops: null as string | null,
  waist: null as string | null,
  shoes: null as string | null,
  notes: "",
};

export function TasteSetup({
  existing,
  onSaved,
  onSkip,
}: {
  existing: TasteProfile | null;
  onSaved: (taste: TasteProfile) => void;
  onSkip: () => void;
}) {
  const [form, setForm] = useState(() =>
    existing
      ? {
          brands: existing.brands,
          silhouettes: existing.silhouettes,
          accessories: existing.accessories,
          eras: existing.eras,
          tops: existing.sizes.tops,
          waist: existing.sizes.waist,
          shoes: existing.sizes.shoes,
          notes: existing.notes ?? "",
        }
      : EMPTY,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (
    key: "brands" | "silhouettes" | "accessories" | "eras",
    value: string,
  ) =>
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));

  // A second press on the chosen size clears it, which is the only way to undo
  // a single-choice row without a "none" chip in every one of them.
  const choose = (key: "tops" | "waist" | "shoes", value: string) =>
    setForm((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));

  const enough =
    form.brands.length > 0 ||
    form.silhouettes.length > 0 ||
    form.accessories.length > 0;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brands: form.brands,
          silhouettes: form.silhouettes,
          accessories: form.accessories,
          eras: form.eras,
          sizes: { tops: form.tops, waist: form.waist, shoes: form.shoes },
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your answers.");
      onSaved(data.taste as TasteProfile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your answers.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-medium tracking-tight">
          {existing ? "Your taste" : "What are you into?"}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/85">
          Pick whatever you recognise. This is what the home page reads when it
          puts together a feed for you, and you can change it whenever.
        </p>
      </div>

      {/* The only list long enough to need its own scroll. Capped at roughly
          nine rows so the sections below it stay visible on a laptop — a wall
          of fifty chips reads as a form to escape rather than one to fill in. */}
      <Section label="Houses" hint="The names you look for.">
        <div className="max-h-64 w-full overflow-y-auto rounded-xl border border-line p-3">
          <div className="flex flex-wrap gap-2">
            {BRANDS.map((brand) => (
              <Chip
                key={brand}
                label={brand}
                selected={form.brands.includes(brand)}
                onToggle={() => toggle("brands", brand)}
              />
            ))}
          </div>
        </div>
      </Section>

      <Section label="Silhouettes" hint="How you like things to sit.">
        {SILHOUETTES.map((shape) => (
          <Chip
            key={shape}
            label={shape}
            selected={form.silhouettes.includes(shape)}
            onToggle={() => toggle("silhouettes", shape)}
          />
        ))}
      </Section>

      <Section label="Accessories" hint="What you actually wear.">
        {ACCESSORIES.map((item) => (
          <Chip
            key={item}
            label={item}
            selected={form.accessories.includes(item)}
            onToggle={() => toggle("accessories", item)}
          />
        ))}
      </Section>

      <Section label="Eras">
        {ERAS.map((era) => (
          <Chip
            key={era}
            label={era}
            selected={form.eras.includes(era)}
            onToggle={() => toggle("eras", era)}
          />
        ))}
      </Section>

      <div className="grid gap-6 sm:grid-cols-3">
        <Section label="Tops">
          {SIZES.tops.map((size) => (
            <Chip
              key={size}
              label={size}
              selected={form.tops === size}
              onToggle={() => choose("tops", size)}
            />
          ))}
        </Section>
        <Section label="Waist">
          {SIZES.waist.map((size) => (
            <Chip
              key={size}
              label={size}
              selected={form.waist === size}
              onToggle={() => choose("waist", size)}
            />
          ))}
        </Section>
        <Section label="Shoes" hint="US">
          {SIZES.shoes.map((size) => (
            <Chip
              key={size}
              label={size}
              selected={form.shoes === size}
              onToggle={() => choose("shoes", size)}
            />
          ))}
        </Section>
      </div>

      <div>
        <p className="archive-label">Anything else</p>
        <textarea
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          maxLength={NOTES_MAX}
          rows={3}
          placeholder="Only black. Nothing with visible branding. Looking for a winter coat."
          className="mt-2 w-full rounded-xl border border-line bg-transparent p-3 text-sm outline-none placeholder:text-muted focus:border-accent"
        />
        <p className="mt-1 text-right text-[11px] text-muted">
          {form.notes.length}/{NOTES_MAX}
        </p>
      </div>

      {error && <p className="text-sm text-muted">{error}</p>}

      <div className="flex items-center gap-4 border-t border-line pt-6">
        <button
          type="button"
          onClick={save}
          disabled={!enough || saving}
          className="rounded-full bg-accent px-5 py-2.5 text-xs tracking-[0.16em] text-background uppercase transition disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save and see my feed"}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="text-xs text-muted underline-offset-4 transition-colors hover:text-accent hover:underline"
        >
          Skip for now
        </button>
      </div>

      {/* Says why the button is dead rather than leaving someone clicking it.
          The floor is deliberately low — one chip anywhere clears it. */}
      {!enough && (
        <p className="text-xs text-muted">
          Pick at least one house, silhouette or accessory.
        </p>
      )}
    </div>
  );
}
