// ============================================================================
// LDraw (.ldr) File Generation Module
// Generates BrickLink Studio 2.0 compatible LDraw files for LEGO mosaics.
//
// LDraw coordinate system:
//   - Y axis points DOWN (negative Y = upward)
//   - 1 stud = 20 LDU
//   - 1 plate height = 8 LDU
//
// Part reference line format:
//   1 <color> <x> <y> <z> <a> <b> <c> <d> <e> <f> <g> <h> <i> <part>.dat
//
// Identity rotation matrix: 1 0 0 0 1 0 0 0 1
// ============================================================================

/** LDU per stud spacing */
const LDU_PER_STUD = 20;

/** LDU per plate height */
const LDU_PER_PLATE_HEIGHT = 8;

/** Identity rotation matrix for LDraw part references */
const IDENTITY_MATRIX = '1 0 0 0 1 0 0 0 1';

/** 90-degree Y-axis rotation matrix for rotated pieces */
const ROTATED_90_Y_MATRIX = '0 0 -1 0 1 0 1 0 0';

/** Color code indicating an empty cell (no piece placed) */
const EMPTY_CELL = -1;

/**
 * Available baseplate definitions: size in studs → LDraw part number.
 * Origin is at center of each baseplate.
 *
 *   48×48 → 4186.dat  (studs from −470 to +470)
 *   32×32 → 3811.dat  (studs from −310 to +310)
 *   16×16 → 3867.dat  (studs from −150 to +150)
 */
const BASEPLATE_DEFINITIONS: ReadonlyMap<number, string> = new Map<number, string>([
  [48, '4186.dat'],
  [32, '3811.dat'],
  [16, '3867.dat'],
]);

/** Available baseplate sizes in descending order for layout selection */
const BASEPLATE_SIZES: readonly number[] = [48, 32, 16];

// ============================================================================
// Types
// ============================================================================

/** Configuration for a single baseplate type */
export interface BaseplateConfig {
  /** LDraw part filename (e.g. '3811.dat') */
  partNumber: string;
  /** Side length in studs (e.g. 32 for a 32×32 baseplate) */
  sizeStuds: number;
  /** LDraw color code for the baseplate */
  color: number;
}

/** Describes how baseplates tile to cover the mosaic area */
export interface BaseplateLayout {
  /** Which baseplate to use */
  baseplate: BaseplateConfig;
  /** Number of baseplates across (X direction) */
  cols: number;
  /** Number of baseplates deep (Z direction) */
  rows: number;
  /** Total studs covered in X */
  totalStudsW: number;
  /** Total studs covered in Z */
  totalStudsH: number;
}

/** Full configuration needed to generate a mosaic LDR file */
export interface MosaicConfig {
  /** Mosaic width in studs */
  widthStuds: number;
  /** Mosaic height in studs */
  heightStuds: number;
  /**
   * LDraw part filename for the 1×1 pieces.
   *   '3070b.dat' = 1×1 tile (smooth top, default)
   *   '3024.dat'  = 1×1 plate (has stud on top)
   */
  pieceType: string;
  /** How baseplates are arranged under the mosaic */
  baseplateLayout: BaseplateLayout;
}

// ============================================================================
// Baseplate Layout Calculation
// ============================================================================

/**
 * Determine the optimal baseplate arrangement to cover a mosaic of the given
 * dimensions. Tries each available baseplate size (48, 32, 16) and picks the
 * one requiring the fewest baseplates. Ties broken by least wasted studs.
 *
 * @param targetStudsW - Desired mosaic width in studs
 * @param targetStudsH - Desired mosaic height in studs
 * @param baseplateColor - LDraw color code for baseplates (default: 71 = Light Bluish Gray)
 * @returns The computed baseplate layout
 */
