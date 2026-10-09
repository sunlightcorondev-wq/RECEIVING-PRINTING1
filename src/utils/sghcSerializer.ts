import { ReceivingFormModel } from '../types';

/**
 * Checks whether a given string is a properly formatted serialized SGHC code.
 * E.g. "SGHC 2026-10-0001", "SGHC 2026-06-0012", "SGHC-2026-10-0005"
 */
export function isSerializedSghcCode(code?: string): boolean {
  if (!code || typeof code !== 'string') return false;
  const regex = /^SGHC\s*[-]?\s*\d{4}[-_]\d{2}[-_]\d{3,}$/i;
  return regex.test(code.trim());
}

/**
 * Generate a sequential serialized code for the SGHC section:
 * Format: SGHC YYYY-MM-XXXX (e.g. SGHC 2026-10-0001)
 * Scans saved receipts, current form, and local sequence counters to guarantee a sequential, unique number.
 */
export function generateSerializedSghcCode(
  existingList?: ReceivingFormModel[],
  autoAdvance: boolean = true
): string {
  const now = new Date();
  const yearMonth = now.toISOString().split('T')[0].slice(0, 7); // e.g. "2026-10"

  // Check saved receipts from parameter or localStorage
  let receipts = existingList;
  if (!receipts) {
    try {
      const stored = localStorage.getItem('sunlight_saved_receipts');
      if (stored) {
        receipts = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Could not read saved receipts for serialization:', e);
    }
  }

  let maxSeq = 0;
  // Regex to match "SGHC 2026-10-0001", "SGHC 2026-06-0012", "SGHC-2026-10-0005", etc.
  const regex = /SGHC\s*[-]?\s*(\d{4})[-_](\d{2})[-_](\d+)/i;

  if (Array.isArray(receipts)) {
    for (const r of receipts) {
      if (!r || !r.sghcNo) continue;
      const match = r.sghcNo.match(regex);
      if (match) {
        const itemYm = `${match[1]}-${match[2]}`;
        const num = parseInt(match[3], 10);
        if (itemYm === yearMonth && !isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  // Also check currently active form in localStorage
  try {
    const currentStored = localStorage.getItem('sunlight_current_receiving');
    if (currentStored) {
      const parsedCurrent = JSON.parse(currentStored);
      if (parsedCurrent && parsedCurrent.sghcNo) {
        const match = parsedCurrent.sghcNo.match(regex);
        if (match) {
          const itemYm = `${match[1]}-${match[2]}`;
          const num = parseInt(match[3], 10);
          if (itemYm === yearMonth && !isNaN(num) && num > maxSeq) {
            maxSeq = num;
          }
        }
      }
    }
  } catch {}

  // Also check stored sequence counter in localStorage
  try {
    const storedCounterKey = `sunlight_sghc_seq_${yearMonth}`;
    const storedCounter = parseInt(localStorage.getItem(storedCounterKey) || '0', 10);
    if (!isNaN(storedCounter) && storedCounter > maxSeq) {
      maxSeq = storedCounter;
    }
  } catch {}

  const nextSeq = maxSeq + 1;
  const seqStr = String(nextSeq).padStart(4, '0');
  const code = `SGHC ${yearMonth}-${seqStr}`;

  if (autoAdvance) {
    try {
      const storedCounterKey = `sunlight_sghc_seq_${yearMonth}`;
      localStorage.setItem(storedCounterKey, String(nextSeq));
    } catch {}
  }

  return code;
}

/**
 * Ensure a given SGHC code is serialized. If valid, normalize and return it.
 * If missing, invalid, or arbitrary text (like a raw filename), generate a serialized code.
 */
export function ensureSerializedSghcCode(
  code?: string,
  existingList?: ReceivingFormModel[]
): string {
  if (code && isSerializedSghcCode(code)) {
    // Normalize format to "SGHC YYYY-MM-XXXX"
    const match = code.trim().match(/SGHC\s*[-]?\s*(\d{4})[-_](\d{2})[-_](\d+)/i);
    if (match) {
      const ym = `${match[1]}-${match[2]}`;
      const num = parseInt(match[3], 10);
      return `SGHC ${ym}-${String(num).padStart(4, '0')}`;
    }
    return code.trim();
  }
  return generateSerializedSghcCode(existingList);
}

/**
 * Record that an SGHC code has been used/saved so the next code will increment sequentially
 */
export function recordSghcCodeUsed(sghcNo: string): void {
  const regex = /SGHC\s*[-]?\s*(\d{4})[-_](\d{2})[-_](\d+)/i;
  const match = sghcNo.match(regex);
  if (match) {
    const yearMonth = `${match[1]}-${match[2]}`;
    const num = parseInt(match[3], 10);
    if (!isNaN(num)) {
      try {
        const storedCounterKey = `sunlight_sghc_seq_${yearMonth}`;
        const current = parseInt(localStorage.getItem(storedCounterKey) || '0', 10);
        if (num >= current) {
          localStorage.setItem(storedCounterKey, String(num));
        }
      } catch {}
    }
  }
}
