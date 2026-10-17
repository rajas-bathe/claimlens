import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes with clsx */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a monetary amount with currency symbol */
export function formatCurrency(
  amount: number | null | undefined,
  currency: string | null | undefined,
  options?: Intl.NumberFormatOptions
): string {
  if (amount === null || amount === undefined) return '—';
  const curr = currency?.toUpperCase() ?? 'USD';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(amount);
  } catch {
    return `${curr} ${amount.toFixed(2)}`;
  }
}

/** Format a date string (ISO or YYYY-MM-DD) to a readable format */
export function formatDate(
  date: string | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium'
): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return date;
    return new Intl.DateTimeFormat('en-US', { dateStyle: style }).format(d);
  } catch {
    return date;
  }
}

/** Format a datetime string */
export function formatDateTime(datetime: string | null | undefined): string {
  if (!datetime) return '—';
  try {
    const d = new Date(datetime);
    if (isNaN(d.getTime())) return datetime;
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return datetime;
  }
}

/** Capitalize first letter */
export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convert snake_case to Title Case */
export function snakeToTitle(s: string): string {
  return s.split('_').map(capitalize).join(' ');
}

/** Truncate text to max length */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '…';
}

/** Safe JSON parse – returns null on failure */
export function safeJsonParse<T>(json: string | null | undefined): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Sleep for a given number of milliseconds */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compute SHA-256 hash of a File using Web Crypto API */
export async function hashFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Validate file type against allowed MIME types */
export function validateFileType(file: File, allowed: string[]): boolean {
  return allowed.includes(file.type);
}

/** Validate file size in bytes */
export function validateFileSize(file: File, maxBytes: number): boolean {
  return file.size <= maxBytes;
}

/** Get initials from a name */
export function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}