export function calculateBaseplateLayout(
  targetStudsW: number,
  targetStudsH: number,
  baseplateColor: number = 71,
): BaseplateLayout {
  if (targetStudsW <= 0 || targetStudsH <= 0) {
    throw new Error(
      `Mosaic dimensions must be positive: got ${targetStudsW}×${targetStudsH}`,
    );
  }

  let bestLayout: BaseplateLayout | null = null;
  let bestCount = Infinity;
  let bestWaste = Infinity;

  for (const size of BASEPLATE_SIZES) {
    const partNumber = BASEPLATE_DEFINITIONS.get(size);
    if (!partNumber) continue;

    const cols = Math.ceil(targetStudsW / size);
    const rows = Math.ceil(targetStudsH / size);
    const totalStudsW = cols * size;
    const totalStudsH = rows * size;
    const count = cols * rows;
    const waste = (totalStudsW * totalStudsH) - (targetStudsW * targetStudsH);

    if (count < bestCount || (count === bestCount && waste < bestWaste)) {
      bestCount = count;
      bestWaste = waste;
      bestLayout = {
        baseplate: {
          partNumber,
          sizeStuds: size,
          color: baseplateColor,
        },
        cols,
        rows,
        totalStudsW,
        totalStudsH,
      };
    }
  }

  // Guaranteed non-null because BASEPLATE_SIZES is non-empty
  return bestLayout!;
}

// ============================================================================
// Coordinate Helpers
// ============================================================================

/**
 * Compute the X or Z LDU offset for a stud on a baseplate whose origin is
 * at its center.
 *
 * General formula for an N-stud baseplate:
 *   offset = -(N × 10) + 10 + (index × 20)
 *
 * Example for 32-stud: col 0 → −310, col 31 → +310
 */
function studOffsetOnBaseplate(index: number, baseplateStuds: number): number {
  return -(baseplateStuds * 10) + 10 + (index * LDU_PER_STUD);
}

/**
 * Compute the center position (in LDU) of a baseplate in a multi-baseplate
 * grid.
 *
 *   position = gridIndex × (baseplateStuds × 20)
 */
function baseplateCenter(gridIndex: number, baseplateStuds: number): number {
  return gridIndex * (baseplateStuds * LDU_PER_STUD);
}

/**
 * Compute the world-space X or Z coordinate for a tile at a given global
 * stud column/row in a multi-baseplate layout.
 *
 * @param globalIndex  - The global stud index (col or row, 0-based)
 * @param baseplateStuds - Side length of each baseplate in studs
 * @returns The LDU coordinate for that stud
 */
function tileWorldCoord(globalIndex: number, baseplateStuds: number): number {
  const bpIndex = Math.floor(globalIndex / baseplateStuds);
  const localIndex = globalIndex % baseplateStuds;
  return baseplateCenter(bpIndex, baseplateStuds) +
    studOffsetOnBaseplate(localIndex, baseplateStuds);
}

// ============================================================================
// LDraw Line Builders
// ============================================================================

/** Build an LDraw comment / meta line (type 0) */
function commentLine(text: string): string {
  return `0 ${text}`;
}

/**
 * Build an LDraw part reference line (type 1) with identity rotation.
 *
 * Format: 1 <color> <x> <y> <z> 1 0 0 0 1 0 0 0 1 <part>
 */
function partLine(
  color: number,
  x: number,
  y: number,
  z: number,
  part: string,
): string {
  return `1 ${color} ${x} ${y} ${z} ${IDENTITY_MATRIX} ${part}`;
}

/**
 * Build an LDraw part reference line (type 1) with a custom rotation matrix.
 *
 * Format: 1 <color> <x> <y> <z> <rotation matrix> <part>
 */
export function partLineWithMatrix(
  color: number,
  x: number,
  y: number,
  z: number,
  rotationMatrix: string,
  part: string,
): string {
  return `1 ${color} ${x} ${y} ${z} ${rotationMatrix} ${part}`;
}

// ============================================================================
// LDR File Generation
// ============================================================================

/**
 * Generate a complete LDraw (.ldr) file string for a mosaic.
 *
 * The file contains two layers separated by STEP commands:
 *   1. Baseplates at y = 0
 *   2. Tiles / plates at y = −8  (one plate height above the baseplate)
 *
 * @param config    - Mosaic configuration (dimensions, piece type, baseplate layout)
 * @param colorGrid - 2D array [row][col] of LDraw color codes.
 *                    Use −1 for empty cells (no piece placed).
 *                    Row 0 is the top of the mosaic.
 * @returns The full .ldr file content as a string
 */
