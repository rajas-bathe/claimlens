import sharp from "sharp";
import { assessPixels } from "./quality";
import type { CaptureQuality } from "@/types";
export async function checkCapture(
  buffer: Buffer,
  mime: string,
): Promise<CaptureQuality> {
  if (mime === "application/pdf")
    return {
      checked_at: new Date().toISOString(),
      status: "unavailable",
      issues: [],
      note: "Pixel capture checks are unavailable for PDF pages. Inspect the original document and extraction evidence.",
    };
  try {
    const { data, info } = await sharp(buffer, { limitInputPixels: 40000000 })
      .rotate()
      .resize({
        width: 900,
        height: 1200,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return assessPixels(data, info.width, info.height);
  } catch {
    return {
      checked_at: new Date().toISOString(),
      status: "unavailable",
      issues: [],
      note: "This image could not be decoded for capture checks. Use JPEG, PNG or WebP and inspect it manually.",
    };
  }
}
