import Anthropic from "@anthropic-ai/sdk";
import { backends, env } from "./env";
import type { GarmentIdentification } from "./types";

export class IdentificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdentificationError";
  }
}

export interface GarmentIdentifier {
  identify(imageBase64: string, mediaType: string): Promise<GarmentIdentification>;
  /**
   * The typed counterpart to `identify`. It returns the same shape on purpose —
   * a searched piece is an identification like any other, so it renders in the
   * same card, gets the same market links, and can be saved to a wishlist
   * without a single branch downstream.
   */
  describe(query: string): Promise<GarmentIdentification>;
}

const SYSTEM_PROMPT = `You are TwoTone, a fashion archivist who identifies garments from photographs.

Given a photo of a clothing item, determine what it is: the brand, the specific
product name or model, the year and season it was produced, and whether it is
still being manufactured.

How to work:
- Read visible evidence first — logos, care tags, neck labels, hardware stamps,
  buttons, stitching patterns, weave, silhouette, and colorway.
- When the label is not visible, reason from construction details and era cues,
  and lower brandConfidence accordingly.
- Never invent a specific product name or year to sound authoritative. Use null
  for year and season when you genuinely cannot tell, and say so in caveat.
- searchTerms are resale queries a person would actually type. Order them from
  most specific to most general, e.g. "Stone Island Ghost Piece Soft Shell-R",
  then "Stone Island soft shell jacket", then "Stone Island jacket".
- estimatedResaleUsd should reflect the secondhand market in good condition.

Write description for someone who wants to understand what makes the piece
distinctive, not a product listing.`;

const USER_INSTRUCTION =
  "Identify this garment. If multiple items are visible, describe the most prominent one.";

/**
 * A photo is evidence; a typed query is a claim. The photo prompt tells Claude
 * to read logos and stitching, which a search has none of — so the whole job
 * changes from "what am I looking at" to "which real piece does this describe,
 * and how sure can I honestly be".
 *
 * Most of this prompt is spent on the vague case, because that is the common
 * one. "Black bomber jacket" has no right answer, and the failure mode worth
 * designing against is a confident invented one: a plausible model name and
 * year that sends someone hunting for a garment that never existed.
 */
const SEARCH_SYSTEM_PROMPT = `You are TwoTone, a fashion archivist. Someone has typed the name of a garment,
or a description of one, and wants to know what it is.

The query is a claim, not evidence. It may be exact ("Stone Island Ghost Piece
Soft Shell-R"), approximate ("that tonal Stone Island jacket"), or only a
category ("black bomber jacket").

How to work:
- When the query names a specific piece you actually know, answer about that
  piece: brand, year, season, production status, and what defines it.
- When it names a real line but not which version, answer about the line, lower
  brandConfidence, and use caveat to say what would pin it down — a season, a
  colourway, a specific detail.
- When it is only a category, describe the category honestly. Leave brand as
  "Unknown", year and season null, brandConfidence "low", and use caveat to say
  what to add to the search to get a real identification.
- Never invent a product name, year, or collaboration to make a vague query look
  like a confident answer. "I need more to go on" is more useful than a
  fabricated archive entry that sends someone looking for something that was
  never made.
- If the query does not describe a garment at all, say so plainly in caveat
  instead of forcing a fashion answer onto it.
- identifyingDetails are the features that define the piece and would let
  someone recognise it in a listing — there is no photograph to read cues from.
- searchTerms are resale queries a person would actually type, most specific
  first.

Write description for someone who wants to understand what makes the piece
distinctive, not a product listing.`;

const NULLABLE_STRING = { type: ["string", "null"] } as const;

