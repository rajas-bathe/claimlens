'use client';

import { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCw, Maximize2, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  if (!receiptUrl) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center text-gray-400 text-sm">
        <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        No receipt file preview available.
      </div>
    );
  }

  const isPdf = mimeType === 'application/pdf' || receiptUrl.endsWith('.pdf');

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm flex flex-col">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
        <span className="text-xs font-semibold text-gray-700 truncate max-w-[200px]">
          {fileName ?? 'Receipt Evidence'}
        </span>
        <div className="flex items-center gap-1">
          {!isPdf && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(z + 0.25, 3))}
                className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
                title="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(z - 0.25, 0.5))}
                className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
                title="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
                title="Rotate 90 degrees"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </>
          )}
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-500 hover:text-gray-700 rounded hover:bg-gray-200"
            title="Open in new tab"
          >
            <Maximize2 className="w-4 h-4" />
          </a>
        </div>
      </div>

      <div className="relative h-[360px] bg-gray-900 overflow-hidden flex items-center justify-center p-4">
        {isPdf ? (
          <iframe
            src={`${receiptUrl}#toolbar=0`}
            className="w-full h-full border-0 rounded"
            title="Receipt PDF"
          />
        ) : (
          <img
            src={receiptUrl}
            alt="Receipt evidence"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: 'transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
            }}
          />
        )}
      </div>
    </div>
  );
}
