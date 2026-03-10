# LEGO Mosaic Creator

Convert any image into a LEGO mosaic file compatible with BrickLink Studio 2.0.

## Features

- **Image Upload**: Drag-and-drop or browse for JPG, PNG, or WebP images
- **Multiple Mosaic Sizes**: 16x16, 32x32, 48x48, 64x64, and 96x96 stud layouts
- **Accurate Color Matching**: CIEDE2000 perceptual color matching against 49 real LEGO colors
- **LDraw Export**: Generates `.ldr` files that open directly in BrickLink Studio
- **Parts List**: Breakdown of every color and quantity needed, with BrickLink color IDs
- **Two-Layer Construction**: Baseplate(s) + 1x1 tiles/plates on top
- **Image Adjustments**: Brightness, contrast, and saturation controls
- **Piece Type Choice**: Smooth tiles (3070b) or studded plates (3024)

## How It Works

1. Upload a high-resolution image
2. Choose your mosaic size (determines baseplate layout)
3. Adjust brightness/contrast/saturation if needed
4. Generate the mosaic
5. Preview the result and review the parts list
6. Download the `.ldr` file and open it in BrickLink Studio

## Mosaic Sizes

| Size | Baseplates | Total Pieces |
|------|-----------|-------------|
| 16x16 | 1x 16x16 | 256 |
| 32x32 | 1x 32x32 | 1,024 |
| 48x48 | 1x 48x48 | 2,304 |
| 64x64 | 4x 32x32 | 4,096 |
| 96x96 | 4x 48x48 | 9,216 |
| 96x96 | 9x 32x32 | 9,216 |

## Technical Details

- **Color System**: 49 LEGO colors with pre-computed CIE-LAB values for perceptual matching
- **LDraw Format**: Standard .ldr output compatible with BrickLink Studio, LDView, and LPub3D
- **Coordinate Math**: Proper LDU positioning with multi-baseplate support
- **No Server Required**: All processing happens in-browser

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

Deployed on Vercel. Push to `main` to trigger deployment.

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4
- Canvas API for image processing