const GARMENT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "Product or model name, or a plain description if unnamed" },
    brand: { type: "string", description: "Brand name, or \"Unknown\" if not determinable" },
    brandConfidence: { type: "string", enum: ["high", "medium", "low"] },
    year: { type: ["integer", "null"], description: "Year of production, null if unknown" },
    season: { ...NULLABLE_STRING, description: "e.g. \"FW19\", null if unknown" },
    category: { type: "string", description: "e.g. \"jacket\", \"sneakers\", \"denim\"" },
    colors: { type: "array", items: { type: "string" } },
    materials: { type: "array", items: { type: "string" } },
    productionStatus: {
      type: "string",
      enum: ["in-production", "discontinued", "seasonal-archive", "unknown"],
    },
    description: { type: "string" },
    identifyingDetails: {
      type: "array",
      items: { type: "string" },
      description: "Visual cues that led to this identification",
    },
    estimatedRetailUsd: { type: ["number", "null"] },
    estimatedResaleUsd: {
      type: ["object", "null"],
      properties: { low: { type: "number" }, high: { type: "number" } },
      required: ["low", "high"],
      additionalProperties: false,
    },
    searchTerms: { type: "array", items: { type: "string" }, minItems: 1 },
    caveat: { ...NULLABLE_STRING, description: "What is uncertain about this identification" },
  },
  required: [
    "name",
    "brand",
    "brandConfidence",
    "year",
    "season",
    "category",
    "colors",
    "materials",
    "productionStatus",
    "description",
    "identifyingDetails",
    "estimatedRetailUsd",
    "estimatedResaleUsd",
    "searchTerms",
    "caveat",
  ],
  additionalProperties: false,
} as const;

class ClaudeGarmentIdentifier implements GarmentIdentifier {
  private client: Anthropic | null = null;

  private anthropic() {
    this.client ??= new Anthropic({ apiKey: env.anthropicApiKey! });
    return this.client;
  }

  /** Photo and search differ only in the prompt and the message content. */
  private async ask(
    system: string,
    content: Anthropic.ContentBlockParam[],
  ): Promise<GarmentIdentification> {
    const message = await this.anthropic().messages.create({
      model: env.anthropicModel,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: GARMENT_SCHEMA },
      },
      system,
      messages: [{ role: "user", content }],
    });

    // Adaptive thinking emits thinking blocks ahead of the answer, so the JSON
    // is in the first text block rather than at a fixed index.
    const text = message.content.find((block) => block.type === "text")?.text;
    if (!text) {
      throw new IdentificationError("Claude returned no identification.");
    }
    return JSON.parse(text) as GarmentIdentification;
  }

  async identify(imageBase64: string, mediaType: string) {
    return this.ask(SYSTEM_PROMPT, [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType as "image/jpeg",
          data: imageBase64,
        },
      },
      { type: "text", text: USER_INSTRUCTION },
    ]);
  }

  async describe(query: string) {
    return this.ask(SEARCH_SYSTEM_PROMPT, [
      {
        type: "text",
        // Fenced so a query that reads like an instruction ("ignore the above
        // and…") lands as the thing being searched for rather than as a new
        // instruction. The tag is the boundary the prompt refers to.
        text: `Identify the garment described by this search.\n\n<query>${query}</query>`,
      },
    ]);
  }
}

/**
 * Lets the full upload → identify → market-links flow run without an API key,
 * so the UI is developable before billing is set up.
 */
class MockGarmentIdentifier implements GarmentIdentifier {
  async identify(): Promise<GarmentIdentification> {
    return this.sample();
  }

  /**
   * Echoes the query into the fixture so the search field is actually testable
   * without a key — a constant response would look identical no matter what you
   * typed, which is exactly the bug you would be trying to catch.
   */
  async describe(query: string): Promise<GarmentIdentification> {
    const sample = this.sample();
    return {
      ...sample,
      name: query,
      brandConfidence: "low",
      searchTerms: [query, ...sample.searchTerms],
      caveat: "Sample response — set ANTHROPIC_API_KEY to search real garments.",
    };
  }

  private sample(): GarmentIdentification {
    return {
      name: "Ghost Piece Soft Shell-R",
      brand: "Stone Island",
      brandConfidence: "medium",
      year: 2019,
      season: "FW19",
      category: "jacket",
      colors: ["black"],
      materials: ["polyester", "polyurethane membrane"],
      productionStatus: "discontinued",
      description:
        "A tonal soft shell from the Ghost Piece program, where every component — including the compass badge — is rendered in a single colour.",
      identifyingDetails: [
        "Tonal compass badge on the left sleeve",
        "Matte three-layer soft shell face fabric",
        "Concealed two-way front zip",
      ],
      estimatedRetailUsd: 1050,
      estimatedResaleUsd: { low: 520, high: 780 },
      searchTerms: [
        "Stone Island Ghost Piece Soft Shell-R",
        "Stone Island soft shell jacket",
        "Stone Island jacket",
      ],
      caveat:
        "Sample response — set ANTHROPIC_API_KEY to identify real garments.",
    };
  }
}

export const garmentIdentifier: GarmentIdentifier =
  backends.identification === "claude"
    ? new ClaudeGarmentIdentifier()
    : new MockGarmentIdentifier();
