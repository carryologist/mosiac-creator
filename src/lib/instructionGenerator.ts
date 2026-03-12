// =============================================================================
// Instruction PDF Generator
//
// Generates a multi-page PDF instruction booklet for building a LEGO mosaic.
//
// Pages:
//   1. Cover — mosaic preview, dimensions, piece count
//   2. Legend — number → color (non-optimized) or number → part+color (optimized)
//   3. Bill of materials — parts list table
//   4+. Section pages — one per 16×16 sub-section, numbered grid with
//       color fills, major grid lines every 8 studs, piece boundaries
//
// When piece optimization is enabled, the numbering scheme changes from
// "1 = Black, 2 = White" to "1 = Black 3035 (4×8), 2 = Black 3460 (1×8), ..."
// so that every stud in the grid shows which specific part covers it.
//
// Uses jsPDF for vector PDF generation (small file sizes, crisp at any zoom).
// Zero external API calls — runs entirely in the browser.
// =============================================================================

import { jsPDF } from 'jspdf';
import type { MosaicResult } from './mosaicEngine';
import type { LegoColor } from './colors';
import { byLdrawCode } from './colors';

// =============================================================================
// Constants
// =============================================================================

/** A4 dimensions in mm */
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const USABLE_W = PAGE_W - 2 * MARGIN;
const USABLE_H = PAGE_H - 2 * MARGIN;

// Colors for the PDF theme
const TEXT_DARK = '#1e293b';
const TEXT_MID = '#64748b';
const TEXT_LIGHT = '#94a3b8';
const LINE_COLOR = '#cbd5e1';
const BG_LIGHT = '#f1f5f9';

/** Each instruction page covers at most this many studs per axis. */
const SUB_SECTION_SIZE = 16;

/** Thicker grid lines are drawn at this interval for visual orientation. */
const MAJOR_LINE_INTERVAL = 8;

// =============================================================================
// Types
// =============================================================================

/** A numbered entry in the instruction legend (color or part+color). */
interface NumberedEntry {
  /** Sequential number shown in the grid (1, 2, 3, ...) */
  number: number;
  /** LDraw color code */
  ldrawCode: number;
  /** Full LEGO color data */
  legoColor: LegoColor;
  /** Count: studs (non-optimized) or pieces (optimized) */
  count: number;
  /** BrickLink part number, e.g. "3035" (optimized mode only) */
  partId?: string;
  /** Piece dimensions, e.g. "4×8" (optimized mode only) */
  pieceDims?: string;
}

/** Result of the numbering pass used throughout PDF generation. */
interface NumberingResult {
  /** Map from sequential number → entry details. */
  entries: Map<number, NumberedEntry>;
  /** [row][col] → entry number, for grid cell labels. */
  grid: number[][];
  /** True when entries represent part+color combos, false for color-only. */
  isPartLevel: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Choose black or white text for readability on a given background color.
 * Uses perceived luminance (ITU-R BT.601).
 */
function contrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 0.45 ? '#000000' : '#FFFFFF';
}

