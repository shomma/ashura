export function encodeJsonField(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ value: String(value) });
  }
}

export function encodeJsonArray(value: unknown): string {
  if (!Array.isArray(value)) return '[]';
  return encodeJsonField(value) || '[]';
}

export function decodeJsonField<T = unknown>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function decodeJsonArray(value: unknown): string[] {
  const parsed = decodeJsonField<unknown>(value, []);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}
