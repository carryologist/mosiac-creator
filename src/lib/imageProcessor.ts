// =============================================================================
// imageProcessor.ts — Browser-based image processing for LEGO mosaic creation
//
// Reads an uploaded image, resizes it to mosaic stud dimensions, samples pixel
// colours, and applies optional brightness / contrast / saturation adjustments.
// Also provides a preview renderer that draws a LEGO-stud grid to a data-URL.
//
// Zero external dependencies – uses only the browser Canvas API.
// =============================================================================

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single colour expressed as 8-bit RGB channels. */
export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

/** The full pixel grid that represents a mosaic in stud coordinates. */
export interface MosaicPixelData {
  width: number;   // columns (studs)
  height: number;  // rows    (studs)
  pixels: RGB[][]; // [row][col]
}

/** Optional image adjustments applied before colour sampling. */
export interface ImageAdjustments {
  brightness?: number; // -100 … +100  (default 0)
  contrast?: number;   // -100 … +100  (default 0)
  saturation?: number; // -100 … +100  (default 0)
}

// ---------------------------------------------------------------------------
// Helpers — clamping & colour-space math
// ---------------------------------------------------------------------------

/** Clamp a number to the 0-255 byte range. */
function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Apply brightness, contrast and saturation to a single pixel in-place.
 *
 * The operations are applied in the order:
 *   1. Brightness  — simple additive offset
 *   2. Contrast    — scale around mid-grey (128)
 *   3. Saturation  — lerp towards the luma value
 *
 * All three knobs accept values in the range [-100, +100] where 0 = no change.
 */
function adjustPixel(
  r: number,
  g: number,
  b: number,
  brightness: number,
  contrastFactor: number,
  saturation: number,
): [number, number, number] {
  // --- Brightness (additive, scaled so ±100 maps to ±100 grey levels) ------
  r += brightness * 2.55;
  g += brightness * 2.55;
  b += brightness * 2.55;

  // --- Contrast (scale around 128) -----------------------------------------
  r = contrastFactor * (r - 128) + 128;
  g = contrastFactor * (g - 128) + 128;
  b = contrastFactor * (b - 128) + 128;

  // --- Saturation (lerp towards BT.601 luma) --------------------------------
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  // saturation: -100 → fully desaturated (t=0), 0 → unchanged (t=1), +100 → 2× (t=2)
  const t = 1 + saturation / 100;
  r = luma + t * (r - luma);
  g = luma + t * (g - luma);
  b = luma + t * (b - luma);

  return [clampByte(r), clampByte(g), clampByte(b)];
}

// ---------------------------------------------------------------------------
// Core: load & resize an image via offscreen <canvas>
// ---------------------------------------------------------------------------

/**
 * Decode a File / Blob into an HTMLImageElement using a temporary object-URL.
 * Returns a promise that resolves once the image is fully decoded.
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (_e) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image from file "${file.name}".`));
    };

    img.src = url;
  });
}

/**
 * Draw `img` onto a canvas of exactly `w × h` pixels.
 * The browser's built-in bilinear / bicubic interpolation handles the
 * downsampling for us.  For extreme size reductions we do a two-step
 * draw (halving repeatedly) to improve quality — the same trick
 * recommended by the HTML spec and every Canvas performance guide.
 */
function resizeToCanvas(
  img: HTMLImageElement,
  w: number,
  h: number,
): HTMLCanvasElement {
  // Step-down: repeatedly halve the source until it's within 2× of the target.
  // This avoids the quality loss that drawImage shows with very large ratios.
  let srcCanvas: HTMLCanvasElement | HTMLImageElement = img;
  let srcW = img.naturalWidth;
  let srcH = img.naturalHeight;

  while (srcW / 2 > w || srcH / 2 > h) {
    const halfW = Math.max(Math.ceil(srcW / 2), w);
    const halfH = Math.max(Math.ceil(srcH / 2), h);

    const step = document.createElement('canvas');
    step.width = halfW;
    step.height = halfH;
    const ctx = step.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context — browser may be out of GPU resources.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, halfW, halfH);

    // Free GPU memory from the intermediate canvas that is no longer needed.
    const prevCanvas = srcCanvas;
    srcCanvas = step;
    srcW = halfW;
    srcH = halfH;

    if (prevCanvas instanceof HTMLCanvasElement) {
      prevCanvas.width = 0;
      prevCanvas.height = 0;
    }
  }

  // Final draw to the exact target size.
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context — browser may be out of GPU resources.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(srcCanvas, 0, 0, srcW, srcH, 0, 0, w, h);

  // Free GPU memory from the last intermediate canvas (if it was a canvas).
  if (srcCanvas instanceof HTMLCanvasElement) {
    srcCanvas.width = 0;
    srcCanvas.height = 0;
  }

  return canvas;
}

// ---------------------------------------------------------------------------
// processImage — main public entry point
// ---------------------------------------------------------------------------

/**
 * Load an image from a File, resize it to the requested mosaic dimensions,
 * optionally apply brightness / contrast / saturation tweaks, and return
 * the resulting 2-D grid of RGB pixels.
 *
 * @param file          An image File (or Blob) from e.g. an <input type="file">.
 * @param targetWidth   Desired mosaic width in studs (columns).
 * @param targetHeight  Desired mosaic height in studs (rows).
 * @param options       Optional brightness / contrast / saturation adjustments.
 * @returns             A `MosaicPixelData` whose `pixels` array is
 *                      `[row][col]` with `row` in `[0, targetHeight)`.
 */