/** Parse a hex color string to [r, g, b] values 0-255. */
function hexToRgbTuple(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * Build the numbering scheme for instruction pages.
 *
 * Non-optimized mode: numbers represent colors, sorted by stud frequency.
 * Optimized mode: numbers represent unique (part + color) combos, sorted
 * by piece count descending.
 */
function buildNumbering(result: MosaicResult): NumberingResult {
  const { widthStuds, heightStuds } = result.config;

  if (result.optimized && result.optimized.pieces.length > 0) {
    // -- Optimized: number by unique (part, color) combos ------------------
    const pieces = result.optimized.pieces;

    // Count each combo
    const combos = new Map<string, {
      ldrawCode: number;
      partId: string;
      width: number;
      height: number;
      count: number;
    }>();

    for (const piece of pieces) {
      const key = `${piece.bricklinkPartNumber}_${piece.ldrawColor}`;
      let entry = combos.get(key);
      if (!entry) {
        entry = {
          ldrawCode: piece.ldrawColor,
          partId: piece.bricklinkPartNumber,
          width: piece.width,
          height: piece.height,
          count: 0,
        };
        combos.set(key, entry);
      }
      entry.count++;
    }

    // Sort by count descending
    const sorted = [...combos.entries()].sort((a, b) => b[1].count - a[1].count);

    // Build entries and key→number lookup
    const entries = new Map<number, NumberedEntry>();
    const keyToNum = new Map<string, number>();
    let num = 1;

    for (const [key, combo] of sorted) {
      const legoColor = byLdrawCode.get(combo.ldrawCode);
      if (!legoColor) continue;
      // Canonical dimensions: smaller × larger (matches catalog convention)
      const lo = Math.min(combo.width, combo.height);
      const hi = Math.max(combo.width, combo.height);
      entries.set(num, {
        number: num,
        ldrawCode: combo.ldrawCode,
        legoColor,
        count: combo.count,
        partId: combo.partId,
        pieceDims: `${lo}\u00d7${hi}`,
      });
      keyToNum.set(key, num);
      num++;
    }

    // Build per-cell grid
    const grid: number[][] = Array.from(
      { length: heightStuds },
      () => new Array<number>(widthStuds).fill(0),
    );
    for (const piece of pieces) {
      const key = `${piece.bricklinkPartNumber}_${piece.ldrawColor}`;
      const n = keyToNum.get(key) ?? 0;
      for (let r = piece.row; r < piece.row + piece.height && r < heightStuds; r++) {
        for (let c = piece.col; c < piece.col + piece.width && c < widthStuds; c++) {
          grid[r][c] = n;
        }
      }
    }

    return { entries, grid, isPartLevel: true };
  }

  // -- Non-optimized: number by color --------------------------------------
  const counts = new Map<number, number>();
  for (const row of result.ldrawColorGrid) {
    for (const code of row) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const entries = new Map<number, NumberedEntry>();
  const codeToNum = new Map<number, number>();
  let num = 1;

  for (const [code, count] of sorted) {
    const legoColor = byLdrawCode.get(code);
    if (!legoColor) continue;
    entries.set(num, {
      number: num,
      ldrawCode: code,
      legoColor,
      count,
    });
    codeToNum.set(code, num);
    num++;
  }

  const grid: number[][] = result.ldrawColorGrid.map((row) =>
    row.map((code) => codeToNum.get(code) ?? 0),
  );

  return { entries, grid, isPartLevel: false };
}

/** Get entries sorted by number. */
function sortedEntries(entries: Map<number, NumberedEntry>): NumberedEntry[] {
  return [...entries.values()].sort((a, b) => a.number - b.number);
}

// =============================================================================
// PDF Drawing Helpers
// =============================================================================

/** Set fill color from a hex string. */
function setFill(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgbTuple(hex);
  doc.setFillColor(r, g, b);
}

/** Set draw (stroke) color from a hex string. */
function setStroke(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgbTuple(hex);
  doc.setDrawColor(r, g, b);
}

/** Set text color from a hex string. */
function setTextColor(doc: jsPDF, hex: string): void {
  const [r, g, b] = hexToRgbTuple(hex);
  doc.setTextColor(r, g, b);
}

/** Draw a filled rectangle. */
function fillRect(doc: jsPDF, x: number, y: number, w: number, h: number, hex: string): void {
  setFill(doc, hex);
  doc.rect(x, y, w, h, 'F');
}

/** Draw a stroked rectangle. */
function strokeRect(doc: jsPDF, x: number, y: number, w: number, h: number, hex: string, lineWidth = 0.2): void {
  setStroke(doc, hex);
  doc.setLineWidth(lineWidth);
  doc.rect(x, y, w, h, 'S');
}

/** Draw centered text within a box. */
function centeredText(doc: jsPDF, text: string, x: number, y: number, w: number, h: number, hex: string, fontSize: number): void {
  doc.setFontSize(fontSize);
  setTextColor(doc, hex);
  const textW = doc.getTextWidth(text);
  const textX = x + (w - textW) / 2;
  // Vertical centering: jsPDF text baseline is at the y coordinate.
  // Approximate: place at y + h/2 + fontSize_in_mm * 0.35
  const fontMm = fontSize * 0.353; // 1pt = 0.353mm
  const textY = y + h / 2 + fontMm * 0.35;
  doc.text(text, textX, textY);
}

// =============================================================================
// Page Renderers
// =============================================================================

/**
 * Render the cover page with mosaic preview, dimensions, and stats.
 */
function renderCoverPage(
  doc: jsPDF,
  result: MosaicResult,
  numbering: NumberingResult,
): void {
  const { widthStuds, heightStuds } = result.config;
  const layout = result.config.baseplateLayout;
  const bpSize = layout.baseplate.sizeStuds;

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  setTextColor(doc, TEXT_DARK);
  doc.text('LEGO Mosaic', PAGE_W / 2, 35, { align: 'center' });
  doc.text('Building Instructions', PAGE_W / 2, 45, { align: 'center' });

  // Mosaic preview — draw colored grid centered on page
  const previewMaxW = 140;
  const previewMaxH = 140;
  const cellSize = Math.min(previewMaxW / widthStuds, previewMaxH / heightStuds);
  const gridW = cellSize * widthStuds;
  const gridH = cellSize * heightStuds;
  const gridX = (PAGE_W - gridW) / 2;
  const gridY = 60;

  for (let row = 0; row < heightStuds; row++) {
    for (let col = 0; col < widthStuds; col++) {
      const hex = result.colorGrid[row][col];
      fillRect(doc, gridX + col * cellSize, gridY + row * cellSize, cellSize, cellSize, hex);
    }
  }
  strokeRect(doc, gridX, gridY, gridW, gridH, TEXT_MID, 0.3);

  // Stats below preview
  const statsY = gridY + gridH + 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  setTextColor(doc, TEXT_MID);

  // Count unique colors
  const uniqueColors = new Set(result.ldrawColorGrid.flat()).size;

  const stats = [
    `${widthStuds} \u00d7 ${heightStuds} studs`,
    `${layout.cols} \u00d7 ${layout.rows} baseplate${layout.cols * layout.rows > 1 ? 's' : ''} (${bpSize}\u00d7${bpSize})`,
    `${result.totalPieces.toLocaleString()} pieces`,
    `${uniqueColors} color${uniqueColors !== 1 ? 's' : ''}` +
      (numbering.isPartLevel ? `, ${numbering.entries.size} unique parts` : ''),
  ];

  stats.forEach((line, i) => {
    doc.text(line, PAGE_W / 2, statsY + i * 7, { align: 'center' });
  });

  // Footer
  doc.setFontSize(9);
  setTextColor(doc, TEXT_LIGHT);
  doc.text('Generated by LEGO Mosaic Creator', PAGE_W / 2, PAGE_H - 15, { align: 'center' });
}

/**
 * Render the legend page.
 *
 * Non-optimized: maps numbers to LEGO colors.
 * Optimized: maps numbers to (part + color) combos.
 */
function renderLegend(
  doc: jsPDF,
  numbering: NumberingResult,
  totalStuds: number,
): void {
  const isPartLevel = numbering.isPartLevel;
  const title = isPartLevel ? 'Parts Legend' : 'Color Legend';
  const subtitle = isPartLevel
    ? `${numbering.entries.size} unique parts`
    : `${numbering.entries.size} colors used`;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setTextColor(doc, TEXT_DARK);
  doc.text(title, MARGIN, MARGIN + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, TEXT_MID);
  doc.text(subtitle, MARGIN, MARGIN + 15);

  // Legend entries
  const entries = sortedEntries(numbering.entries);
  const startY = MARGIN + 25;
  const rowHeight = 9;
  const swatchSize = 6;
  const maxPerPage = Math.floor((USABLE_H - 25) / rowHeight);

  entries.forEach((entry, i) => {
    const pageIndex = Math.floor(i / maxPerPage);
    if (pageIndex > 0 && i % maxPerPage === 0) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      setTextColor(doc, TEXT_DARK);
      doc.text(`${title} (continued)`, MARGIN, MARGIN + 8);
    }

    const rowI = i % maxPerPage;
    const y = startY + rowI * rowHeight;

    // Number badge
    fillRect(doc, MARGIN, y, swatchSize, swatchSize, entry.legoColor.hex);
    centeredText(
      doc,
      String(entry.number),
      MARGIN, y, swatchSize, swatchSize,
      contrastText(entry.legoColor.hex),
      7,
    );
    strokeRect(doc, MARGIN, y, swatchSize, swatchSize, LINE_COLOR, 0.15);

    // Color name
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    setTextColor(doc, TEXT_DARK);
    doc.text(entry.legoColor.name, MARGIN + swatchSize + 4, y + 4.2);

    if (isPartLevel && entry.partId) {
      // Part info: "3035 (4×8)"
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextColor(doc, TEXT_MID);
      doc.text(`${entry.partId} (${entry.pieceDims})`, MARGIN + 50, y + 4.2);

      // Count: "×43"
      doc.text(`\u00d7${entry.count.toLocaleString()}`, MARGIN + 95, y + 4.2);
    } else {
      // Hex value
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      setTextColor(doc, TEXT_MID);
      doc.text(entry.legoColor.hex, MARGIN + 70, y + 4.2);

      // Count and percentage
      const pct = ((entry.count / totalStuds) * 100).toFixed(1);
      doc.text(`${entry.count.toLocaleString()} studs (${pct}%)`, MARGIN + 95, y + 4.2);
    }
  });
}

/**
 * Render the bill of materials page.
 */
function renderBOM(
  doc: jsPDF,
  result: MosaicResult,
): void {
  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setTextColor(doc, TEXT_DARK);
  doc.text('Bill of Materials', MARGIN, MARGIN + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, TEXT_MID);
  doc.text(`${result.totalPieces.toLocaleString()} total pieces`, MARGIN, MARGIN + 15);

  // Table header
  const startY = MARGIN + 24;
  const colX = { part: MARGIN, color: MARGIN + 45, qty: MARGIN + 130 };
  const rowHeight = 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setTextColor(doc, TEXT_MID);
  doc.text('PART', colX.part, startY);
  doc.text('COLOR', colX.color, startY);
  doc.text('QTY', colX.qty, startY);

  // Divider line
  setStroke(doc, LINE_COLOR);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, startY + 2, MARGIN + USABLE_W, startY + 2);

  // Table rows
  const maxPerPage = Math.floor((USABLE_H - 30) / rowHeight);
  let rowIndex = 0;

  for (const entry of result.partsList) {
    if (rowIndex > 0 && rowIndex % maxPerPage === 0) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      setTextColor(doc, TEXT_DARK);
      doc.text('Bill of Materials (continued)', MARGIN, MARGIN + 8);
      rowIndex = 0;
    }

    const y = startY + 6 + rowIndex * rowHeight;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setTextColor(doc, TEXT_DARK);
    doc.text(entry.partNumber, colX.part, y);

    // Color swatch + name
    const swatchY = y - 3.5;
    fillRect(doc, colX.color, swatchY, 4, 4, entry.color.hex);
    strokeRect(doc, colX.color, swatchY, 4, 4, LINE_COLOR, 0.1);
    doc.text(entry.color.name, colX.color + 6, y);

    doc.text(entry.count.toLocaleString(), colX.qty, y);
    rowIndex++;
  }

  // Baseplates
  const layout = result.config.baseplateLayout;
  const bpCount = layout.rows * layout.cols;
  if (rowIndex % maxPerPage === 0 && rowIndex > 0) {
    doc.addPage();
    rowIndex = 0;
  }
  const bpY = startY + 6 + rowIndex * rowHeight;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setTextColor(doc, TEXT_MID);
  doc.text(
    `+ ${bpCount} \u00d7 ${layout.baseplate.sizeStuds}\u00d7${layout.baseplate.sizeStuds} baseplate (${layout.baseplate.partNumber})`,
    colX.part,
    bpY + rowHeight,
  );
}

