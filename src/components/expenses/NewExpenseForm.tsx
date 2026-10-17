'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { UserSession, TripContext } from '@/types';
import { cn, validateFileType, validateFileSize, hashFile } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  Upload,
  FileImage,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff', 'application/pdf'];
const MAX_SIZE = 20 * 1024 * 1024;

const CATEGORIES = [
  'Accommodation',
  'Business meals',
  'Client entertainment',
  'Ground transport',
  'Air travel',
  'Office supplies',
  'Telecoms',
  'Training & conferences',
  'Other',
];

const TRIP_CONTEXTS: { value: TripContext; label: string }[] = [
  { value: 'business_trip', label: 'Business trip' },
  { value: 'office', label: 'Office / local' },
  { value: 'other', label: 'Other' },
];

const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-gray-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function StatusMsg({ icon, color, message, action }: { icon: React.ReactNode; color: 'blue' | 'green' | 'red'; message: string; action?: React.ReactNode }) {
  const colors = { blue: 'bg-blue-50 text-blue-700 border-blue-200', green: 'bg-green-50 text-green-700 border-green-200', red: 'bg-red-50 text-red-700 border-red-200' };
  return (
    <div className={cn('flex items-center gap-2 px-4 py-3 rounded-md border text-sm', colors[color])}>
      {icon}{' '}<span>{message}</span>{action}
    </div>
  );
}