export async function processImage(
  file: File,
  targetWidth: number,
  targetHeight: number,
  options?: ImageAdjustments,
): Promise<MosaicPixelData> {
  if (targetWidth < 1 || targetHeight < 1) {
    throw new RangeError(
      `Target dimensions must be ≥ 1, got ${targetWidth}×${targetHeight}.`,
    );
  }

  const img = await loadImageFromFile(file);

  // Resize via canvas (high-quality stepped downsampling).
  const canvas = resizeToCanvas(img, targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context — browser may be out of GPU resources.');
  }
  const imageData = ctx.getImageData(0, 0, targetWidth, targetHeight);

  // Free GPU memory from the working canvas now that pixel data is extracted.
  canvas.width = 0;
  canvas.height = 0;
  const { data } = imageData; // Uint8ClampedArray, RGBA interleaved

  // Pre-compute the contrast factor once (it's the same for every pixel).
  const brightnessVal = options?.brightness ?? 0;
  const contrastVal = options?.contrast ?? 0;
  const saturationVal = options?.saturation ?? 0;

  // Contrast factor: maps [-100, +100] → [0, ~4].
  //   -100 → factor 0   (all grey)
  //    0   → factor 1   (unchanged)
  //  +100  → factor ~259/1  (maximum contrast)
  const contrastFactor =
    (259 * (contrastVal * 2.55 + 255)) /
    (255 * (259 - contrastVal * 2.55));

  const needsAdjustment =
    brightnessVal !== 0 || contrastVal !== 0 || saturationVal !== 0;

  // Build the 2-D pixel array.
  const pixels: RGB[][] = [];

  for (let row = 0; row < targetHeight; row++) {
    const rowPixels: RGB[] = [];

    for (let col = 0; col < targetWidth; col++) {
      const idx = (row * targetWidth + col) * 4;

      // Alpha-blend against black (matching the dark LEGO baseplate).
      // Fully transparent pixels become black; semi-transparent pixels
      // darken proportionally.
      const a = data[idx + 3] / 255;
      let r = Math.round(data[idx] * a);
      let g = Math.round(data[idx + 1] * a);
      let b = Math.round(data[idx + 2] * a);

      if (needsAdjustment) {
        [r, g, b] = adjustPixel(
          r,
          g,
          b,
          brightnessVal,
          contrastFactor,
          saturationVal,
        );
      }

      rowPixels.push({ r, g, b });
    }

    pixels.push(rowPixels);
  }

  return {
    width: targetWidth,
    height: targetHeight,
    pixels,
  };
}

// ---------------------------------------------------------------------------
// generatePreviewDataURL — render a LEGO-stud grid to a data-URL
// ---------------------------------------------------------------------------

/**
 * Render a colour grid as a small preview image (PNG data-URL).
 *
 * Each cell in the grid is drawn as a coloured square.  A subtle circular
 * highlight is overlaid in the centre to evoke the appearance of a LEGO stud.
 *
 * @param colorGrid  2-D array of CSS hex colour strings, `[row][col]`.
 *                   e.g. `"#FF0000"` or `"#f00"`.
 * @param pixelSize  Edge length of each stud square in output pixels (default 10).
 * @returns          A `data:image/png;base64,…` URL suitable for `<img src>`.
 */
export function generatePreviewDataURL(
  colorGrid: string[][],
  pixelSize: number = 10,
): string {
  const rows = colorGrid.length;
  if (rows === 0) return '';
  const cols = colorGrid[0].length;
  if (cols === 0) return '';

  const canvasW = cols * pixelSize;
  const canvasH = rows * pixelSize;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to acquire 2D canvas context — browser may be out of GPU resources.');
  }

  // Radius & position of the stud circle relative to each cell.
  const studRadius = pixelSize * 0.3;
  const halfPixel = pixelSize / 2;

  for (let row = 0; row < rows; row++) {
    const y = row * pixelSize;

    for (let col = 0; col < cols; col++) {
      const x = col * pixelSize;
      const hex = colorGrid[row][col];

      // --- Flat colour fill ------------------------------------------------
      ctx.fillStyle = hex;
      ctx.fillRect(x, y, pixelSize, pixelSize);

      // --- Stud circle (only when pixelSize is large enough to matter) -----
      if (pixelSize >= 6) {
        const cx = x + halfPixel;
        const cy = y + halfPixel;

        // Semi-transparent lighter overlay for the stud top.
        ctx.beginPath();
        ctx.arc(cx, cy, studRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.fill();

        // Thin darker ring around the stud.
        ctx.beginPath();
        ctx.arc(cx, cy, studRadius, 0, Math.PI * 2);
        ctx.closePath();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
        ctx.lineWidth = Math.max(1, pixelSize * 0.06);
        ctx.stroke();
      }

      // --- Subtle grid line on right & bottom edges -----------------------
      if (pixelSize >= 4) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
        ctx.lineWidth = 1;

        // Right edge.
        ctx.beginPath();
        ctx.moveTo(x + pixelSize, y);
        ctx.lineTo(x + pixelSize, y + pixelSize);
        ctx.stroke();

        // Bottom edge.
        ctx.beginPath();
        ctx.moveTo(x, y + pixelSize);
        ctx.lineTo(x + pixelSize, y + pixelSize);
        ctx.stroke();
      }
    }
  }

  const dataURL = canvas.toDataURL('image/png');

  // Free GPU memory from the preview canvas.
  canvas.width = 0;
  canvas.height = 0;

  return dataURL;
}
