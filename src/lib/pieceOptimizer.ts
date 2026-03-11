// =============================================================================
// Piece Optimizer — Greedy Rectangle Cover for LEGO Mosaics
//
// Reduces the total number of LEGO pieces in a mosaic by merging adjacent
// same-color 1×1 cells into larger standard plates or tiles. Uses a greedy
// approach: scan left-to-right, top-to-bottom, and at each unplaced cell
// place the largest available piece that fits.
//
// Supports both orientations for every piece (e.g., a 1×4 can cover a 1×4
// OR 4×1 region). When placed in the transposed orientation the `rotated`
// flag is set, which corresponds to a 90° Y-axis rotation in LDraw:
//
//   Identity matrix:  1 0 0   0 1 0   0 0 1
//   Rotated 90° Y:    0 0 -1  0 1 0   1 0 0
//
// Zero external dependencies.
// =============================================================================

// =============================================================================
// Types
// =============================================================================

/** A piece size definition with part numbers for both tile and plate variants. */
export interface PieceSize {
  /** Width in studs (first dimension as listed in LEGO catalogs) */
  width: number;
  /** Height in studs (second dimension) */
  height: number;
  /**
   * LDraw part number for the tile (smooth-top) variant.
   * Empty string if no tile variant exists at this size.
   */
  tilePartNumber: string;
  /**
   * LDraw part number for the plate (studded-top) variant.
   * Empty string if no plate variant exists at this size.
   */
  platePartNumber: string;
  /**
   * BrickLink part number for the tile variant (may differ from LDraw).
   * Empty string if no tile variant exists at this size.
   */
  tileBricklinkId: string;
  /**
   * BrickLink part number for the plate variant (may differ from LDraw).
   * Empty string if no plate variant exists at this size.
   */
  plateBricklinkId: string;
}

/** A placed piece in the optimized mosaic. */
export interface PlacedPiece {
  /** Top-left row in the grid (0-based) */
  row: number;
  /** Top-left column in the grid (0-based) */
  col: number;
  /** Studs wide as actually placed on the grid */
  width: number;
  /** Studs tall as actually placed on the grid */
  height: number;
  /** LDraw colour code for this piece */
  ldrawColor: number;
  /** LDraw part filename, e.g. "3068b.dat" */
  partNumber: string;
  /** BrickLink part number, e.g. "3068" */
  bricklinkPartNumber: string;
  /**
   * True if the piece is rotated 90 from its natural (cataloged) orientation.
   * In LDraw this maps to the rotation matrix: 0 0 -1  0 1 0  1 0 0
   */
  rotated: boolean;
}

/** Result of the piece optimization pass. */
export interface OptimizedMosaic {
  /** All placed pieces in scan order (top-to-bottom, left-to-right). */
  pieces: PlacedPiece[];
  /** Total number of pieces after optimization. */
  totalPieces: number;
  /** How many 1×1 pieces it would have been without optimization. */
  unoptimizedCount: number;
  /** Reduction percentage: (1 − totalPieces / unoptimizedCount) × 100 */
  reductionPercent: number;
}

// =============================================================================
// Piece Catalog
// =============================================================================

// Raw piece definitions. Each entry lists the natural (catalog) width × height,
// the tile part number (empty string if no tile exists), and the plate part
// number (empty string if no plate exists).
//
// We define every unique size that appears in either the tile or plate line-up.

