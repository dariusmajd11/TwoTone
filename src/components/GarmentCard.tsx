import { ListingTable } from "@/components/ListingTable";
import { WishlistAdd } from "@/components/WishlistAdd";
import type { IdentificationRecord, ProductionStatus } from "@/lib/types";

const STATUS_LABEL: Record<ProductionStatus, string> = {
  "in-production": "Still in production",
  discontinued: "Discontinued",
  "seasonal-archive": "Seasonal archive",
  unknown: "Production status unknown",
};

const CONFIDENCE_LABEL = {
  high: "Confident on the brand",
  medium: "Fairly sure on the brand",
  low: "Best guess on the brand",
} as const;

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="archive-label">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

function money(amount: number) {
  return `$${Math.round(amount).toLocaleString("en-US")}`;
}

/**
 * `canSave` is opt-in rather than on by default because this card has three
 * homes. On the home page it is the answer to what you just asked, and saving
 * it is the obvious next move. Inside a History or WishList row it is the
 * expanded body of something already filed — a row there has its own controls,
 * and a second way to save sitting inside a list the piece is already in would
 * be one control too many.
 */
export function GarmentCard({
  record,
  canSave = false,
}: {
  record: IdentificationRecord;
  canSave?: boolean;
}) {
  const { result, marketLinks } = record;
  const used = marketLinks.filter((l) => l.market === "used");
  const neu = marketLinks.filter((l) => l.market === "new");

  // The most specific search term, which is the same string the market links
  // are built from — so the table and the links below it agree on what is being
  // looked for. Falls back to brand + name when the model returned no terms.
  const listingQuery =
    result.searchTerms[0] ?? `${result.brand} ${result.name}`.trim();

  return (
    <div className="slab-card rounded-2xl">
      <div className="border-b border-line p-5">
        {/* `min-w-0` on the text column is what stops a long garment name from
            pushing the button off the edge of the card — without it the flex
            child refuses to shrink below its content. */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="archive-label">{result.brand}</p>
            <h2 className="mt-1 text-2xl font-medium tracking-tight">
              {result.name}
            </h2>
          </div>
          {canSave && <WishlistAdd recordId={record.id} />}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          <span className="rounded-full border border-line px-2.5 py-1 text-muted">
            {STATUS_LABEL[result.productionStatus]}
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 text-muted">
            {CONFIDENCE_LABEL[result.brandConfidence]}
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <p className="text-sm leading-relaxed text-foreground/85">
          {result.description}
        </p>

        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Field
            label="Year"
            value={
              result.year
                ? `${result.year}${result.season ? ` · ${result.season}` : ""}`
                : "Unknown"
            }
          />
          <Field label="Category" value={result.category} />
          {result.colors.length > 0 && (
            <Field label="Colour" value={result.colors.join(", ")} />
          )}
          {result.materials.length > 0 && (
            <Field label="Material" value={result.materials.join(", ")} />
          )}
          {result.estimatedRetailUsd !== null && (
            <Field label="Retail" value={money(result.estimatedRetailUsd)} />
          )}
          {result.estimatedResaleUsd && (
            <Field
              label="Resale"
              value={`${money(result.estimatedResaleUsd.low)} – ${money(
                result.estimatedResaleUsd.high,
              )}`}
            />
          )}
        </dl>

        {result.identifyingDetails.length > 0 && (
          <div>
            <p className="archive-label">
              How we know
            </p>
            <ul className="mt-2 space-y-1.5">
              {result.identifyingDetails.map((detail) => (
                <li
                  key={detail}
                  className="flex gap-2.5 text-sm text-foreground/80"
                >
                  <span aria-hidden className="text-accent">
                    —
                  </span>
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actual items first, then the search links. The table answers "can I
            buy this right now, in my size, for how much"; the links below are
            the six marketplaces that have no API to ask. */}
        {listingQuery && (
          <ListingTable key={listingQuery} query={listingQuery} />
        )}

        {(used.length > 0 || neu.length > 0) && (
          <div className="space-y-3">
            {neu.length > 0 && <MarketRow label="Buy new" links={neu} />}
            {used.length > 0 && <MarketRow label="Buy used" links={used} />}
          </div>
        )}

        {result.caveat && (
          <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
            {result.caveat}
          </p>
        )}
      </div>
    </div>
  );
}

function MarketRow({
  label,
  links,
}: {
  label: string;
  links: IdentificationRecord["marketLinks"];
}) {
  return (
    <div>
      <p className="archive-label">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((link) => (
          <a
            key={link.marketplace}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-accent hover:text-accent"
          >
            {link.marketplace}
          </a>
        ))}
      </div>
    </div>
  );
}
