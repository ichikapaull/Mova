import { describe, expect, it } from "vitest";
import { parseRangeHeader } from "@/server/http-range";

describe("parseRangeHeader", () => {
  const size = 1000;

  it("returns none without a header", () => {
    expect(parseRangeHeader(null, size)).toEqual({ kind: "none" });
    expect(parseRangeHeader("", size)).toEqual({ kind: "none" });
  });

  it("parses closed ranges", () => {
    expect(parseRangeHeader("bytes=0-499", size)).toEqual({ kind: "range", range: { start: 0, end: 499 } });
    expect(parseRangeHeader("bytes=500-999", size)).toEqual({ kind: "range", range: { start: 500, end: 999 } });
  });

  it("parses open-ended ranges (what browsers send when seeking)", () => {
    expect(parseRangeHeader("bytes=0-", size)).toEqual({ kind: "range", range: { start: 0, end: 999 } });
    expect(parseRangeHeader("bytes=750-", size)).toEqual({ kind: "range", range: { start: 750, end: 999 } });
  });

  it("parses suffix ranges", () => {
    expect(parseRangeHeader("bytes=-100", size)).toEqual({ kind: "range", range: { start: 900, end: 999 } });
    expect(parseRangeHeader("bytes=-5000", size)).toEqual({ kind: "range", range: { start: 0, end: 999 } });
  });

  it("clamps the end to the file size", () => {
    expect(parseRangeHeader("bytes=900-5000", size)).toEqual({ kind: "range", range: { start: 900, end: 999 } });
  });

  it("handles huge files beyond 32-bit offsets", () => {
    const tenGb = 10 * 1024 ** 3;
    expect(parseRangeHeader(`bytes=${tenGb - 10}-`, tenGb)).toEqual({ kind: "range", range: { start: tenGb - 10, end: tenGb - 1 } });
  });

  it("marks out-of-bounds ranges unsatisfiable", () => {
    expect(parseRangeHeader("bytes=1000-", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseRangeHeader("bytes=-0", size)).toEqual({ kind: "unsatisfiable" });
    expect(parseRangeHeader("bytes=0-", 0)).toEqual({ kind: "unsatisfiable" });
  });

  it("ignores malformed headers", () => {
    expect(parseRangeHeader("items=0-10", size)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=abc-def", size)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=-", size)).toEqual({ kind: "none" });
    expect(parseRangeHeader("bytes=500-100", size)).toEqual({ kind: "none" });
  });

  it("uses the first range of a multi-range request", () => {
    expect(parseRangeHeader("bytes=0-99, 200-299", size)).toEqual({ kind: "range", range: { start: 0, end: 99 } });
  });
});
