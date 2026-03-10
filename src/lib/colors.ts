// =============================================================================
// LEGO Color System & LDraw Color Mapping
// =============================================================================
// Provides a complete LEGO color palette for 1×1 tiles, perceptually-accurate
// color matching via CIEDE2000 in CIE-LAB space, and conversion helpers for
// RGB ↔ HSL ↔ LAB.  Zero external dependencies.
// =============================================================================

// ---------------------------------------------------------------------------
// Type Definitions
// ---------------------------------------------------------------------------

/** Red, Green, Blue – each channel in [0, 255]. */
export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Hue [0, 360), Saturation [0, 100], Lightness [0, 100]. */
export interface HSL {
  h: number;
  s: number;
  l: number;
}

/** CIE-LAB: L* [0, 100], a* and b* are unbounded (typically ±128). */
export interface LAB {
  L: number;
  a: number;
  b: number;
}

/** CIE-XYZ (D65 illuminant, 2° observer). */
export interface XYZ {
  x: number;
  y: number;
  z: number;
}

/** One entry in the master LEGO palette. */
export interface LegoColor {
  /** LDraw colour code (the canonical numeric ID used in .ldr/.mpd files). */
  ldrawCode: number;
  /** Human-readable colour name. */
  name: string;
  /** Hex string including leading '#', e.g. "#1B2A34". */
  hex: string;
  /** Pre-computed sRGB triplet. */
  rgb: RGB;
  /** Pre-computed CIE-LAB value (for fast matching). */
  lab: LAB;
  /** BrickLink colour ID (used for parts ordering / inventory). */
  bricklinkId: number;
}

/** Result returned by the nearest-colour search. */
export interface ColorMatch {
  /** The best-matching LEGO colour. */
  color: LegoColor;
  /** CIEDE2000 distance (0 = perfect match). */
  distance: number;
}

// ---------------------------------------------------------------------------
// Colour-Space Conversion Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a hex colour string into an RGB triplet.
 * Accepts "#RRGGBB", "RRGGBB", "#RGB", and "RGB".
 */
