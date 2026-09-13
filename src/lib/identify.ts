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

  async identify(imageBase64: string, mediaType: string) {
    const message = await this.anthropic().messages.create({
      model: env.anthropicModel,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "high",
        format: { type: "json_schema", schema: GARMENT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: USER_INSTRUCTION },
          ],
        },
      ],
    });

    // Adaptive thinking emits thinking blocks ahead of the answer, so the JSON
    // is in the first text block rather than at a fixed index.
    const text = message.content.find((block) => block.type === "text")?.text;
    if (!text) {
      throw new IdentificationError("Claude returned no identification.");
    }
    return JSON.parse(text) as GarmentIdentification;
  }
}

/**
 * Lets the full upload → identify → market-links flow run without an API key,
 * so the UI is developable before billing is set up.
 */
class MockGarmentIdentifier implements GarmentIdentifier {
  async identify(): Promise<GarmentIdentification> {
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
