// =============================================================================
// Mosaic Engine — Orchestration Layer
//
// Ties together the image processor, LEGO colour matching, and LDR generation
// into a single high-level pipeline:
//
//   File  →  processImage()  →  findNearestColor()  →  generatePreviewDataURL()
//                                                    →  generateLDR()
//                                                    →  parts list
//
// Zero external dependencies.
// =============================================================================

import type { LegoColor, RGB } from './colors';
import { findNearestColor, byLdrawCode } from './colors';
import { generateLDR, createMosaicConfig } from './ldraw';
import type { MosaicConfig } from './ldraw';
import { processImage, generatePreviewDataURL } from './imageProcessor';

// Re-export MosaicConfig so consumers don't need a separate ldraw import.
export type { MosaicConfig };

// =============================================================================
// Types
// =============================================================================

/** A predefined mosaic size option for the UI. */
export interface MosaicSize {
  /** Human-readable label, e.g. "32×32 (1 baseplate)" */
  label: string;
  /** Target width in studs. */
  widthStuds: number;
  /** Target height in studs. */
  heightStuds: number;
  /** Short description of required baseplates, e.g. "1× 32×32" */
  baseplates: string;
}

/** One row in the parts-list summary. */
export interface PartsListEntry {
  /** The matched LEGO colour. */
  color: LegoColor;
  /** How many 1×1 pieces of this colour are needed. */
  count: number;
  /** BrickLink colour ID (for ordering). */
  bricklinkColorId: number;
  /** BrickLink part number string, e.g. "3070b" for tiles. */
  partNumber: string;
}

/** The complete result returned by `generateMosaic()`. */
export interface MosaicResult {
  /** Hex colour strings `[row][col]`, e.g. "#B40000". */
  colorGrid: string[][];
  /** LDraw colour codes `[row][col]`, e.g. 4 for Red. */
  ldrawColorGrid: number[][];
  /** PNG data-URL of the stud-grid preview. */
  previewDataURL: string;
  /** Full contents of the .ldr file, ready for download. */
  ldrContent: string;
  /** Colour-sorted parts list (descending by count). */
  partsList: PartsListEntry[];
  /** Total number of 1×1 pieces across all colours. */
  totalPieces: number;
  /** The LDraw mosaic configuration that was used. */
  config: MosaicConfig;
}

// =============================================================================
// Predefined Mosaic Sizes
// =============================================================================

export const MOSAIC_SIZES: MosaicSize[] = [
  {
    label: '16×16 (1 baseplate)',
    widthStuds: 16,
    heightStuds: 16,
    baseplates: '1× 16×16',
  },
  {
    label: '32×32 (1 baseplate)',
    widthStuds: 32,
    heightStuds: 32,
    baseplates: '1× 32×32',
  },
  {
    label: '48×48 (1 baseplate)',
    widthStuds: 48,
    heightStuds: 48,
    baseplates: '1× 48×48',
  },
  {
    label: '64×64 (2×2 32×32 baseplates)',
    widthStuds: 64,
    heightStuds: 64,
    baseplates: '4× 32×32',
  },
  {
    label: '96×96 (2×2 48×48 baseplates)',
    widthStuds: 96,
    heightStuds: 96,
    baseplates: '4× 48×48',
  },
  {
    label: '96×96 (3×3 32×32 baseplates)',
    widthStuds: 96,
    heightStuds: 96,
    baseplates: '9× 32×32',
  },
];

// =============================================================================
// Internal Helpers
// =============================================================================

/** Map a piece-type shorthand to its LDraw .dat filename. */
function pieceTypeToDat(piece: '3070b' | '3024'): string {
  return `${piece}.dat`;
}

/** Strip the ".dat" extension to get a bare BrickLink part number. */
function datToPartNumber(dat: string): string {
  return dat.replace(/\.dat$/i, '');
}

/**
 * Build a sorted parts list from the LDraw colour grid.
 *
 * Counts each unique LDraw colour, resolves it via `byLdrawCode`, and returns
 * the entries sorted by descending count (most-used colour first).
 */