export function hexToRgb(hex: string): RGB {
  let h = hex.replace(/^#/, '');

  // Expand shorthand "#ABC" → "AABBCC"
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }

  if (h.length !== 6) {
    throw new Error(`Invalid hex colour: "${hex}"`);
  }

  const num = parseInt(h, 16);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid hex colour: "${hex}"`);
  }

  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/** Convert an RGB triplet back to a "#RRGGBB" hex string. */
export function rgbToHex(rgb: RGB): string {
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(rgb.r);
  const g = clamp(rgb.g);
  const b = clamp(rgb.b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

// -- RGB ↔ HSL ---------------------------------------------------------------

/** Convert RGB [0-255] to HSL (h [0,360), s [0,100], l [0,100]). */
export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / delta + 2) / 6;
        break;
      case b:
        h = ((r - g) / delta + 4) / 6;
        break;
    }
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100,
  };
}

/** Convert HSL (h [0,360), s [0,100], l [0,100]) back to RGB [0-255]. */
export function hslToRgb(hsl: HSL): RGB {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;

  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

// -- RGB ↔ XYZ ↔ LAB ---------------------------------------------------------
// Uses D65 illuminant / 2° observer (sRGB standard).

/** Linearise a single sRGB channel (inverse companding). */
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Apply sRGB companding to a linear channel. */
function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** Convert RGB to CIE-XYZ (D65). */
export function rgbToXyz(rgb: RGB): XYZ {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  // sRGB → XYZ (D65) matrix
  return {
    x: r * 0.4124564 + g * 0.3575761 + b * 0.1804375,
    y: r * 0.2126729 + g * 0.7151522 + b * 0.0721750,
    z: r * 0.0193339 + g * 0.1191920 + b * 0.9503041,
  };
}

/** Convert CIE-XYZ (D65) back to RGB. */
export function xyzToRgb(xyz: XYZ): RGB {
  // XYZ → linear sRGB matrix (inverse of the above)
  const r = xyz.x *  3.2404542 + xyz.y * -1.5371385 + xyz.z * -0.4985314;
  const g = xyz.x * -0.9692660 + xyz.y *  1.8760108 + xyz.z *  0.0415560;
  const b = xyz.x *  0.0556434 + xyz.y * -0.2040259 + xyz.z *  1.0572252;

  return {
    r: linearToSrgb(r),
    g: linearToSrgb(g),
    b: linearToSrgb(b),
  };
}

// D65 white-point reference values
const D65_X = 0.95047;
const D65_Y = 1.00000;
const D65_Z = 1.08883;

// LAB threshold constants
const LAB_EPSILON = 0.008856; // (6/29)^3
const LAB_KAPPA   = 903.3;    // (29/3)^3

/** CIE f(t) used in XYZ → LAB conversion. */
function labF(t: number): number {
  return t > LAB_EPSILON ? Math.cbrt(t) : (LAB_KAPPA * t + 16) / 116;
}

/** Inverse CIE f(t) used in LAB → XYZ conversion. */
function labFInverse(t: number): number {
  return t > 6 / 29 ? t * t * t : (116 * t - 16) / LAB_KAPPA;
}

/** Convert CIE-XYZ (D65) to CIE-LAB. */
export function xyzToLab(xyz: XYZ): LAB {
  const fx = labF(xyz.x / D65_X);
  const fy = labF(xyz.y / D65_Y);
  const fz = labF(xyz.z / D65_Z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** Convert CIE-LAB back to CIE-XYZ (D65). */
export function labToXyz(lab: LAB): XYZ {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;

  return {
    x: D65_X * labFInverse(fx),
    y: D65_Y * labFInverse(fy),
    z: D65_Z * labFInverse(fz),
  };
}

// -- Convenience compound conversions ----------------------------------------

/** RGB → LAB (via XYZ). */
export function rgbToLab(rgb: RGB): LAB {
  return xyzToLab(rgbToXyz(rgb));
}

/** LAB → RGB (via XYZ). */
export function labToRgb(lab: LAB): RGB {
  return xyzToRgb(labToXyz(lab));
}

/** Hex string → LAB. */
export function hexToLab(hex: string): LAB {
  return rgbToLab(hexToRgb(hex));
}

// ---------------------------------------------------------------------------
// CIEDE2000 Colour Difference
// ---------------------------------------------------------------------------
// Full implementation of the CIE DE2000 formula (Sharma, Wu, Dalal 2005).
// Parametric weight factors kL, kC, kH are all 1 (reference conditions).

/** Degrees ↔ radians helpers. */
function deg2rad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function rad2deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Compute the CIEDE2000 perceptual colour difference between two LAB values.
 *
 * Returns ΔE₀₀ — a non-negative number where 0 means the colours are
 * identical and values above ~2.3 are considered "just noticeable" to the
 * average human observer.
 */
export function ciede2000(lab1: LAB, lab2: LAB): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  // Step 1 — Compute C'ab and h'ab
  const C1ab = Math.sqrt(a1 * a1 + b1 * b1);
  const C2ab = Math.sqrt(a2 * a2 + b2 * b2);
  const CabMean = (C1ab + C2ab) / 2;

  const CabMean7 = Math.pow(CabMean, 7);
  const G = 0.5 * (1 - Math.sqrt(CabMean7 / (CabMean7 + 6103515625))); // 25^7
  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = rad2deg(Math.atan2(b1, a1p));
  if (h1p < 0) h1p += 360;

  let h2p = rad2deg(Math.atan2(b2, a2p));
  if (h2p < 0) h2p += 360;

  // Step 2 — Compute ΔL', ΔC', ΔH'
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(dhp / 2));

  // Step 3 — Compute CIEDE2000 ΔE₀₀
  const Lpm = (L1 + L2) / 2;
  const Cpm = (C1p + C2p) / 2;

  let Hpm: number;
  if (C1p * C2p === 0) {
    Hpm = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    Hpm = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    Hpm = (h1p + h2p + 360) / 2;
  } else {
    Hpm = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos(deg2rad(Hpm - 30)) +
    0.24 * Math.cos(deg2rad(2 * Hpm)) +
    0.32 * Math.cos(deg2rad(3 * Hpm + 6)) -
    0.20 * Math.cos(deg2rad(4 * Hpm - 63));

  const Lpm50sq = (Lpm - 50) * (Lpm - 50);
  const SL = 1 + 0.015 * Lpm50sq / Math.sqrt(20 + Lpm50sq);
  const SC = 1 + 0.045 * Cpm;
  const SH = 1 + 0.015 * Cpm * T;

  const Cpm7 = Math.pow(Cpm, 7);
  const RT =
    -2 *
    Math.sqrt(Cpm7 / (Cpm7 + 6103515625)) *
    Math.sin(deg2rad(60 * Math.exp(-Math.pow((Hpm - 275) / 25, 2))));

  // Parametric weighting factors (all 1 under reference conditions)
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const dE = Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
      Math.pow(dCp / (kC * SC), 2) +
      Math.pow(dHp / (kH * SH), 2) +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH)),
  );

  return dE;
}

// ---------------------------------------------------------------------------
// Master LEGO Colour Palette (1×1 tiles – solid colours only)
// ---------------------------------------------------------------------------
// Each entry: [LDraw code, name, hex, BrickLink ID]

const PALETTE_DATA: ReadonlyArray<[number, string, string, number]> = [
  [0,   'Black',                '#1B2A34', 11],
  [1,   'Blue',                 '#1E5AA8', 7],
  [2,   'Green',                '#00852B', 6],
  [3,   'Dark Turquoise',       '#069D9F', 39],
  [4,   'Red',                  '#B40000', 5],
  [5,   'Dark Pink',            '#D3359D', 47],
  [9,   'Light Blue',           '#97CBD9', 62],
  [10,  'Bright Green',         '#58AB41', 36],
  [11,  'Light Turquoise',      '#00AAA4', 40],
  [13,  'Pink',                 '#F6A9BB', 23],
  [14,  'Yellow',               '#FAC80A', 3],
  [15,  'White',                '#F4F4F4', 1],
  [17,  'Light Green',          '#BDC618', 38],
  [18,  'Light Yellow',         '#FFD67F', 33],
  [19,  'Tan',                  '#E4CD9E', 2],
  [22,  'Purple',               '#81007B', 24],
  [25,  'Orange',               '#FE8A18', 4],
  [26,  'Magenta',              '#923978', 71],
  [27,  'Lime',                 '#A5CA18', 34],
  [28,  'Dark Tan',             '#897D62', 69],
  [29,  'Bright Pink',          '#FF9ECD', 104],
  [70,  'Reddish Brown',        '#5F3109', 88],
  [71,  'Light Bluish Gray',    '#A0A5A9', 86],
  [72,  'Dark Bluish Gray',     '#6C6E68', 85],
  [73,  'Medium Blue',          '#4C61DB', 42],
  [78,  'Light Nougat',         '#F6D7B3', 90],
  [84,  'Medium Nougat',        '#E0A05F', 150],
  [85,  'Dark Purple',          '#3F3691', 89],
  [86,  'Dark Nougat',          '#7C503A', 91],
  [92,  'Nougat',               '#BB805A', 28],
  [110, 'Violet',               '#26469A', 43],
  [115, 'Medium Lime',          '#C7D23C', 35],
  [118, 'Aqua',                 '#B3D7D1', 41],
  [191, 'Bright Light Orange',  '#F8BB3D', 110],
  [212, 'Bright Light Blue',    '#9FC3E9', 105],
  [226, 'Bright Light Yellow',  '#FFF03A', 103],
  [272, 'Dark Blue',            '#0A3463', 63],
  [288, 'Dark Green',           '#184632', 80],
  [308, 'Dark Brown',           '#352100', 120],
  [320, 'Dark Red',             '#720012', 59],
  [321, 'Dark Azure',           '#0091B5', 153],
  [322, 'Medium Azure',         '#3DB5C8', 156],
  [323, 'Light Aqua',           '#AADCD1', 152],
  [330, 'Olive Green',          '#77774E', 155],
  [335, 'Sand Blue',            '#5A7184', 55],
  [351, 'Coral',                '#FF6D77', 220],
  [378, 'Sand Green',           '#708E7C', 48],
  [462, 'Medium Orange',        '#F58624', 31],
  [484, 'Dark Orange',          '#91501C', 68],
];

// ---------------------------------------------------------------------------
// Build the runtime palette (pre-compute RGB + LAB for every entry)
// ---------------------------------------------------------------------------

function buildPalette(
  data: ReadonlyArray<[number, string, string, number]>,
): LegoColor[] {
  return data.map(([ldrawCode, name, hex, bricklinkId]) => {
    const rgb = hexToRgb(hex);
    const lab = rgbToLab(rgb);
    return { ldrawCode, name, hex, rgb, lab, bricklinkId };
  });
}

/**
 * The full LEGO tile colour palette.
 * Each entry has pre-computed RGB and LAB values for fast look-ups.
 */
export const LEGO_PALETTE: readonly LegoColor[] = buildPalette(PALETTE_DATA);

// ---------------------------------------------------------------------------
// Quick look-up maps
// ---------------------------------------------------------------------------

/** Map from LDraw colour code → LegoColor. */
export const byLdrawCode: ReadonlyMap<number, LegoColor> = new Map(
  LEGO_PALETTE.map((c) => [c.ldrawCode, c]),
);

/** Map from BrickLink colour ID → LegoColor. */
export const byBricklinkId: ReadonlyMap<number, LegoColor> = new Map(
  LEGO_PALETTE.map((c) => [c.bricklinkId, c]),
);

/** Map from colour name (lower-cased) → LegoColor. */
export const byName: ReadonlyMap<string, LegoColor> = new Map(
  LEGO_PALETTE.map((c) => [c.name.toLowerCase(), c]),
);

// ---------------------------------------------------------------------------
// Colour Matching
// ---------------------------------------------------------------------------

/**
 * Find the perceptually nearest LEGO colour for an arbitrary RGB value.
 *
 * Uses CIEDE2000 in CIE-LAB space (the gold-standard perceptual metric).
 *
 * @param input  - The target colour as an RGB triplet.
 * @param palette - Optional subset of LEGO colours to search. Defaults to
 *                  the full `LEGO_PALETTE`.
 * @returns The closest `LegoColor` and its CIEDE2000 distance.
 */
export function findNearestColor(
  input: RGB,
  palette: readonly LegoColor[] = LEGO_PALETTE,
): ColorMatch {
  const inputLab = rgbToLab(input);

  let bestMatch: LegoColor = palette[0];
  let bestDistance = Infinity;

  for (const candidate of palette) {
    const d = ciede2000(inputLab, candidate.lab);
    if (d < bestDistance) {
      bestDistance = d;
      bestMatch = candidate;
      // Perfect match shortcut
      if (d === 0) break;
    }
  }

  return { color: bestMatch, distance: bestDistance };
}

/**
 * Convenience overload: accept a hex string instead of an RGB triplet.
 */
export function findNearestColorFromHex(
  hex: string,
  palette: readonly LegoColor[] = LEGO_PALETTE,
): ColorMatch {
  return findNearestColor(hexToRgb(hex), palette);
}

/**
 * Return the **top N** nearest LEGO colours, sorted by ascending distance.
 *
 * Useful for presenting alternative colour choices in a UI.
 */
export function findNearestColors(
  input: RGB,
  count: number = 5,
  palette: readonly LegoColor[] = LEGO_PALETTE,
): ColorMatch[] {
  const inputLab = rgbToLab(input);

  const scored: ColorMatch[] = palette.map((color) => ({
    color,
    distance: ciede2000(inputLab, color.lab),
  }));

  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, count);
}

// ---------------------------------------------------------------------------
// Palette Filtering Helpers
// ---------------------------------------------------------------------------

/**
 * Build a reduced palette from a list of LDraw codes.
 * Throws if any code is not found.
 */
export function subPalette(ldrawCodes: number[]): LegoColor[] {
  return ldrawCodes.map((code) => {
    const c = byLdrawCode.get(code);
    if (!c) throw new Error(`Unknown LDraw colour code: ${code}`);
    return c;
  });
}

/**
 * Return a palette with specific LDraw codes *excluded*.
 */
export function excludeColors(ldrawCodes: number[]): LegoColor[] {
  const excluded = new Set(ldrawCodes);
  return LEGO_PALETTE.filter((c) => !excluded.has(c.ldrawCode));
}

// ---------------------------------------------------------------------------
// Debug / Utility
// ---------------------------------------------------------------------------

/** Pretty-print a colour for logging. */
export function describeColor(c: LegoColor): string {
  return `${c.name} (LDraw ${c.ldrawCode}, BL ${c.bricklinkId}, ${c.hex})`;
}

/** Return the total number of colours in the palette. */
export function paletteSize(): number {
  return LEGO_PALETTE.length;
}