const RAW_PIECE_DEFINITIONS: readonly PieceSize[] = [
  // Sizes available as BOTH tile and plate
  //                                          LDraw tile   LDraw plate  BL tile  BL plate
  { width: 1, height: 1, tilePartNumber: '3070b',  platePartNumber: '3024', tileBricklinkId: '3070',   plateBricklinkId: '3024' },
  { width: 1, height: 2, tilePartNumber: '3069b',  platePartNumber: '3023', tileBricklinkId: '3069',   plateBricklinkId: '3023' },
  { width: 1, height: 3, tilePartNumber: '63864',  platePartNumber: '3623', tileBricklinkId: '63864',  plateBricklinkId: '3623' },
  { width: 1, height: 4, tilePartNumber: '2431',   platePartNumber: '3710', tileBricklinkId: '2431',   plateBricklinkId: '3710' },
  { width: 1, height: 6, tilePartNumber: '6636',   platePartNumber: '3666', tileBricklinkId: '6636',   plateBricklinkId: '3666' },
  { width: 1, height: 8, tilePartNumber: '4162',   platePartNumber: '3460', tileBricklinkId: '4162',   plateBricklinkId: '3460' },
  { width: 2, height: 2, tilePartNumber: '3068b',  platePartNumber: '3022', tileBricklinkId: '3068',   plateBricklinkId: '3022' },
  { width: 2, height: 3, tilePartNumber: '26603',  platePartNumber: '3021', tileBricklinkId: '26603',  plateBricklinkId: '3021' },
  { width: 2, height: 4, tilePartNumber: '87079',  platePartNumber: '3020', tileBricklinkId: '87079',  plateBricklinkId: '3020' },

  // Sizes available as plate only (no tile variant)
  { width: 2, height: 6, tilePartNumber: '',        platePartNumber: '3795', tileBricklinkId: '',       plateBricklinkId: '3795' },
  { width: 2, height: 8, tilePartNumber: '',        platePartNumber: '3034', tileBricklinkId: '',       plateBricklinkId: '3034' },
  { width: 4, height: 4, tilePartNumber: '',        platePartNumber: '3031', tileBricklinkId: '',       plateBricklinkId: '3031' },
  { width: 4, height: 6, tilePartNumber: '',        platePartNumber: '3032', tileBricklinkId: '',       plateBricklinkId: '3032' },
  { width: 4, height: 8, tilePartNumber: '',        platePartNumber: '3035', tileBricklinkId: '',       plateBricklinkId: '3035' },
];

/**
 * Compute the aspect ratio for sorting: max(w,h) / min(w,h).
 * A perfectly square piece returns 1.0; elongated pieces return > 1.0.
 */
function aspectRatio(w: number, h: number): number {
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  return maxDim / minDim;
}

/**
 * All available LEGO piece sizes, pre-sorted for the greedy optimizer:
 *   1. Descending area (largest pieces tried first)
 *   2. Ascending aspect ratio for tie-breaking (squarer shapes preferred)
 */
export const AVAILABLE_PIECES: PieceSize[] = [...RAW_PIECE_DEFINITIONS].sort(
  (a, b) => {
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;

    // Primary: larger area first
    if (areaB !== areaA) {
      return areaB - areaA;
    }

    // Secondary: squarer shape first (lower aspect ratio)
    return aspectRatio(a.width, a.height) - aspectRatio(b.width, b.height);
  },
);

// =============================================================================
// Placement Candidate
// =============================================================================

/**
 * A candidate orientation for placing a piece at a given grid position.
 * We pre-compute both the natural and rotated orientations for every piece.
 */
interface PlacementCandidate {
  /** The underlying piece definition (natural dimensions + part numbers) */
  piece: PieceSize;
  /** Number of columns the piece spans in this orientation */
  placedWidth: number;
  /** Number of rows the piece spans in this orientation */
  placedHeight: number;
  /** Whether this candidate is the rotated (transposed) orientation */
  rotated: boolean;
}

/**
 * Build the full list of placement candidates from the available pieces,
 * filtered to the requested piece type. Each piece generates one candidate
 * for its natural orientation, plus a second candidate for the 90° rotation
 * (unless the piece is square, making the two orientations identical).
 *
 * Candidates are sorted by:
 *   1. Descending area
 *   2. Ascending aspect ratio (squarer first)
 *   3. Natural orientation before rotated (to keep output deterministic)
 */
