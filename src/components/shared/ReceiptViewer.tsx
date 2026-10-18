"use client";

import { useRef, useState } from "react";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  FileText,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ReceiptViewer({
  receiptUrl,
  mimeType,
  fileName,
}: {
  receiptUrl: string | null;
  mimeType?: string | null;
  fileName?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [imageError, setImageError] = useState(false);
  const drag = useRef<{
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  if (!receiptUrl)
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-500 text-sm">
        <FileText className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p>No receipt preview available.</p>
        <p className="text-xs mt-2">
          Review the extracted evidence below. A missing preview does not
          establish receipt validity.
        </p>
      </div>
    );
  const isPdf = mimeType === "application/pdf" || receiptUrl.endsWith(".pdf");
  function reset() {
    setZoom(1);
    setRotation(0);
    setOffset({ x: 0, y: 0 });
  }
  return (
    <section className="bg-white border border-gray-200 rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap gap-2 items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-xs font-semibold text-gray-700">
            Original receipt
          </h2>
          <p className="text-[10px] text-gray-500 truncate max-w-[180px] mt-1">
            {fileName ?? "Receipt evidence"}
          </p>
        </div>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label="Receipt preview controls"
        >
          {!isPdf && (
            <>
              <button
                type="button"
                disabled={zoom >= 3}
                onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                className="p-2 text-gray-500 rounded hover:bg-gray-100 disabled:opacity-30"
                aria-label="Zoom in"
                title="Zoom in"
              >
                <ZoomIn size={16} />
              </button>
              <span
                className="text-[10px] text-gray-500 tabular-nums"
                aria-live="polite"
              >
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                disabled={zoom <= 0.5}
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                className="p-2 text-gray-500 rounded hover:bg-gray-100 disabled:opacity-30"
                aria-label="Zoom out"
                title="Zoom out"
              >
                <ZoomOut size={16} />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-2 text-gray-500 rounded hover:bg-gray-100"
                aria-label="Rotate receipt"
                title="Rotate receipt"
              >
                <RotateCw size={16} />
              </button>
              <button
                type="button"
                onClick={reset}
                className="p-2 text-gray-500 rounded hover:bg-gray-100"
                aria-label="Reset receipt view"
                title="Reset view"
              >
                <RotateCcw size={16} />
              </button>
            </>
          )}
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 text-gray-500 rounded hover:bg-gray-100 inline-flex items-center justify-center"
            aria-label="Open original receipt in a new tab"
            title="Open original receipt"
          >
            <Maximize2 size={16} />
          </a>
        </div>
      </div>
      <div
        className={cn(
          "receipt-canvas relative h-[360px] overflow-hidden flex items-center justify-center p-5",
          dragging && "is-dragging",
        )}
        tabIndex={isPdf ? undefined : 0}
        role={isPdf ? undefined : "region"}
        aria-label={
          isPdf
            ? undefined
            : "Receipt preview. Use arrow keys to pan and Home to reset."
        }
        onKeyDown={(event) => {
          if (isPdf) return;
          const step = 25;
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
            ].includes(event.key)
          ) {
            event.preventDefault();
            if (event.key === "Home") reset();
            else
              setOffset((o) => ({
                x:
                  o.x +
                  (event.key === "ArrowLeft"
                    ? step
                    : event.key === "ArrowRight"
                      ? -step
                      : 0),
                y:
                  o.y +
                  (event.key === "ArrowUp"
                    ? step
                    : event.key === "ArrowDown"
                      ? -step
                      : 0),
              }));
          }
        }}
        onPointerDown={(event) => {
          if (isPdf || event.pointerType === "touch") return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            y: event.clientY,
            originX: offset.x,
            originY: offset.y,
          };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (drag.current)
            setOffset({
              x: drag.current.originX + event.clientX - drag.current.x,
              y: drag.current.originY + event.clientY - drag.current.y,
            });
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        {isPdf ? (
          <iframe
            src={receiptUrl + "#toolbar=0"}
            className="w-full h-full border-0 rounded"
            title="Receipt PDF"
          />
        ) : imageError ? (
          <div role="alert" className="text-center text-sm text-gray-600">
            <p>The preview couldn’t load.</p>
            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline inline-block mt-3"
            >
              Try opening the original receipt
            </a>
          </div>
        ) : (
          <img
            src={receiptUrl}
            alt="Original receipt evidence"
            draggable={false}
            onError={() => setImageError(true)}
            style={{
              transform:
                "translate(" +
                offset.x +
                "px," +
                offset.y +
                "px) scale(" +
                zoom +
                ") rotate(" +
                rotation +
                "deg)",
              transition: dragging ? "none" : "transform .15s ease-out",
              maxHeight: "100%",
              maxWidth: "100%",
              objectFit: "contain",
            }}
          />
        )}
      </div>
      <p className="receipt-help">
        {isPdf
          ? "PDF preview · Open the original if your browser cannot display this file."
          : "Drag or use arrow keys to pan · Home resets the view."}
      </p>
    </section>
  );
}