function buildPartsList(
  ldrawColorGrid: number[][],
  partNumber: string,
): PartsListEntry[] {
  // Accumulate counts keyed by LDraw code.
  const counts = new Map<number, number>();

  for (const row of ldrawColorGrid) {
    for (const code of row) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  // Resolve each code to a full PartsListEntry.
  const entries: PartsListEntry[] = [];

  for (const [code, count] of counts) {
    const legoColor = byLdrawCode.get(code);
    if (!legoColor) {
      // Should never happen if findNearestColor is the only source, but
      // guard defensively.
      throw new Error(`Unknown LDraw colour code in grid: ${code}`);
    }

    entries.push({
      color: legoColor,
      count,
      bricklinkColorId: legoColor.bricklinkId,
      partNumber,
    });
  }

  // Most-used colours first; ties broken alphabetically by name.
  entries.sort((a, b) => b.count - a.count || a.color.name.localeCompare(b.color.name));

  return entries;
}

// =============================================================================
// Main Pipeline
// =============================================================================

/**
 * Generate a complete LEGO mosaic from a source image.
 *
 * Pipeline:
 *   1. Decode + resize the image to stud dimensions.
 *   2. Map every pixel to the perceptually nearest LEGO colour (CIEDE2000).
 *   3. Render a stud-grid preview PNG.
 *   4. Generate the .ldr file content.
 *   5. Compute the parts list.
 *
 * @param file    - Source image (from an `<input type="file">`).
 * @param size    - One of the `MOSAIC_SIZES` entries (or any custom size).
 * @param options - Optional piece-type override and image adjustments.
 * @returns A `MosaicResult` with everything the UI needs.
 */
export async function generateMosaic(
  file: File,
  size: MosaicSize,
  options?: {
    /** '3070b' = 1×1 tile (default, smooth top), '3024' = 1×1 plate (stud) */
    pieceType?: '3070b' | '3024';
    brightness?: number;
    contrast?: number;
    saturation?: number;
  },
): Promise<MosaicResult> {
  const { widthStuds, heightStuds } = size;
  const pieceType = options?.pieceType ?? '3070b';

  // ── Step 1: Process the source image ─────────────────────────────────────
  const pixelData = await processImage(file, widthStuds, heightStuds, {
    brightness: options?.brightness,
    contrast: options?.contrast,
    saturation: options?.saturation,
  });

  // ── Step 2: Map pixels → nearest LEGO colours ───────────────────────────
  const colorGrid: string[][] = [];
  const ldrawColorGrid: number[][] = [];

  for (let row = 0; row < heightStuds; row++) {
    const hexRow: string[] = [];
    const codeRow: number[] = [];

    for (let col = 0; col < widthStuds; col++) {
      const pixel: RGB = pixelData.pixels[row][col];
      const match = findNearestColor(pixel);

      hexRow.push(match.color.hex);
      codeRow.push(match.color.ldrawCode);
    }

    colorGrid.push(hexRow);
    ldrawColorGrid.push(codeRow);
  }

  // ── Step 3: Render the stud-grid preview ─────────────────────────────────
  const previewDataURL = generatePreviewDataURL(colorGrid);

  // ── Step 4: Generate the LDR file ────────────────────────────────────────
  const config = createMosaicConfig(widthStuds, heightStuds, pieceTypeToDat(pieceType));
  const ldrContent = generateLDR(config, ldrawColorGrid);

  // ── Step 5: Build the parts list ─────────────────────────────────────────
  const partNumber = datToPartNumber(pieceTypeToDat(pieceType));
  const partsList = buildPartsList(ldrawColorGrid, partNumber);
  const totalPieces = widthStuds * heightStuds;

  return {
    colorGrid,
    ldrawColorGrid,
    previewDataURL,
    ldrContent,
    partsList,
    totalPieces,
    config,
  };
}

// =============================================================================
// BrickLink Wanted List XML Export
// =============================================================================

/**
 * Generate a BrickLink Wanted List XML string from a mosaic result.
 * Users can upload this XML directly to BrickLink.com to create a wanted list,
 * then use Easy Buy to order all parts from one or more sellers.
 *
 * Format: https://www.bricklink.com/help.asp?helpID=207
 */
export function generateWantedListXML(result: MosaicResult): string {
  const items = result.partsList.map((entry) => {
    return [
      '  <ITEM>',
      '    <ITEMTYPE>P</ITEMTYPE>',
      `    <ITEMID>${entry.partNumber}</ITEMID>`,
      `    <COLOR>${entry.bricklinkColorId}</COLOR>`,
      `    <MINQTY>${entry.count}</MINQTY>`,
      '    <CONDITION>N</CONDITION>',
      '    <NOTIFY>N</NOTIFY>',
      '  </ITEM>',
    ].join('\n');
  });

  return ['<INVENTORY>', ...items, '</INVENTORY>', ''].join('\n');
}
