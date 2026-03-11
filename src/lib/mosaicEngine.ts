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
import { findNearestColor, byLdrawCode, ciede2000 } from './colors';
import { generateLDR, generateOptimizedLDR, createMosaicConfig } from './ldraw';
import type { MosaicConfig } from './ldraw';
import { processImage, generatePreviewDataURL } from './imageProcessor';
import { optimizePieces } from './pieceOptimizer';
import type { OptimizedMosaic, PlacedPiece } from './pieceOptimizer';

// Re-export types so consumers don't need separate imports.
export type { MosaicConfig, OptimizedMosaic, PlacedPiece };

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
  /** Total number of pieces across all colours. */
  totalPieces: number;
  /** The LDraw mosaic configuration that was used. */
  config: MosaicConfig;
  /** Optimization result (only present when optimize=true) */
  optimized: OptimizedMosaic | null;
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

/** Strip the ".dat" extension to get a bare LDraw part number. */
function datToPartNumber(dat: string): string {
  return dat.replace(/\.dat$/i, '');
}

/**
 * Map from LDraw part number (without .dat) to BrickLink catalog ID.
 * LDraw uses revision suffixes like 'b' (e.g. '3070b' = Tile 1x1 with Groove).
 * BrickLink's Wanted List XML upload requires the base part number without
 * the revision suffix for these parts.
 */
const LDRAW_TO_BRICKLINK_PART: ReadonlyMap<string, string> = new Map([
  // Tiles with 'b' revision in LDraw -> base number for BrickLink
  ['3070b', '3070'],
  ['3069b', '3069'],
  ['3068b', '3068'],
  // All other parts use the same ID in both systems
]);

/** Get the BrickLink part number for a given LDraw part number. */
function toBricklinkPartNumber(ldrawPart: string): string {
  return LDRAW_TO_BRICKLINK_PART.get(ldrawPart) ?? ldrawPart;
}

/**
 * Build a sorted parts list from the LDraw colour grid.
 *
 * Counts each unique LDraw colour, resolves it via `byLdrawCode`, and returns
 * the entries sorted by descending count (most-used colour first).
 */
function buildPartsList(
  ldrawColorGrid: number[][],
  ldrawPartNumber: string,
): PartsListEntry[] {
  const bricklinkPart = toBricklinkPartNumber(ldrawPartNumber);

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
      throw new Error(`Unknown LDraw colour code in grid: ${code}`);
    }

    entries.push({
      color: legoColor,
      count,
      bricklinkColorId: legoColor.bricklinkId,
      partNumber: bricklinkPart,
    });
  }

  // Most-used colours first; ties broken alphabetically by name.
  entries.sort((a, b) => b.count - a.count || a.color.name.localeCompare(b.color.name));

  return entries;
}

/**
 * Build a sorted parts list from optimized (mixed-size) pieces.
 *
 * Groups pieces by (partNumber, ldrawColor), counts each group, resolves
 * colors via `byLdrawCode`, and returns entries sorted by descending count
 * then alphabetically by name.
 */
