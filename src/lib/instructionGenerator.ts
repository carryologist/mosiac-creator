// =============================================================================
// Instruction PDF Generator
//
// Generates a multi-page PDF instruction booklet for building a LEGO mosaic,
// following the official LEGO Art instruction style: numbered colors inside a
// top-down grid, one baseplate section per page.
//
// Pages:
//   1. Cover — mosaic preview, dimensions, piece count
//   2. Color legend — sequential number → LEGO color mapping
//   3. Bill of materials — parts list table
//   4+. Section pages — one per baseplate, numbered grid with color fills
//
// Uses jsPDF for vector PDF generation (small file sizes, crisp at any zoom).
// Zero external API calls — runs entirely in the browser.
// =============================================================================

import { jsPDF } from 'jspdf';
import type { MosaicResult, PartsListEntry } from './mosaicEngine';
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

// =============================================================================
// Types
// =============================================================================

/** A color used in the mosaic, with its assigned instruction number. */
interface NumberedColor {
  /** Sequential number shown in the grid (1, 2, 3, ...) */
  number: number;
  /** LDraw color code */
  ldrawCode: number;
  /** Full LEGO color data */
  legoColor: LegoColor;
  /** Total count of this color in the mosaic */
  count: number;
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
 * Build the color number mapping from a mosaic result.
 * Colors are sorted by frequency (most common first) and assigned
 * sequential numbers starting from 1.
 */
function buildColorMap(result: MosaicResult): Map<number, NumberedColor> {
  // Count frequency of each LDraw color code
  const counts = new Map<number, number>();
  for (const row of result.ldrawColorGrid) {
    for (const code of row) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  // Sort by frequency descending
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const map = new Map<number, NumberedColor>();
  let num = 1;
  for (const [code, count] of sorted) {
    const legoColor = byLdrawCode.get(code);
    if (!legoColor) continue;
    map.set(code, {
      number: num++,
      ldrawCode: code,
      legoColor,
      count,
    });
  }
  return map;
}

/** Get the NumberedColor entries sorted by number. */
function sortedColors(colorMap: Map<number, NumberedColor>): NumberedColor[] {
  return [...colorMap.values()].sort((a, b) => a.number - b.number);
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
  colorMap: Map<number, NumberedColor>,
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

  // Draw cells
  for (let row = 0; row < heightStuds; row++) {
    for (let col = 0; col < widthStuds; col++) {
      const hex = result.colorGrid[row][col];
      fillRect(doc, gridX + col * cellSize, gridY + row * cellSize, cellSize, cellSize, hex);
    }
  }
  // Border
  strokeRect(doc, gridX, gridY, gridW, gridH, TEXT_MID, 0.3);

  // Stats below preview
  const statsY = gridY + gridH + 15;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  setTextColor(doc, TEXT_MID);

  const stats = [
    `${widthStuds} × ${heightStuds} studs`,
    `${layout.cols} × ${layout.rows} baseplate${layout.cols * layout.rows > 1 ? 's' : ''} (${bpSize}×${bpSize})`,
    `${result.totalPieces.toLocaleString()} pieces`,
    `${colorMap.size} colors`,
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
 * Render the color legend page mapping numbers to LEGO colors.
 */
function renderColorLegend(
  doc: jsPDF,
  colorMap: Map<number, NumberedColor>,
  totalPieces: number,
): void {
  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  setTextColor(doc, TEXT_DARK);
  doc.text('Color Legend', MARGIN, MARGIN + 8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  setTextColor(doc, TEXT_MID);
  doc.text(`${colorMap.size} colors used`, MARGIN, MARGIN + 15);

  // Legend entries
  const colors = sortedColors(colorMap);
  const startY = MARGIN + 25;
  const rowHeight = 9;
  const swatchSize = 6;
  const maxPerPage = Math.floor((USABLE_H - 25) / rowHeight);

  colors.forEach((entry, i) => {
    const pageIndex = Math.floor(i / maxPerPage);
    if (pageIndex > 0 && i % maxPerPage === 0) {
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      setTextColor(doc, TEXT_DARK);
      doc.text('Color Legend (continued)', MARGIN, MARGIN + 8);
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

    // Hex value
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setTextColor(doc, TEXT_MID);
    doc.text(entry.legoColor.hex, MARGIN + 70, y + 4.2);

    // Count and percentage
    const pct = ((entry.count / totalPieces) * 100).toFixed(1);
    doc.text(`${entry.count.toLocaleString()} pieces (${pct}%)`, MARGIN + 95, y + 4.2);
  });
}

/**
 * Render the bill of materials page.
 */
function renderBOM(
  doc: jsPDF,
  result: MosaicResult,
  colorMap: Map<number, NumberedColor>,
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

  // Table rows from parts list
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
    `+ ${bpCount} × ${layout.baseplate.sizeStuds}×${layout.baseplate.sizeStuds} baseplate (${layout.baseplate.partNumber})`,
    colX.part,
    bpY + rowHeight,
  );
}

/**
 * Render a section page for one baseplate.
 */
function renderSectionPage(
  doc: jsPDF,
  result: MosaicResult,
  colorMap: Map<number, NumberedColor>,
  bpRow: number,
  bpCol: number,
  sectionNum: number,
  totalSections: number,
): void {
  const layout = result.config.baseplateLayout;
  const bpSize = layout.baseplate.sizeStuds;
  const { widthStuds, heightStuds } = result.config;

  // Section sub-grid boundaries
  const startRow = bpRow * bpSize;
  const endRow = Math.min(startRow + bpSize, heightStuds);
  const startCol = bpCol * bpSize;
  const endCol = Math.min(startCol + bpSize, widthStuds);
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
    `${bpSize}×${bpSize} baseplate — rows ${startRow + 1}–${endRow}, columns ${startCol + 1}–${endCol}`,
    MARGIN,
    MARGIN + 15,
  );

  // -- Locator thumbnail (multi-baseplate only) ----------------------------
  if (totalSections > 1) {
    const thumbSize = 24;
    const thumbX = PAGE_W - MARGIN - thumbSize;
    const thumbY = MARGIN + 2;
    const thumbCellW = thumbSize / layout.cols;
    const thumbCellH = thumbSize / layout.rows;

    for (let tr = 0; tr < layout.rows; tr++) {
      for (let tc = 0; tc < layout.cols; tc++) {
        const isCurrent = tr === bpRow && tc === bpCol;
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
    const label = String(c + 1);
    const lw = doc.getTextWidth(label);
    doc.text(label, gridX + c * cellSize + (cellSize - lw) / 2, gridY - 1.5);
  }

  // -- Row numbers ----------------------------------------------------------
  for (let r = 0; r < sectionH; r++) {
    const label = String(r + 1);
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
      const ldrawCode = result.ldrawColorGrid[globalRow][globalCol];
      const entry = colorMap.get(ldrawCode);
      const num = entry ? String(entry.number) : '?';

      const cx = gridX + c * cellSize;
      const cy = gridY + r * cellSize;

      // Fill with LEGO color
      fillRect(doc, cx, cy, cellSize, cellSize, hex);

      // Color number
      centeredText(doc, num, cx, cy, cellSize, cellSize, contrastText(hex), numFontSize);
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

  // -- Per-section parts summary -------------------------------------------
  const summaryY = gridY + gridH + 6;

  // Count colors in this section
  const sectionCounts = new Map<number, number>();
  for (let r = startRow; r < endRow; r++) {
    for (let c = startCol; c < endCol; c++) {
      const code = result.ldrawColorGrid[r][c];
      sectionCounts.set(code, (sectionCounts.get(code) ?? 0) + 1);
    }
  }

  // Sort by color number
  const sectionEntries = [...sectionCounts.entries()]
    .map(([code, count]) => ({ entry: colorMap.get(code)!, count }))
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
    const label = `×${count}`;
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
 * @param result - The mosaic result from generateMosaic()
 * @returns A Blob containing the PDF data, ready for download
 */
export function generateInstructionsPDF(result: MosaicResult): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const colorMap = buildColorMap(result);

  // Page 1: Cover
  renderCoverPage(doc, result, colorMap);

  // Page 2+: Color legend
  doc.addPage();
  renderColorLegend(doc, colorMap, result.totalPieces);

  // Page N+: Bill of materials
  doc.addPage();
  renderBOM(doc, result, colorMap);

  // Section pages: one per baseplate
  const layout = result.config.baseplateLayout;
  const totalSections = layout.rows * layout.cols;
  let sectionNum = 0;

  for (let bpRow = 0; bpRow < layout.rows; bpRow++) {
    for (let bpCol = 0; bpCol < layout.cols; bpCol++) {
      sectionNum++;
      doc.addPage();
      renderSectionPage(doc, result, colorMap, bpRow, bpCol, sectionNum, totalSections);
    }
  }

  return doc.output('blob') as Blob;
}
