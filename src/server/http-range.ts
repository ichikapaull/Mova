export type ByteRange = { start: number; end: number };
export type RangeParseResult = { kind: "none" } | { kind: "range"; range: ByteRange } | { kind: "unsatisfiable" };

/**
 * Parses a single-range HTTP Range header (RFC 9110 §14.1.2) against a known size.
 * Multi-range requests are answered with the first range only, which browsers
 * never send for media anyway. Malformed headers are ignored (full response).
 */
export function parseRangeHeader(header: string | null | undefined, size: number): RangeParseResult {
  if (!header) return { kind: "none" };
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*(?:,.*)?$/i.exec(header);
  if (!match) return { kind: "none" };
  const [, startText = "", endText = ""] = match;
  if (startText === "" && endText === "") return { kind: "none" };
  if (size <= 0) return { kind: "unsatisfiable" };

  if (startText === "") {
    // Suffix range: last N bytes.
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength === 0) return { kind: "unsatisfiable" };
    return { kind: "range", range: { start: Math.max(0, size - suffixLength), end: size - 1 } };
  }

  const start = Number(startText);
  if (!Number.isSafeInteger(start) || start >= size) return { kind: "unsatisfiable" };
  let end = endText === "" ? size - 1 : Number(endText);
  if (!Number.isSafeInteger(end)) end = size - 1;
  if (end < start) return { kind: "none" };
  return { kind: "range", range: { start, end: Math.min(end, size - 1) } };
}