function buildCandidates(pieceType: 'tile' | 'plate'): PlacementCandidate[] {
  const candidates: PlacementCandidate[] = [];

  for (const piece of AVAILABLE_PIECES) {
    // Filter: skip pieces that don't exist in the requested variant
    const partNum =
      pieceType === 'tile' ? piece.tilePartNumber : piece.platePartNumber;
    if (partNum === '') continue;

    // Natural orientation: width columns × height rows
    candidates.push({
      piece,
      placedWidth: piece.width,
      placedHeight: piece.height,
      rotated: false,
    });

    // Rotated orientation: height columns × width rows (skip if square)
    if (piece.width !== piece.height) {
      candidates.push({
        piece,
        placedWidth: piece.height,
        placedHeight: piece.width,
        rotated: true,
      });
    }
  }

  // Sort candidates so the greedy search always tries larger / squarer first.
  candidates.sort((a, b) => {
    const areaA = a.placedWidth * a.placedHeight;
    const areaB = b.placedWidth * b.placedHeight;

    // Primary: larger area first
    if (areaB !== areaA) return areaB - areaA;

    // Secondary: squarer shapes first
    const arA = aspectRatio(a.placedWidth, a.placedHeight);
    const arB = aspectRatio(b.placedWidth, b.placedHeight);
    if (arA !== arB) return arA - arB;

    // Tertiary: prefer natural orientation for determinism
    return (a.rotated ? 1 : 0) - (b.rotated ? 1 : 0);
  });

  return candidates;
}

// =============================================================================
// Greedy Optimizer
// =============================================================================

/**
 * Check whether a rectangular region starting at (row, col) with the given
 * dimensions is a valid placement:
 *   - All cells must be within grid bounds
 *   - All cells must have the same LDraw colour code as (row, col)
 *   - No cell may already be placed
 *
 * @param grid       - The LDraw colour grid [row][col]
 * @param placed     - Boolean grid tracking which cells are already covered
 * @param row        - Top-left row of the rectangle
 * @param col        - Top-left column of the rectangle
 * @param rectWidth  - Number of columns the rectangle spans
 * @param rectHeight - Number of rows the rectangle spans
 * @param numRows    - Total number of rows in the grid
 * @param numCols    - Total number of columns in the grid
 * @returns True if the rectangle is a valid placement
 */
function canPlace(
  grid: number[][],
  placed: boolean[][],
  row: number,
  col: number,
  rectWidth: number,
  rectHeight: number,
  numRows: number,
  numCols: number,
): boolean {
  // Bounds check: does the rectangle fit within the grid?
  if (row + rectHeight > numRows || col + rectWidth > numCols) {
    return false;
  }

  const targetColor = grid[row][col];

  for (let r = row; r < row + rectHeight; r++) {
    for (let c = col; c < col + rectWidth; c++) {
      // Cell already occupied by a previously placed piece
      if (placed[r][c]) return false;
      // Colour mismatch — the rectangle must be entirely one colour
      if (grid[r][c] !== targetColor) return false;
    }
  }

  return true;
}

/**
 * Mark a rectangular region as placed in the tracking grid.
 *
 * @param placed     - The boolean placement grid to update
 * @param row        - Top-left row
 * @param col        - Top-left column
 * @param rectWidth  - Number of columns
 * @param rectHeight - Number of rows
 */
function markPlaced(
  placed: boolean[][],
  row: number,
  col: number,
  rectWidth: number,
  rectHeight: number,
): void {
  for (let r = row; r < row + rectHeight; r++) {
    for (let c = col; c < col + rectWidth; c++) {
      placed[r][c] = true;
    }
  }
}

