import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  rgbToLab,
  labToRgb,
  ciede2000,
  findNearestColor,
  findNearestColors,
  findNearestColorFromHex,
  LEGO_PALETTE,
  byLdrawCode,
  byBricklinkId,
  byName,
  subPalette,
  excludeColors,
  paletteSize,
  describeColor,
  type RGB,
  type LAB,
} from './colors';

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

function approx(a: number, b: number, tolerance = 0.5): boolean {
  return Math.abs(a - b) < tolerance;
}

// ── Palette size ────────────────────────────────────────────────────────
console.log('Palette:');
assert(paletteSize() === 49, `Expected 49 colors, got ${paletteSize()}`);
assert(LEGO_PALETTE.length >= 40, 'Palette has 40+ colors');
console.log(`  ${paletteSize()} colors loaded`);

// ── Hex ↔ RGB round-trip ────────────────────────────────────────────────
console.log('Hex ↔ RGB:');
const black = hexToRgb('#1B2A34');
assert(black.r === 27 && black.g === 42 && black.b === 52, 'hexToRgb #1B2A34');
assert(rgbToHex(black) === '#1B2A34', 'rgbToHex round-trip');
const shorthand = hexToRgb('#FFF');
assert(shorthand.r === 255 && shorthand.g === 255 && shorthand.b === 255, 'hexToRgb shorthand');
console.log('  hex conversions OK');

// ── RGB ↔ HSL round-trip ────────────────────────────────────────────────
console.log('RGB ↔ HSL:');
const red: RGB = { r: 255, g: 0, b: 0 };
const redHsl = rgbToHsl(red);
assert(approx(redHsl.h, 0, 1) || approx(redHsl.h, 360, 1), `Red hue=${redHsl.h}`);
assert(approx(redHsl.s, 100, 1), `Red sat=${redHsl.s}`);
assert(approx(redHsl.l, 50, 1), `Red light=${redHsl.l}`);
const redBack = hslToRgb(redHsl);
assert(redBack.r === 255 && redBack.g === 0 && redBack.b === 0, 'HSL round-trip red');

const gray: RGB = { r: 128, g: 128, b: 128 };
const grayHsl = rgbToHsl(gray);
assert(approx(grayHsl.s, 0, 1), 'Gray saturation is 0');
console.log('  HSL conversions OK');

// ── RGB ↔ LAB round-trip ────────────────────────────────────────────────
console.log('RGB ↔ LAB:');
// Known value: pure white → L≈100, a≈0, b≈0
const whiteLab = rgbToLab({ r: 255, g: 255, b: 255 });
assert(approx(whiteLab.L, 100, 1), `White L*=${whiteLab.L.toFixed(2)}`);
assert(approx(whiteLab.a, 0, 1), `White a*=${whiteLab.a.toFixed(2)}`);
assert(approx(whiteLab.b, 0, 1), `White b*=${whiteLab.b.toFixed(2)}`);
// Round-trip
const whiteBack = labToRgb(whiteLab);
assert(approx(whiteBack.r, 255, 2) && approx(whiteBack.g, 255, 2) && approx(whiteBack.b, 255, 2),
  `LAB round-trip white: ${whiteBack.r},${whiteBack.g},${whiteBack.b}`);

// Black → L≈0
const blackLab = rgbToLab({ r: 0, g: 0, b: 0 });
assert(approx(blackLab.L, 0, 1), `Black L*=${blackLab.L.toFixed(2)}`);
console.log('  LAB conversions OK');

// ── CIEDE2000 ───────────────────────────────────────────────────────────
console.log('CIEDE2000:');
// Identical colours → distance 0
const lab1: LAB = { L: 50, a: 25, b: -10 };
assert(ciede2000(lab1, lab1) === 0, 'Same colour → distance 0');

// Black vs white should be very large
const bwDist = ciede2000(blackLab, whiteLab);
assert(bwDist > 90, `Black↔White distance=${bwDist.toFixed(2)} (expected >90)`);

// Similar colours should have small distance
const d1 = ciede2000(rgbToLab({ r: 100, g: 100, b: 100 }), rgbToLab({ r: 105, g: 100, b: 100 }));
assert(d1 < 3, `Near-gray delta=${d1.toFixed(2)} (expected <3)`);
console.log(`  CIEDE2000 distances OK (B↔W=${bwDist.toFixed(1)}, near-gray Δ=${d1.toFixed(2)})`);

// ── Colour matching ─────────────────────────────────────────────────────
console.log('Colour Matching:');

// Exact match: LEGO Red #B40000
const matchRed = findNearestColor({ r: 0xB4, g: 0x00, b: 0x00 });
assert(matchRed.color.name === 'Red', `Exact red match: got ${matchRed.color.name}`);
assert(matchRed.distance < 0.01, `Exact match distance: ${matchRed.distance}`);

// Close match: pure blue #0000FF – the palette has no true pure-blue,
// so CIEDE2000 may pick Blue, Medium Blue, or Dark Purple.
const matchBlue = findNearestColor({ r: 0, g: 0, b: 255 });
assert(
  ['Blue', 'Medium Blue', 'Dark Purple', 'Violet'].includes(matchBlue.color.name),
  `Pure blue → ${matchBlue.color.name}`,
);

// From hex convenience
const matchHex = findNearestColorFromHex('#FF0000');
assert(matchHex.color.name === 'Red' || matchHex.color.name === 'Coral',
  `Hex #FF0000 → ${matchHex.color.name}`);

// Top-N
const topN = findNearestColors({ r: 128, g: 128, b: 128 }, 3);
assert(topN.length === 3, `Top-3 returns 3 results`);
assert(topN[0].distance <= topN[1].distance && topN[1].distance <= topN[2].distance,
  'Top-N sorted ascending');
console.log(`  Pure gray → top-3: ${topN.map(m => m.color.name).join(', ')}`);
console.log(`  Pure blue → ${matchBlue.color.name} (ΔE=${matchBlue.distance.toFixed(2)})`);

// ── Lookup maps ─────────────────────────────────────────────────────────
console.log('Lookup Maps:');
const ldraw14 = byLdrawCode.get(14);
assert(ldraw14?.name === 'Yellow', `LDraw 14 = ${ldraw14?.name}`);
const bl88 = byBricklinkId.get(88);
assert(bl88?.name === 'Reddish Brown', `BL 88 = ${bl88?.name}`);
const byN = byName.get('dark azure');
assert(byN?.ldrawCode === 321, `byName "dark azure" = LDraw ${byN?.ldrawCode}`);
console.log('  All lookup maps OK');

// ── Sub-palette / Exclude ───────────────────────────────────────────────
console.log('Palette Filtering:');
const mini = subPalette([0, 4, 14, 15]);
assert(mini.length === 4, `subPalette(4 codes) → ${mini.length} colours`);
const noBlack = excludeColors([0]);
assert(noBlack.length === LEGO_PALETTE.length - 1, 'excludeColors removes 1');
assert(!noBlack.find(c => c.ldrawCode === 0), 'Black excluded');
console.log('  Filtering OK');

// ── describeColor ───────────────────────────────────────────────────────
const desc = describeColor(LEGO_PALETTE[0]);
assert(desc.includes('Black') && desc.includes('LDraw') && desc.includes('#'), `describe: ${desc}`);

// ── Summary ─────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
console.log('All tests passed ✓');