function buildOptimizedPartsList(pieces: PlacedPiece[]): PartsListEntry[] {
  // Key: "bricklinkPartNumber|ldrawColor" -> count
  const counts = new Map<string, number>();

  for (const piece of pieces) {
    const blPart = toBricklinkPartNumber(piece.bricklinkPartNumber);
    const key = `${blPart}|${piece.ldrawColor}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const entries: PartsListEntry[] = [];

  for (const [key, count] of counts) {
    const [partNumber, ldrawCodeStr] = key.split('|');
    const ldrawCode = Number(ldrawCodeStr);
    const legoColor = byLdrawCode.get(ldrawCode);
    if (!legoColor) {
      throw new Error(`Unknown LDraw colour code in optimized pieces: ${ldrawCode}`);
    }

    entries.push({
      color: legoColor,
      count,
      bricklinkColorId: legoColor.bricklinkId,
      partNumber,
    });
  }

  // Most-used first; ties broken alphabetically by colour name.
  entries.sort((a, b) => b.count - a.count || a.color.name.localeCompare(b.color.name));

  return entries;
}

/**
 * Post-process the colour grids to eliminate rare/noisy colours.
 *
 * Any colour that accounts for fewer than `thresholdPercent` of all studs is
 * considered "rare".  Each rare-colour stud is reassigned to the nearest
 * (CIEDE2000) colour that IS above the threshold.
 *
 * This cleans up anti-aliasing artefacts like stray blue studs in an
 * otherwise all-purple image.
 */
function minimizeColorGrid(
  ldrawColorGrid: number[][],
  colorGrid: string[][],
  thresholdPercent: number = 2,
): { ldrawColorGrid: number[][]; colorGrid: string[][] } {
  // Count frequency of each LDraw color
  const counts = new Map<number, number>();
  let total = 0;
  for (const row of ldrawColorGrid) {
    for (const code of row) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
      total++;
    }
  }

  const threshold = total * (thresholdPercent / 100);

  // Split into kept vs rare
  const keptCodes: number[] = [];
  const rareCodes: number[] = [];
  for (const [code, count] of counts) {
    if (count >= threshold) {
      keptCodes.push(code);
    } else {
      rareCodes.push(code);
    }
  }

  // Nothing to do if there are no rare colors
  if (rareCodes.length === 0) {
    return { ldrawColorGrid, colorGrid };
  }

  // Build remap: rare color -> nearest kept color via CIEDE2000
  const remap = new Map<number, number>();
  for (const rareCode of rareCodes) {
    const rareLego = byLdrawCode.get(rareCode);
    if (!rareLego) continue;

    let bestCode = keptCodes[0];
    let bestDist = Infinity;
    for (const keptCode of keptCodes) {
      const keptLego = byLdrawCode.get(keptCode);
      if (!keptLego) continue;
      const d = ciede2000(rareLego.lab, keptLego.lab);
      if (d < bestDist) {
        bestDist = d;
        bestCode = keptCode;
      }
    }
    remap.set(rareCode, bestCode);
  }

  // Apply remapping
  const newLdraw: number[][] = [];
  const newColor: string[][] = [];
  for (let r = 0; r < ldrawColorGrid.length; r++) {
    const ldrawRow: number[] = [];
    const colorRow: string[] = [];
    for (let c = 0; c < ldrawColorGrid[r].length; c++) {
      const code = ldrawColorGrid[r][c];
      const remapped = remap.get(code);
      if (remapped !== undefined) {
        ldrawRow.push(remapped);
        const lego = byLdrawCode.get(remapped);
        colorRow.push(lego?.hex ?? colorGrid[r][c]);
      } else {
        ldrawRow.push(code);
        colorRow.push(colorGrid[r][c]);
      }
    }
    newLdraw.push(ldrawRow);
    newColor.push(colorRow);
  }

  return { ldrawColorGrid: newLdraw, colorGrid: newColor };
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
    /** When true, merge same-color regions into larger standard plates/tiles */
    optimize?: boolean;
    /** When true, merge rare colors into their nearest common color */
    minimizeColors?: boolean;
  },
): Promise<MosaicResult> {
  const { widthStuds, heightStuds } = size;
  const pieceType = options?.pieceType ?? '3070b';
  const optimize = options?.optimize ?? false;
  const minimizeColors = options?.minimizeColors ?? false;

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

  // ── Step 2b: Minimize colours (merge rare colours into common ones) ─────
  if (minimizeColors) {
    const merged = minimizeColorGrid(ldrawColorGrid, colorGrid);
    // Overwrite grids in place
    for (let r = 0; r < heightStuds; r++) {
      ldrawColorGrid[r] = merged.ldrawColorGrid[r];
      colorGrid[r] = merged.colorGrid[r];
    }
  }

  // ── Step 3: Render the stud-grid preview ─────────────────────────────────
  const previewDataURL = generatePreviewDataURL(colorGrid);

  // ── Step 4: Generate the LDR file ────────────────────────────────────────
  const config = createMosaicConfig(widthStuds, heightStuds, pieceTypeToDat(pieceType));

  let ldrContent: string;
  let partsList: PartsListEntry[];
  let totalPieces: number;
  let optimized: OptimizedMosaic | null = null;

  if (optimize) {
    // Run piece optimization: merge same-color regions into larger pieces.
    const optimizedResult = optimizePieces(
      ldrawColorGrid,
      pieceType === '3070b' ? 'tile' : 'plate',
    );
    optimized = optimizedResult;
    ldrContent = generateOptimizedLDR(config, optimizedResult.pieces);
    partsList = buildOptimizedPartsList(optimizedResult.pieces);
    totalPieces = optimizedResult.totalPieces;
  } else {
    // Non-optimized path: all 1×1 pieces.
    ldrContent = generateLDR(config, ldrawColorGrid);
    const partNumber = datToPartNumber(pieceTypeToDat(pieceType));
    partsList = buildPartsList(ldrawColorGrid, partNumber);
    totalPieces = widthStuds * heightStuds;
  }

  return {
    colorGrid,
    ldrawColorGrid,
    previewDataURL,
    ldrContent,
    partsList,
    totalPieces,
    config,
    optimized,
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
