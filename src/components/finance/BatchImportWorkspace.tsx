"use client";

import type { Membership, UserSession } from "@/types";
import { validateFileType, validateFileSize, hashFile } from "@/lib/utils";
import { useState, useRef } from "react";
import { Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/tiff",
  "application/pdf",
];
const MAX_SIZE = 20 * 1024 * 1024;

interface FileImportState {
  file: File;
  employeeId: string;
  status: "pending" | "uploading" | "extracting" | "done" | "error";
  error: string | null;
  expenseId: string | null;
  extracted?: boolean;
}

export function BatchImportWorkspace({
  members,
  session: _,
}: {
  members: Membership[];
  session: UserSession;
}) {
  const [files, setFiles] = useState<FileImportState[]>([]);
  const [running, setRunning] = useState(false);
  const [fileMessage, setFileMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []).filter(
      (f) =>
        validateFileType(f, ACCEPTED_TYPES) && validateFileSize(f, MAX_SIZE),
    );
    const skipped = (e.target.files?.length ?? 0) - selected.length;
    setFileMessage(
      skipped
        ? `${skipped} files were not added. Use JPEG, PNG, WebP, TIFF or PDF, up to 20 MB each.`
        : null,
    );
    const defaultEmp = members[0]?.user_id ?? "";
    const newStates: FileImportState[] = selected.map((f) => ({
      file: f,
      employeeId: defaultEmp,
      status: "pending",
      error: null,
      expenseId: null,
    }));
    setFiles((prev) => [...prev, ...newStates]);
  }

  function setEmployee(idx: number, employeeId: string) {
    setFiles((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, employeeId } : f)),
    );
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function processFile(
    idx: number,
    state: FileImportState,
  ): Promise<void> {
    if (!state.employeeId) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === idx
            ? { ...f, status: "error", error: "Employee not assigned" }
            : f,
        ),
      );
      return;
    }
    setFiles((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, status: "uploading" } : f)),
    );
    try {
      let expenseId = state.expenseId;
      if (!expenseId) {
        const fileHash = await hashFile(state.file);
        const createRes = await fetch("/api/expenses/batch-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_hash: fileHash,
            file_name: state.file.name,
            file_size: state.file.size,
            mime_type: state.file.type,
            employee_id: state.employeeId,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok)
          throw new Error(createData.error ?? "Failed to create");
        expenseId = createData.data.expense_id;

        const supabase = createClient();
        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .uploadToSignedUrl(
            createData.data.upload_path,
            createData.data.upload_token,
            state.file,
            {
              contentType: state.file.type,
            },
          );

        if (uploadError)
          throw new Error(`Upload failed: ${uploadError.message}`);

        setFiles((prev) =>
          prev.map((f, i) =>
            i === idx ? { ...f, status: "extracting", expenseId } : f,
          ),
        );
      }
      if (!state.extracted) {
        const extractRes = await fetch(`/api/expenses/${expenseId}/extract`, {
          method: "POST",
        });
        if (!extractRes.ok) {
          const d = await extractRes.json();
          throw new Error(d.error ?? "Extraction failed");
        }
        setFiles((prev) =>
          prev.map((f, i) => (i === idx ? { ...f, extracted: true } : f)),
        );
      }

      // Also trigger initial policy evaluation
      const evaluationResponse = await fetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_status: "submitted",
          request_id: crypto.randomUUID(),
          note: "Finance batch import submitted on behalf of the assigned employee.",
        }),
      });
      if (!evaluationResponse.ok) {
        const failure = await evaluationResponse.json();
        throw new Error(
          "Receipt extracted, but checks were not recorded: " +
            (failure.error ?? "Retry from the review page."),
        );
      }

      setFiles((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, status: "done" } : f)),
      );
    } catch (err) {
      setFiles((prev) =>
        prev.map((f, i) =>
          i === idx
            ? {
                ...f,
                status: "error",
                error: err instanceof Error ? err.message : "Failed",
              }
            : f,
        ),
      );
    }
  }

  async function handleRunAll() {
    setRunning(true);
    for (let i = 0; i < files.length; i++) {
      if (files[i].status === "pending" || files[i].status === "error") {
        await processFile(i, files[i]);
      }
    }
    setRunning(false);
  }

  return (
    <div className="space-y-6">
      <div className="workflow-hint">
        <strong>Bring receipts together.</strong> Add files, check the employee
        assigned to each receipt, then import. Each file keeps its own progress
        and error details.
      </div>
      {!members.length && (
        <p role="status" className="workflow-hint">
          No employees are available to assign receipts. Import is unavailable
          until an employee belongs to this workspace.
        </p>
      )}
      {fileMessage && (
        <p
          role="alert"
          className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-4"
        >
          {fileMessage}
        </p>
      )}
      {/* Upload zone */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 hover:bg-gray-100/50 transition-colors">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
          <p className="font-medium text-gray-800">Add batch receipt files</p>
          <p className="text-sm text-gray-500 mt-1">
            JPEG, PNG, WebP, TIFF, PDF · up to 20 MB each
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={running}
            className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
          >
            Browse files
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPTED_TYPES.join(",")}
            onChange={handleFilesSelected}
            className="sr-only"
            aria-label="Add receipt files"
          />
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-medium text-gray-900">
              {files.length} receipts ·{" "}
              {files.filter((f) => f.status === "done").length} extracted
            </h2>
            <button
              type="button"
              onClick={handleRunAll}
              disabled={
                running ||
                !members.length ||
                files.every((f) => f.status === "done")
              }
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-60"
            >
              {running && <Loader2 className="w-4 h-4 animate-spin" />}
              Import all
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {files.map((f, idx) => (
              <div
                key={idx}
                className="px-5 py-3.5 flex flex-wrap items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {f.file.name}
                  </p>
                  <p className="text-xs text-gray-400">
                    {(f.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  {f.error && (
                    <p className="text-xs text-red-600 mt-0.5">{f.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`assign-emp-${idx}`}
                    className="text-xs text-gray-500"
                  >
                    Employee:
                  </label>
                  <select
                    id={`assign-emp-${idx}`}
                    value={f.employeeId}
                    onChange={(e) => setEmployee(idx, e.target.value)}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    disabled={
                      running || f.status === "done" || Boolean(f.expenseId)
                    }
                  >
                    {members.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.display_name ?? m.email ?? m.user_id}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 min-w-[80px] justify-end">
                  {f.status === "pending" && (
                    <span className="text-xs text-gray-400">Pending</span>
                  )}
                  {(f.status === "uploading" || f.status === "extracting") && (
                    <span className="flex items-center gap-1 text-xs text-blue-600 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {f.status === "uploading" ? "Uploading" : "Extracting"}
                    </span>
                  )}
                  {f.expenseId && (
                    <a
                      className="text-blue-600 underline text-xs"
                      href={`/dashboard/finance/review/${f.expenseId}`}
                    >
                      Review receipt
                    </a>
                  )}
                  {f.status === "done" && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Extracted
                    </span>
                  )}
                  {f.status === "error" && (
                    <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
                      <XCircle className="w-3.5 h-3.5" /> Error
                    </span>
                  )}
                  {f.status !== "done" && !running && (
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="text-gray-400 hover:text-gray-600 text-xs ml-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
