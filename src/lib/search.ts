/** Lowercases and strips diacritics so "Şeker" matches "seker" and "Naruto" matches "naruto". */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/[_.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits a query into normalized tokens; every token must match. */
export function tokenizeSearchQuery(query: string): string[] {
  return normalizeSearchText(query).split(" ").filter(Boolean).slice(0, 8);
}

/** Escapes LIKE wildcards; use with `ESCAPE '\\'`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function buildMediaSearchText(parts: { title: string; filename: string; relativePath: string }): string {
  return normalizeSearchText(`${parts.title} ${parts.filename} ${parts.relativePath}`);
}
