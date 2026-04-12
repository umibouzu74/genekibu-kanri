import { describe, it, expect } from "vitest";
import { escapeHtml, escapeIcal, escapeCsv } from "./escape";

describe("escapeHtml", () => {
  it("escapes &, <, >, and double quotes", () => {
    expect(escapeHtml('a & b < c > d "e"')).toBe(
      "a &amp; b &lt; c &gt; d &quot;e&quot;"
    );
  });

  it("returns plain strings unchanged", () => {
    expect(escapeHtml("hello")).toBe("hello");
  });

  it("coerces non-string values", () => {
    expect(escapeHtml(123)).toBe("123");
    expect(escapeHtml(null)).toBe("null");
  });
});

describe("escapeIcal", () => {
  it("escapes backslash, semicolon, comma, and newline", () => {
    expect(escapeIcal("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  it("returns empty string for falsy input", () => {
    expect(escapeIcal("")).toBe("");
    expect(escapeIcal(null)).toBe("");
    expect(escapeIcal(undefined)).toBe("");
  });

  it("returns plain strings unchanged", () => {
    expect(escapeIcal("hello")).toBe("hello");
  });
});

describe("escapeCsv", () => {
  it("wraps strings containing commas in double quotes", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
  });

  it("wraps strings containing double quotes and doubles them", () => {
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps strings containing newlines", () => {
    expect(escapeCsv("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns plain strings unchanged", () => {
    expect(escapeCsv("hello")).toBe("hello");
  });

  it("handles null and undefined", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });

  it("coerces numbers", () => {
    expect(escapeCsv(42)).toBe("42");
  });
});