/**
 * Render a section page for one sub-section of the mosaic.
 */
function renderSectionPage(
  doc: jsPDF,
  result: MosaicResult,
  numbering: NumberingResult,
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number,
  sectionNum: number,
  totalSections: number,
  gridRow: number,
  gridCol: number,
  gridRows: number,
  gridCols: number,
): void {
  const sectionW = endCol - startCol;
  const sectionH = endRow - startRow;

  // -- Header ---------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  setTextColor(doc, TEXT_DARK);
  doc.text(`Section ${sectionNum} of ${totalSections}`, MARGIN, MARGIN + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, TEXT_MID);
  doc.text(
    `Rows ${startRow + 1}\u2013${endRow}, columns ${startCol + 1}\u2013${endCol}`,
    MARGIN,
    MARGIN + 15,
  );

  // -- Locator thumbnail (multi-section only) -------------------------------
  if (totalSections > 1) {
    const thumbSize = 24;
    const thumbX = PAGE_W - MARGIN - thumbSize;
    const thumbY = MARGIN + 2;
    const thumbCellW = thumbSize / gridCols;
    const thumbCellH = thumbSize / gridRows;

    for (let tr = 0; tr < gridRows; tr++) {
      for (let tc = 0; tc < gridCols; tc++) {
        const isCurrent = tr === gridRow && tc === gridCol;
        fillRect(
          doc,
          thumbX + tc * thumbCellW,
          thumbY + tr * thumbCellH,
          thumbCellW,
          thumbCellH,
          isCurrent ? '#3b82f6' : BG_LIGHT,
        );
        strokeRect(
          doc,
          thumbX + tc * thumbCellW,
          thumbY + tr * thumbCellH,
          thumbCellW,
          thumbCellH,
          isCurrent ? '#2563eb' : LINE_COLOR,
          0.3,
        );
      }
    }
  }

  // -- Grid layout calculation ----------------------------------------------
  const gridTopMargin = MARGIN + 22;
  const labelSpace = 8; // mm reserved for row/column number labels
  const availW = USABLE_W - labelSpace;
  const availH = USABLE_H - (gridTopMargin - MARGIN) - labelSpace - 20; // 20mm for parts summary
  const cellSize = Math.min(availW / sectionW, availH / sectionH);
  const gridW = cellSize * sectionW;
  const gridH = cellSize * sectionH;
  const gridX = MARGIN + labelSpace + (availW - gridW) / 2;
  const gridY = gridTopMargin + labelSpace;

  // Font size scales with cell size, clamped
  const numFontSize = Math.max(4, Math.min(9, cellSize * 1.8));

  // -- Column numbers -------------------------------------------------------
  doc.setFont('helvetica', 'normal');
  const labelFontSize = Math.max(4, Math.min(7, cellSize * 1.2));
  doc.setFontSize(labelFontSize);
  setTextColor(doc, TEXT_MID);

  for (let c = 0; c < sectionW; c++) {
    const label = String(startCol + c + 1);
    const lw = doc.getTextWidth(label);
    doc.text(label, gridX + c * cellSize + (cellSize - lw) / 2, gridY - 1.5);
  }

  // -- Row numbers ----------------------------------------------------------
  for (let r = 0; r < sectionH; r++) {
    const label = String(startRow + r + 1);
    const fontMm = labelFontSize * 0.353;
    doc.text(
      label,
      gridX - 2,
      gridY + r * cellSize + cellSize / 2 + fontMm * 0.35,
      { align: 'right' },
    );
  }

  // -- Grid cells -----------------------------------------------------------
  for (let r = 0; r < sectionH; r++) {
    for (let c = 0; c < sectionW; c++) {
      const globalRow = startRow + r;
      const globalCol = startCol + c;
      const hex = result.colorGrid[globalRow][globalCol];
      const entryNum = numbering.grid[globalRow]?.[globalCol] ?? 0;
      const numStr = entryNum > 0 ? String(entryNum) : '?';

      const cx = gridX + c * cellSize;
      const cy = gridY + r * cellSize;

      // Fill with LEGO color
      fillRect(doc, cx, cy, cellSize, cellSize, hex);

      // Entry number
      centeredText(doc, numStr, cx, cy, cellSize, cellSize, contrastText(hex), numFontSize);
    }
  }

  // Grid border
  strokeRect(doc, gridX, gridY, gridW, gridH, TEXT_MID, 0.3);

  // Internal grid lines
  setStroke(doc, LINE_COLOR);
  doc.setLineWidth(0.1);
  for (let c = 1; c < sectionW; c++) {
    const x = gridX + c * cellSize;
    doc.line(x, gridY, x, gridY + gridH);
  }
  for (let r = 1; r < sectionH; r++) {
    const y = gridY + r * cellSize;
    doc.line(gridX, y, gridX + gridW, y);
  }

  // -- Major grid lines every N studs for orientation -----------------------
  setStroke(doc, TEXT_MID);
  doc.setLineWidth(0.25);
  for (let c = 1; c < sectionW; c++) {
    if ((startCol + c) % MAJOR_LINE_INTERVAL === 0) {
      const x = gridX + c * cellSize;
      doc.line(x, gridY, x, gridY + gridH);
    }
  }
  for (let r = 1; r < sectionH; r++) {
    if ((startRow + r) % MAJOR_LINE_INTERVAL === 0) {
      const y = gridY + r * cellSize;
      doc.line(gridX, y, gridX + gridW, y);
    }
  }

  // -- Piece boundaries (optimized mode) -----------------------------------
  if (result.optimized) {
    const PIECE_BORDER_COLOR = '#334155';
    const PIECE_BORDER_WIDTH = 0.4;

    for (const piece of result.optimized.pieces) {
      const pieceEndRow = piece.row + piece.height;
      const pieceEndCol = piece.col + piece.width;

      // Skip pieces that don't overlap this section
      if (piece.row >= endRow || pieceEndRow <= startRow) continue;
      if (piece.col >= endCol || pieceEndCol <= startCol) continue;

      // Clip to section bounds
      const clampedR1 = Math.max(piece.row, startRow);
      const clampedR2 = Math.min(pieceEndRow, endRow);
      const clampedC1 = Math.max(piece.col, startCol);
      const clampedC2 = Math.min(pieceEndCol, endCol);

      const localC = clampedC1 - startCol;
      const localR = clampedR1 - startRow;
      const localW = clampedC2 - clampedC1;
      const localH = clampedR2 - clampedR1;

      strokeRect(
        doc,
        gridX + localC * cellSize,
        gridY + localR * cellSize,
        localW * cellSize,
        localH * cellSize,
        PIECE_BORDER_COLOR,
        PIECE_BORDER_WIDTH,
      );
    }
  }

  // -- Per-section parts summary -------------------------------------------
  const summaryY = gridY + gridH + 6;

  // Count entry numbers in this section
  const sectionCounts = new Map<number, number>();
  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const n = numbering.grid[r]?.[c] ?? 0;
      if (n > 0) {
        sectionCounts.set(n, (sectionCounts.get(n) ?? 0) + 1);
      }
    }
  }

  // Sort by entry number
  const sectionEntries = [...sectionCounts.entries()]
    .map(([num, count]) => ({ entry: numbering.entries.get(num)!, count }))
    .filter((e) => e.entry)
    .sort((a, b) => a.entry.number - b.entry.number);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  setTextColor(doc, TEXT_MID);
  doc.text('Pieces for this section:', MARGIN, summaryY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  const badgeSize = 4;
  const badgeGap = 1.5;
  let bx = MARGIN;
  let by = summaryY + 3;
  const maxBx = PAGE_W - MARGIN;

  for (const { entry, count } of sectionEntries) {
    const label = `\u00d7${count}`;
    const labelW = doc.getTextWidth(label);
    const itemW = badgeSize + 1 + labelW + badgeGap + 2;

    // Wrap to next line if needed
    if (bx + itemW > maxBx) {
      bx = MARGIN;
      by += 6;
    }

    // Mini swatch with number
    fillRect(doc, bx, by, badgeSize, badgeSize, entry.legoColor.hex);
    centeredText(doc, String(entry.number), bx, by, badgeSize, badgeSize, contrastText(entry.legoColor.hex), 5);
    strokeRect(doc, bx, by, badgeSize, badgeSize, LINE_COLOR, 0.1);

    setTextColor(doc, TEXT_DARK);
    doc.text(label, bx + badgeSize + 1, by + 3);

    bx += itemW;
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a PDF instruction booklet for a LEGO mosaic.
 *
 * The mosaic is divided into 16×16 sub-sections (matching the LEGO Art
 * instruction style). Each sub-section gets its own page with large,
 * readable cells, major grid lines every 8 studs, and a locator thumbnail.
 *
 * When piece optimization is enabled, the grid numbering scheme changes
 * from per-color to per-part+color, so each cell shows which specific
 * piece covers it.
 *
 * @param result - The mosaic result from generateMosaic()
 * @returns A Blob containing the PDF data, ready for download
 */
export function generateInstructionsPDF(result: MosaicResult): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const numbering = buildNumbering(result);

  // Page 1: Cover
  renderCoverPage(doc, result, numbering);

  // Page 2+: Legend
  doc.addPage();
  const totalStuds = result.config.widthStuds * result.config.heightStuds;
  renderLegend(doc, numbering, totalStuds);

  // Page N+: Bill of materials
  doc.addPage();
  renderBOM(doc, result);

  // Section pages: one per 16×16 sub-section
  const { widthStuds, heightStuds } = result.config;
  const subCols = Math.ceil(widthStuds / SUB_SECTION_SIZE);
  const subRows = Math.ceil(heightStuds / SUB_SECTION_SIZE);
  const totalSections = subRows * subCols;
  let sectionNum = 0;

  for (let subR = 0; subR < subRows; subR++) {
    for (let subC = 0; subC < subCols; subC++) {
      sectionNum++;
      doc.addPage();
      const sr = subR * SUB_SECTION_SIZE;
      const sc = subC * SUB_SECTION_SIZE;
      renderSectionPage(
        doc, result, numbering,
        sr,
        sc,
        Math.min(sr + SUB_SECTION_SIZE, heightStuds),
        Math.min(sc + SUB_SECTION_SIZE, widthStuds),
        sectionNum, totalSections,
        subR, subC, subRows, subCols,
      );
    }
  }

  return doc.output('blob') as Blob;
}