export function NewExpenseForm({ session }: { session: UserSession }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [merchant, setMerchant] = useState('');
  const [expenseDate, setExpenseDate] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [category, setCategory] = useState('');
  const [city, setCity] = useState('');
  const [tripContext, setTripContext] = useState<TripContext>('office');
  const [businessPurpose, setBusinessPurpose] = useState('');
  const [clientName, setClientName] = useState('');
  const [attendeeCount, setAttendeeCount] = useState('');
  const [stage, setStage] = useState<'idle' | 'uploading' | 'extracting' | 'ready' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expenseId, setExpenseId] = useState<string | null>(null);
  const needsClient = category === 'Client entertainment';

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileError(null);
    if (!validateFileType(f, ACCEPTED_TYPES)) { setFileError('Please upload a JPEG, PNG, WebP, TIFF, or PDF file.'); return; }
    if (!validateFileSize(f, MAX_SIZE)) { setFileError('File must be smaller than 20 MB.'); return; }
    setFile(f);
    if (f.type !== 'application/pdf') { setPreviewUrl(URL.createObjectURL(f)); } else { setPreviewUrl(null); }
    setZoom(1); setRotation(0);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const dt = new DataTransfer(); dt.items.add(f);
    if (fileInputRef.current) fileInputRef.current.files = dt.files;
    handleFileChange({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
  }

  async function handleUploadAndExtract() {
    if (!file) return;
    setErrorMsg(null); setStage('uploading');
    try {
      const fileHash = await hashFile(file);
      const createRes = await fetch('/api/expenses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_hash: fileHash, file_name: file.name, file_size: file.size, mime_type: file.type }) });
      const createData = await createRes.json();
      if (!createRes.ok || !createData.data?.expense_id) throw new Error(createData.error ?? 'Failed to create expense');
      const newExpenseId = createData.data.expense_id;
      setExpenseId(newExpenseId);
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from('receipts').uploadToSignedUrl(createData.data.upload_path, createData.data.upload_token, file, { contentType: file.type });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      setStage('extracting');
      const extractRes = await fetch(`/api/expenses/${newExpenseId}/extract`, { method: 'POST' });
      const extractData = await extractRes.json();
      if (!extractRes.ok) throw new Error(extractData.error ?? 'Extraction failed');
      const ext = extractData.data?.extraction;
      if (ext) {
        if (ext.merchant?.value) setMerchant(ext.merchant.value);
        if (ext.normalized_date?.value) setExpenseDate(ext.normalized_date.value);
        if (ext.total?.value != null) setAmount(String(ext.total.value));
        if (ext.normalized_currency?.value) setCurrency(ext.normalized_currency.value);
        if (ext.suggested_category) setCategory(ext.suggested_category);
      }
      setStage('ready');
    } catch (err) { setStage('error'); setErrorMsg(err instanceof Error ? err.message : 'An error occurred'); }
  }

  async function handleSave(e: React.FormEvent, asDraft = false) {
    e.preventDefault();
    if (!expenseId) return;
    setErrorMsg(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/expenses/${expenseId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant, expense_date: expenseDate, original_amount: amount ? parseFloat(amount) : null, original_currency: currency, category, city, trip_context: tripContext, business_purpose: businessPurpose, client_name: needsClient ? clientName : null, attendee_count: needsClient && attendeeCount ? parseInt(attendeeCount) : null, review_status: asDraft ? 'draft' : 'submitted' }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to save');
        router.push(`/dashboard/expenses/${expenseId}`); router.refresh();
      } catch (err) { setErrorMsg(err instanceof Error ? err.message : 'Failed to save expense'); }
    });
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100"><h2 className="font-medium text-gray-900">Receipt</h2></div>
        {!file ? (
          <div className="m-6" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
            <button type="button" onClick={() => fileInputRef.current?.click()} className={cn('w-full border-2 border-dashed rounded-lg p-10 text-center transition-colors', fileError ? 'border-red-300 bg-red-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50 bg-gray-50')}>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <p className="font-medium text-gray-700">Drop your receipt here or click to browse</p>
              <p className="text-sm text-gray-400 mt-1">JPEG, PNG, WebP, TIFF, PDF · Max 20 MB</p>
              {fileError && <p className="text-sm text-red-600 mt-2">{fileError}</p>}
            </button>
            <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES.join(',')} onChange={handleFileChange} className="sr-only" aria-label="Upload receipt" />
          </div>
        ) : (
          <div className="p-6 space-y-4">
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-900 flex items-center justify-center" style={{ height: 320 }}>
                <img src={previewUrl} alt="Receipt preview" style={{ transform: `scale(${zoom}) rotate(${rotation}deg)`, transition: 'transform 0.2s', maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
                <div className="absolute top-3 right-3 flex gap-1.5">
                  <button type="button" onClick={() => setZoom(z => Math.min(z + 0.25, 3))} className="p-1.5 bg-black/50 text-white rounded hover:bg-black/70" aria-label="Zoom in"><ZoomIn className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setZoom(z => Math.max(z - 0.25, 0.5))} className="p-1.5 bg-black/50 text-white rounded hover:bg-black/70" aria-label="Zoom out"><ZoomOut className="w-4 h-4" /></button>
                  <button type="button" onClick={() => setRotation(r => (r + 90) % 360)} className="p-1.5 bg-black/50 text-white rounded hover:bg-black/70" aria-label="Rotate"><RotateCw className="w-4 h-4" /></button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <FileImage className="w-8 h-8 text-gray-400" />
                <div><p className="font-medium text-gray-900 text-sm">{file.name}</p><p className="text-xs text-gray-400">{(file.size/1024/1024).toFixed(1)} MB · PDF</p></div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600"><span className="font-medium">{file.name}</span> <span className="text-gray-400">({(file.size/1024/1024).toFixed(1)} MB)</span></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setFile(null); setPreviewUrl(null); setStage('idle'); setExpenseId(null); }} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-md">Remove</button>
                {stage === 'idle' && <button type="button" onClick={handleUploadAndExtract} className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700">Extract data</button>}
              </div>
            </div>
            {stage === 'uploading' && <StatusMsg icon={<Loader2 className="w-4 h-4 animate-spin" />} color="blue" message="Uploading receipt..." />}
            {stage === 'extracting' && <StatusMsg icon={<Loader2 className="w-4 h-4 animate-spin" />} color="blue" message="Extracting data with AI... This takes a moment." />}
            {stage === 'ready' && <StatusMsg icon={<CheckCircle2 className="w-4 h-4" />} color="green" message="Data extracted. Review and correct the fields below." />}
            {stage === 'error' && <StatusMsg icon={<AlertTriangle className="w-4 h-4" />} color="red" message={errorMsg ?? 'Extraction failed.'} action={<button type="button" onClick={handleUploadAndExtract} className="text-sm font-medium underline ml-2">Retry</button>} />}
          </div>
        )}
      </div>
      {(stage === 'ready' || stage === 'error') && (
        <form onSubmit={e => handleSave(e, false)} className="space-y-6">
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-6 py-4 border-b border-gray-100"><h2 className="font-medium text-gray-900">Expense details</h2><p className="text-sm text-gray-500 mt-0.5">Review and correct the extracted information.</p></div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Field label="Merchant" required><input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} className={inputCls} placeholder="e.g. Hilton Hotels" required /></Field>
              <Field label="Date" required><input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className={inputCls} required /></Field>
              <Field label="Amount" required>
                <div className="flex gap-2">
                  <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} className={cn(inputCls, 'flex-1')} placeholder="0.00" required />
                  <input type="text" value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} className={cn(inputCls, 'w-20 uppercase font-mono')} maxLength={3} placeholder="USD" />
                </div>
              </Field>
              <Field label="Category" required><select value={category} onChange={e => setCategory(e.target.value)} className={inputCls} required><option value="">Select category...</option>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></Field>
              <Field label="City"><input type="text" value={city} onChange={e => setCity(e.target.value)} className={inputCls} placeholder="e.g. New York" /></Field>
              <Field label="Context" required><select value={tripContext} onChange={e => setTripContext(e.target.value as TripContext)} className={inputCls} required>{TRIP_CONTEXTS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
              <div className="sm:col-span-2"><Field label="Business purpose" required><textarea value={businessPurpose} onChange={e => setBusinessPurpose(e.target.value)} rows={2} className={cn(inputCls, 'resize-none')} placeholder="Briefly describe the business reason..." required /></Field></div>
              {needsClient && (
                <>
                  <Field label="Client name" required><input type="text" value={clientName} onChange={e => setClientName(e.target.value)} className={inputCls} placeholder="Client or company name" required /></Field>
                  <Field label="Number of attendees"><input type="number" min="1" value={attendeeCount} onChange={e => setAttendeeCount(e.target.value)} className={inputCls} placeholder="e.g. 4" /></Field>
                </>
              )}
            </div>
          </div>
          {errorMsg && <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{errorMsg}</div>}
          <div className="flex items-center gap-3 justify-end">
            <button type="button" onClick={e => handleSave(e as unknown as React.FormEvent, true)} disabled={isPending} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-60">Save as draft</button>
            <button type="submit" disabled={isPending} className="px-5 py-2 text-sm font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2">{isPending && <Loader2 className="w-4 h-4 animate-spin" />}Submit for review</button>
          </div>
        </form>
      )}
    </div>
  );
}