/**
 * Optimize a mosaic colour grid by merging same-color regions into larger
 * LEGO pieces.
 *
 * Algorithm (greedy rectangle cover):
 *   1. Build a boolean `placed[][]` grid (all false initially).
 *   2. Build a sorted list of placement candidates (both orientations for
 *      every eligible piece, largest area first, squarer shapes preferred).
 *   3. Scan the grid left-to-right, top-to-bottom.
 *   4. At each unplaced cell, iterate through candidates and pick the first
 *      (largest) one that fits — all cells in the rectangle must share the
 *      same colour and be unplaced.
 *   5. Record the placed piece, mark cells as placed, and continue.
 *
 * @param ldrawColorGrid - 2D array [row][col] of LDraw colour codes
 * @param pieceType      - 'tile' for smooth-top parts, 'plate' for studded
 * @returns Optimized placement result with piece list and statistics
 */
export function optimizePieces(
  ldrawColorGrid: number[][],
  pieceType: 'tile' | 'plate',
): OptimizedMosaic {
  // ── Validate input ──────────────────────────────────────────────────────
  const numRows = ldrawColorGrid.length;
  if (numRows === 0) {
    return {
      pieces: [],
      totalPieces: 0,
      unoptimizedCount: 0,
      reductionPercent: 0,
    };
  }
  const numCols = ldrawColorGrid[0].length;
  if (numCols === 0) {
    return {
      pieces: [],
      totalPieces: 0,
      unoptimizedCount: 0,
      reductionPercent: 0,
    };
  }

  // Verify that every row has the same number of columns
  for (let r = 0; r < numRows; r++) {
    if (ldrawColorGrid[r].length !== numCols) {
      throw new Error(
        `Row ${r} has ${ldrawColorGrid[r].length} columns, expected ${numCols}. ` +
        `The colour grid must be rectangular.`,
      );
    }
  }

  // ── Initialize tracking grid ────────────────────────────────────────────
  const placed: boolean[][] = Array.from({ length: numRows }, () =>
    new Array<boolean>(numCols).fill(false),
  );

  // ── Build sorted candidate list ─────────────────────────────────────────
  const candidates = buildCandidates(pieceType);

  // ── Greedy scan ─────────────────────────────────────────────────────────
  const pieces: PlacedPiece[] = [];

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      // Skip cells that are already covered by a previously placed piece
      if (placed[row][col]) continue;

      const color = ldrawColorGrid[row][col];

      // Try each candidate in priority order (largest area, squarest first)
      let matched = false;
      for (const candidate of candidates) {
        if (
          canPlace(
            ldrawColorGrid,
            placed,
            row,
            col,
            candidate.placedWidth,
            candidate.placedHeight,
            numRows,
            numCols,
          )
        ) {
          // Place this piece
          markPlaced(placed, row, col, candidate.placedWidth, candidate.placedHeight);

          // Resolve the correct part number for the requested piece type
          const basePartNumber =
            pieceType === 'tile'
              ? candidate.piece.tilePartNumber
              : candidate.piece.platePartNumber;

          const bricklinkPartNumber =
            pieceType === 'tile'
              ? candidate.piece.tileBricklinkId
              : candidate.piece.plateBricklinkId;

          pieces.push({
            row,
            col,
            width: candidate.placedWidth,
            height: candidate.placedHeight,
            ldrawColor: color,
            partNumber: `${basePartNumber}.dat`,
            bricklinkPartNumber,
            rotated: candidate.rotated,
          });

          matched = true;
          break; // Move on to the next unplaced cell
        }
      }

      // Safety net: should never happen since 1×1 is always available and
      // will always fit a single unplaced cell.
      if (!matched) {
        throw new Error(
          `Failed to place any piece at row=${row}, col=${col}. ` +
          `This should be impossible — check that 1×1 pieces are in the catalog.`,
        );
      }
    }
  }

  // ── Compute statistics ──────────────────────────────────────────────────
  const totalPieces = pieces.length;
  const unoptimizedCount = numRows * numCols;
  const reductionPercent =
    unoptimizedCount > 0
      ? Math.round(((unoptimizedCount - totalPieces) / unoptimizedCount) * 10000) / 100
      : 0;

  return {
    pieces,
    totalPieces,
    unoptimizedCount,
    reductionPercent,
  };
}
