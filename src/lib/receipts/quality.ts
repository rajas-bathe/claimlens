import type { CaptureQuality } from "@/types";

/** Conservative signals, not a calibrated image-quality classifier. No pixels are changed. */
export function assessPixels(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): CaptureQuality {
  const gray = new Float64Array(width * height);
  let sum = 0,
    square = 0,
    white = 0,
    edgeDark = 0,
    edgeCount = 0;
  for (let i = 0; i < gray.length; i++) {
    const value =
      0.299 * pixels[i * 4] +
      0.587 * pixels[i * 4 + 1] +
      0.114 * pixels[i * 4 + 2];
    gray[i] = value;
    sum += value;
    square += value * value;
    if (value > 252) white++;
    const x = i % width,
      y = Math.floor(i / width);
    if (x < 2 || y < 2 || x >= width - 2 || y >= height - 2) {
      edgeCount++;
      if (value < 100) edgeDark++;
    }
  }
  let lapSum = 0,
    lapSquare = 0,
    n = 0;
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x,
        lap =
          4 * gray[i] -
          gray[i - 1] -
          gray[i + 1] -
          gray[i - width] -
          gray[i + width];
      lapSum += lap;
      lapSquare += lap * lap;
      n++;
    }
  const contrast = Math.sqrt(
    Math.max(0, square / gray.length - (sum / gray.length) ** 2),
  );
  const sharpness = n ? Math.max(0, lapSquare / n - (lapSum / n) ** 2) : 0;
  const issues: CaptureQuality["issues"] = [];
  if (sharpness < 35 && contrast > 8)
    issues.push({
      kind: "blur",
      source: "pixel_heuristic",
      message:
        "Soft edges may make small print unreadable. Hold the camera steady, tap to focus and retake.",
    });
  if (contrast < 12)
    issues.push({
      kind: "faded",
      source: "pixel_heuristic",
      message:
        "Very little text contrast was found. Try even lighting or obtain a clearer original.",
    });
  // White paper alone is not glare. Only flag almost blank, low-contrast clipping here;
  // localized reflection needs the vision warning or a human comparison.
  if (white / gray.length > 0.985 && contrast < 12)
    issues.push({
      kind: "glare",
      source: "pixel_heuristic",
      message:
        "The image is almost entirely clipped white with little text contrast. It may be blank or overexposed; move away from direct light and inspect the text.",
    });
  if (edgeDark / Math.max(1, edgeCount) > 0.32 && sum / gray.length > 175)
    issues.push({
      kind: "cutoff",
      source: "pixel_heuristic",
      message:
        "Dark detail meets the image edge. Check that all receipt edges, the date and total are inside the frame.",
    });
  return {
    checked_at: new Date().toISOString(),
    status: "checked",
    width,
    height,
    metrics: {
      sharpness: Math.round(sharpness * 100) / 100,
      contrast: Math.round(contrast * 100) / 100,
      clipped_white_fraction: white / gray.length,
    },
    issues,
    note: "Heuristic capture checks can miss defects or raise false alarms. A clean result does not prove legibility or authenticity.",
  };
}