export function generateLDR(
  config: MosaicConfig,
  colorGrid: number[][],
): string {
  validateInputs(config, colorGrid);

  const lines: string[] = [];
  const { baseplateLayout, pieceType, widthStuds, heightStuds } = config;
  const { baseplate } = baseplateLayout;
  const bpStuds = baseplate.sizeStuds;

  // -- Header ----------------------------------------------------------------
  lines.push(commentLine('Mosaic'));
  lines.push(commentLine('Name: mosaic.ldr'));
  lines.push(commentLine('Author: Mosaic Creator'));
  lines.push(commentLine(`Mosaic size: ${widthStuds} x ${heightStuds} studs`));
  lines.push(commentLine(
    `Baseplates: ${baseplateLayout.cols} x ${baseplateLayout.rows}` +
    ` of ${bpStuds}x${bpStuds} (${baseplate.partNumber})`,
  ));
  lines.push(commentLine(`Piece type: ${pieceType}`));
  lines.push(commentLine(''));

  // -- Layer 1: Baseplates at y = 0 ------------------------------------------
  lines.push(commentLine('Baseplates'));
  for (let bpRow = 0; bpRow < baseplateLayout.rows; bpRow++) {
    for (let bpCol = 0; bpCol < baseplateLayout.cols; bpCol++) {
      const x = baseplateCenter(bpCol, bpStuds);
      const z = baseplateCenter(bpRow, bpStuds);
      lines.push(partLine(baseplate.color, x, 0, z, baseplate.partNumber));
    }
  }
  lines.push(commentLine('STEP'));
  lines.push(commentLine(''));

  // -- Layer 2: Tiles / plates at y = -8 (one plate height above) ------------
  lines.push(commentLine('Tiles'));
  const tileY = -LDU_PER_PLATE_HEIGHT;

  for (let row = 0; row < heightStuds; row++) {
    for (let col = 0; col < widthStuds; col++) {
      const color = colorGrid[row][col];

      // Skip empty cells
      if (color === EMPTY_CELL) {
        continue;
      }

      const x = tileWorldCoord(col, bpStuds);
      const z = tileWorldCoord(row, bpStuds);

      lines.push(partLine(color, x, tileY, z, pieceType));
    }
  }
  lines.push(commentLine('STEP'));

  // Trailing newline for POSIX compliance
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// Input Validation
// ============================================================================

/**
 * Validate that the color grid matches the declared mosaic dimensions.
 */
function validateInputs(config: MosaicConfig, colorGrid: number[][]): void {
  const { widthStuds, heightStuds } = config;

  if (colorGrid.length !== heightStuds) {
    throw new Error(
      `colorGrid has ${colorGrid.length} rows but config.heightStuds is ${heightStuds}`,
    );
  }

  for (let row = 0; row < heightStuds; row++) {
    if (colorGrid[row].length !== widthStuds) {
      throw new Error(
        `colorGrid row ${row} has ${colorGrid[row].length} columns but config.widthStuds is ${widthStuds}`,
      );
    }
  }
}

// ============================================================================
// Convenience Factory
// ============================================================================

/**
 * Create a MosaicConfig with sensible defaults.
 *
 * @param widthStuds    - Mosaic width in studs
 * @param heightStuds   - Mosaic height in studs
 * @param pieceType     - Part filename (default: '3070b.dat' = 1×1 tile)
 * @param baseplateColor - LDraw color code (default: 71 = Light Bluish Gray)
 * @returns A fully populated MosaicConfig
 */
export function createMosaicConfig(
  widthStuds: number,
  heightStuds: number,
  pieceType: string = '3070b.dat',
  baseplateColor: number = 71,
): MosaicConfig {
  return {
    widthStuds,
    heightStuds,
    pieceType,
    baseplateLayout: calculateBaseplateLayout(widthStuds, heightStuds, baseplateColor),
  };
}

// ============================================================================
// Optimized LDR Generation (Multi-Size Pieces)
// ============================================================================

import type { PlacedPiece } from './pieceOptimizer';

/**
 * Generate an LDR file from optimized piece placements (mixed sizes).
 * Each PlacedPiece has row, col, width, height, ldrawColor, partNumber (.dat),
 * and rotated flag.
 *
 * LDraw part files have their second catalog dimension (height) along X and
 * their first catalog dimension (width) along Z.  On the placement grid,
 * columns are X and rows are Z.
 *
 * When rotated is false (width cols × height rows), the grid has width in X
 * and height in Z — swapped relative to the LDraw part's native axes — so a
 * 90-degree Y rotation is applied: 0 0 -1 0 1 0 1 0 0
 *
 * When rotated is true (height cols × width rows), the grid has height in X
 * and width in Z, matching the LDraw native layout, so identity is used:
 * 1 0 0 0 1 0 0 0 1
 *
 * @param config - Mosaic configuration (dimensions, piece type, baseplate layout)
 * @param pieces - Array of optimized placed pieces with position, size, color,
 *                 part number, and rotation info
 * @returns The full .ldr file content as a string
 */
export function generateOptimizedLDR(
  config: MosaicConfig,
  pieces: PlacedPiece[],
): string {
  const lines: string[] = [];
  const { baseplateLayout, pieceType, widthStuds, heightStuds } = config;
  const { baseplate } = baseplateLayout;
  const bpStuds = baseplate.sizeStuds;

  // -- Header ----------------------------------------------------------------
  lines.push(commentLine('Mosaic'));
  lines.push(commentLine('Name: mosaic.ldr'));
  lines.push(commentLine('Author: Mosaic Creator'));
  lines.push(commentLine(`Mosaic size: ${widthStuds} x ${heightStuds} studs`));
  lines.push(commentLine(
    `Baseplates: ${baseplateLayout.cols} x ${baseplateLayout.rows}` +
    ` of ${bpStuds}x${bpStuds} (${baseplate.partNumber})`,
  ));
  lines.push(commentLine(`Piece type: ${pieceType}`));
  lines.push(commentLine(''));

  // -- Layer 1: Baseplates at y = 0 ------------------------------------------
  lines.push(commentLine('Baseplates'));
  for (let bpRow = 0; bpRow < baseplateLayout.rows; bpRow++) {
    for (let bpCol = 0; bpCol < baseplateLayout.cols; bpCol++) {
      const x = baseplateCenter(bpCol, bpStuds);
      const z = baseplateCenter(bpRow, bpStuds);
      lines.push(partLine(baseplate.color, x, 0, z, baseplate.partNumber));
    }
  }
  lines.push(commentLine('STEP'));
  lines.push(commentLine(''));

  // -- Layer 2: Optimized tiles / plates at y = -8 ---------------------------
  lines.push(commentLine('Tiles'));
  const tileY = -LDU_PER_PLATE_HEIGHT;

  for (const piece of pieces) {
    // Compute center X from leftmost and rightmost stud positions
    const xLeft = tileWorldCoord(piece.col, bpStuds);
    const xRight = tileWorldCoord(piece.col + piece.width - 1, bpStuds);
    const centerX = (xLeft + xRight) / 2;

    // Compute center Z from topmost and bottommost stud positions
    const zTop = tileWorldCoord(piece.row, bpStuds);
    const zBottom = tileWorldCoord(piece.row + piece.height - 1, bpStuds);
    const centerZ = (zTop + zBottom) / 2;

    // Select rotation matrix based on the rotated flag
    const matrix = piece.rotated ? IDENTITY_MATRIX : ROTATED_90_Y_MATRIX;

    lines.push(partLineWithMatrix(
      piece.ldrawColor,
      centerX,
      tileY,
      centerZ,
      matrix,
      piece.partNumber,
    ));
  }
  lines.push(commentLine('STEP'));

  // Trailing newline for POSIX compliance
  lines.push('');

  return lines.join('\n');
}
