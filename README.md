# LEGO Mosaic Creator

A web application that converts images into LEGO mosaic build files. Generates LDraw (.ldr) files compatible with BrickLink Studio 2.0, LDView, and LPub3D. Runs entirely in the browser with no server-side processing.

Deployed on Vercel.

## Features

**Image input** -- Drag-and-drop, file browse, or clipboard paste. Supports JPG, PNG, and WebP up to 20MB / 16384px per dimension.

**Mosaic sizes** -- Six predefined layouts:

| Size | Baseplates |
|------|------------|
| 16x16 | 1x 16x16 |
| 32x32 | 1x 32x32 |
| 48x48 | 1x 48x48 |
| 64x64 | 4x 32x32 |
| 96x96 | 2x2 48x48 |
| 96x96 | 3x3 32x32 |

**Color matching** -- CIEDE2000 perceptual color distance against a palette of 49 real LEGO colors with pre-computed CIE-LAB values.

**Piece types** -- Smooth tiles (3070b) or studded plates (3024).

**Minimize Pieces** -- A greedy rectangle-cover algorithm merges adjacent same-color 1x1 cells into larger standard LEGO pieces (14 sizes from 1x1 up to 4x8), reducing total piece count.

**Minimize Colors** -- Post-processing pass that merges rare colors falling below a 2% threshold into their nearest common color via CIEDE2000. Cleans up noise and anti-aliasing artifacts.

**Image adjustments** -- Brightness, contrast, and saturation sliders applied before color quantization.

**3D preview** -- Interactive Three.js viewer using LDrawLoader that renders the actual LDraw model. Opt-in to avoid loading overhead.

**LDraw export** -- Generates standard .ldr files with multi-baseplate coordinate math. Compatible with BrickLink Studio 2.0, LDView, and LPub3D.

**BrickLink Wanted List** -- Exports XML formatted for direct upload to BrickLink.com to order the exact parts needed.

**Parts list** -- Detailed breakdown with color swatches, quantities, and BrickLink color IDs.

## Tech Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Three.js with LDrawLoader for 3D preview
- Canvas API for image processing
- Zero external API calls -- everything runs client-side

## Architecture

| Module | Purpose |
|--------|---------|
| `src/lib/colors.ts` | 49-color LEGO palette with CIE-LAB values and CIEDE2000 matching |
| `src/lib/imageProcessor.ts` | Canvas-based image resize with brightness/contrast/saturation |
| `src/lib/pieceOptimizer.ts` | Greedy rectangle-cover algorithm for piece minimization |
| `src/lib/ldraw.ts` | LDraw .ldr file generation with multi-baseplate coordinate math |
| `src/lib/mosaicEngine.ts` | Orchestration pipeline tying everything together |
| `src/components/MosaicCreator.tsx` | Main UI component (2-step workflow) |
| `src/components/LDrawViewer.tsx` | Three.js 3D viewer for LDraw files |
| `public/ldraw/` | Bundled LDraw parts library (75 parts, CC BY 4.0) |

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## License

Project code is licensed under the MIT License.

LDraw parts library files in `public/ldraw/` are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) by [LDraw.org](https://www.ldraw.org/) contributors. See `THIRD_PARTY_LICENSES` for details.
