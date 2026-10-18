import sharp from "sharp";
import { createWorker, OEM } from "tesseract.js";
import { createRequire } from "node:module";
import type { OcrEvidence } from "@/types";
let busy = false;
/** Independent, local English printed-text OCR. Packaged model data means no remote image transfer. */
export async function runLocalOcr(buffer: Buffer): Promise<OcrEvidence> {
  if (busy)
    throw new Error("Another OCR check is running. Please retry shortly.");
  busy = true;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const require = createRequire(process.cwd() + "/package.json");
    const language = require("@tesseract.js-data/eng") as {
      langPath: string;
      gzip: boolean;
    };
    const { data: image, info } = await sharp(buffer, {
      limitInputPixels: 40000000,
    })
      .rotate()
      .resize({
        width: 1800,
        height: 2400,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    worker = await createWorker("eng", OEM.LSTM_ONLY, {
      langPath: language.langPath,
      gzip: true,
      cacheMethod: "none",
    });
    timer = setTimeout(() => {
      void worker?.terminate();
    }, 45000);
    let { data } = await worker.recognize(
      image,
      {},
      { text: true, blocks: true },
    );
    let angle = 0,
      readingWidth = info.width,
      readingHeight = info.height;
    if (data.confidence < 60) {
      // Retry only a low-confidence reading. Keep the original and map boxes back to it.
      for (const rotation of [90, 180, 270]) {
        const turned = await sharp(image)
          .rotate(rotation)
          .png()
          .toBuffer({ resolveWithObject: true });
        const candidate = await worker.recognize(
          turned.data,
          {},
          { text: true, blocks: true },
        );
        if (
          candidate.data.confidence > data.confidence &&
          candidate.data.text.trim().split(/\s+/).length >= 5
        ) {
          data = candidate.data;
          angle = rotation;
          readingWidth = turned.info.width;
          readingHeight = turned.info.height;
        }
      }
    }
    const toOriginal = (x: number, y: number): [number, number] =>
      angle === 90
        ? [y, 1 - x]
        : angle === 180
          ? [1 - x, 1 - y]
          : angle === 270
            ? [1 - y, x]
            : [x, y];
    const words = (data.blocks ?? [])
      .flatMap((block) =>
        block.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)),
      )
      .filter((w) => w.text.trim())
      .slice(0, 2500)
      .map((w) => {
        const corners = [
          [w.bbox.x0, w.bbox.y0],
          [w.bbox.x1, w.bbox.y1],
        ].map(([x, y]) => toOriginal(x / readingWidth, y / readingHeight));
        return {
          text: w.text,
          confidence: w.confidence,
          box: [
            Math.min(...corners.map((p) => p[0])),
            Math.min(...corners.map((p) => p[1])),
            Math.max(...corners.map((p) => p[0])),
            Math.max(...corners.map((p) => p[1])),
          ] as [number, number, number, number],
        };
      });
    const quality_issues: NonNullable<OcrEvidence["quality_issues"]> = [];
    if (
      words.some(
        (w) =>
          w.box[0] < 0.002 ||
          w.box[1] < 0.002 ||
          w.box[2] > 0.998 ||
          w.box[3] > 0.998,
      )
    )
      quality_issues.push({
        kind: "cutoff",
        source: "ocr_geometry",
        message:
          "Recognized text reaches an image edge. Check whether characters, date or total were cropped.",
      });
    const tilted = (data.blocks ?? [])
      .flatMap((b) => b.paragraphs.flatMap((p) => p.lines))
      .some(
        (line) =>
          Math.abs(
            Math.atan2(
              line.baseline.y1 - line.baseline.y0,
              line.baseline.x1 - line.baseline.x0,
            ),
          ) > 0.21,
      );
    if (tilted || angle)
      quality_issues.push({
        kind: "distortion",
        source: "ocr_geometry",
        message:
          "OCR needed a rotated reading or detected strongly tilted text. Inspect the original orientation; this signal does not measure every kind of perspective distortion.",
      });
    return {
      checked_at: new Date().toISOString(),
      engine: "tesseract-eng",
      text: data.text.slice(0, 50000),
      confidence: data.confidence,
      words,
      quality_issues,
      note:
        "Local English printed-text OCR; boxes locate OCR words, not verified truth. Reading derivative rotation: " +
        angle +
        " degrees; original retained. Handwriting, languages and image defects may reduce accuracy. An OCR disagreement requests review, not rejection.",
    };
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) await worker.terminate().catch(() => {});
    busy = false;
  }
}
