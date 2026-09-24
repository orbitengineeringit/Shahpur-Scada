import type { TagData } from '@/contexts/ScadaContext';

/**
 * The RTUs normally publish about every 20 seconds, but cellular delivery can
 * pause for several minutes. Keep communication quality separate from the
 * sensor value so a network delay never turns an old value into "live" data.
 */
export const TELEMETRY_LIVE_MS = 5 * 60 * 1000;
export const TELEMETRY_OFFLINE_MS = 15 * 60 * 1000;

type EngineeringRange = Pick<TagData, 'min' | 'max'> &
  Partial<Pick<TagData, 'unit' | 'instrumentType'>>;

/**
 * Universal Sanitization Function:
 * Converts raw PLC values (which may contain noise or uninitialized register garbage)
 * into safe, valid non-negative numbers. Never returns null or NaN.
 */
export const sanitizeRtuValue = (raw: number | string, allowNegative: boolean = false): number => {
  const v = typeof raw === 'string' ? parseFloat(raw) : raw;
  // NaN, Infinity → 0
  if (!Number.isFinite(v)) return 0;
  // Near-zero noise (both positive and negative) → 0
  if (Math.abs(v) < 1e-6) return 0;
  // Large garbage (uninitialized register) → 0
  if (Math.abs(v) > 1e10) return 0;
  // Negative physical sensor → take 0 unless allowNegative is explicitly true (e.g. OHT-1 flow)
  if (v < 0 && !allowNegative) return 0;
  return v;
};

/**
 * Normalizes an incoming telemetry value against the sensor's engineering range.
 * Applies sanitizeRtuValue first so garbage readings return 0 rather than null,
 * allowing live telemetry to always render cleanly on screen without scientific notation.
 */
export const normalizeTelemetryValue = (
  value: number | string,
  range: EngineeringRange,
): number => {
  const allowNegative = range.min !== undefined && range.min < 0;
  const sanitized = sanitizeRtuValue(value, allowNegative);
  if (sanitized >= range.min && sanitized <= range.max) return sanitized;

  const isPercentagePosition = range.unit === '%' &&
    (range.instrumentType === 'lt' || range.instrumentType === 'fcv');
  if (isPercentagePosition && sanitized >= range.min - 2 && sanitized <= range.max + 2) {
    return Math.min(range.max, Math.max(range.min, sanitized));
  }

  // If outside calibrated range but finite, clamp to boundaries or 0
  if (sanitized > 0 && sanitized > range.max * 1.5) {
    return 0; // Extreme out of range treated as uninitialized register noise
  }
  if (sanitized < 0 && sanitized < range.min * 1.5) {
    return 0;
  }
  return sanitized;
};

export const isValueWithinEngineeringRange = (
  value: number,
  range: EngineeringRange,
): boolean => {
  const allowNegative = range.min !== undefined && range.min < 0;
  const sanitized = sanitizeRtuValue(value, allowNegative);
  return sanitized >= range.min && sanitized <= range.max;
};

export const telemetryAgeMs = (tag?: TagData | null, now = Date.now()): number | null => {
  if (!tag?.lastDataTime) return null;
  const receivedAt = new Date(tag.lastDataTime).getTime();
  if (!Number.isFinite(receivedAt)) return null;
  return Math.max(0, now - receivedAt);
};
