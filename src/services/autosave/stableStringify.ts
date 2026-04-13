export type StableStringifyOptions = {
  /**
   * If true, `undefined` values are omitted from objects.
   * Defaults to true.
   */
  omitUndefined?: boolean;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function fileToMetadata(file: any): { __type: 'File'; name: string; size: number; type: string; lastModified: number } {
  // File in browsers has these fields; we defensively read them so this doesn't blow up in Node tests.
  return {
    __type: 'File',
    name: String(file?.name ?? ''),
    size: Number(file?.size ?? 0),
    type: String(file?.type ?? ''),
    lastModified: Number(file?.lastModified ?? 0)
  };
}

/**
 * Deterministically stringify a value:
 * - Sort object keys
 * - Convert `Date` to ISO string
 * - Convert `File` to stable metadata (so selection of the same file doesn't cause spurious diffs)
 */
export function stableStringify(value: unknown, options?: StableStringifyOptions): string {
  const omitUndefined = options?.omitUndefined ?? true;

  const seen = new WeakSet<object>();

  const normalize = (v: unknown): unknown => {
    if (v === undefined) return omitUndefined ? undefined : null;
    if (v === null) return null;
    const t = typeof v;

    if (t === 'string' || t === 'number' || t === 'boolean') return v;
    if (t === 'bigint') return v.toString();
    if (t === 'function') return `[Function:${v.name || 'anonymous'}]`;

    // Date
    if (v instanceof Date) return v.toISOString();

    // File (or File-like)
    if (
      typeof File !== 'undefined' &&
      v instanceof File
    ) {
      return fileToMetadata(v);
    }

    // Fallback for File-like objects (mostly for test robustness)
    if (
      v &&
      typeof v === 'object' &&
      'name' in (v as any) &&
      'size' in (v as any) &&
      'type' in (v as any) &&
      'lastModified' in (v as any)
    ) {
      // Only treat as file-like if it has the required fields and no other obvious discriminator.
      return fileToMetadata(v);
    }

    // Arrays
    if (Array.isArray(v)) return v.map((item) => normalize(item));

    // Circular refs guard
    if (typeof v === 'object') {
      if (seen.has(v as object)) return '[Circular]';
      seen.add(v as object);
    }

    // Plain objects with sorted keys
    if (isPlainObject(v)) {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).sort();
      const out: Record<string, unknown> = {};

      for (const k of keys) {
        const normalized = normalize(obj[k]);
        if (normalized === undefined) continue;
        out[k] = normalized;
      }

      return out;
    }

    // For other class instances, try to normalize via `toJSON`, otherwise fall back to string tag.
    if (typeof (v as any)?.toJSON === 'function') {
      return normalize((v as any).toJSON());
    }

    return String(v);
  };

  const normalized = normalize(value);
  if (normalized === undefined) return 'undefined';
  return JSON.stringify(normalized);
}

