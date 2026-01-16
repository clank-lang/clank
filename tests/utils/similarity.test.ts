/**
 * String similarity utility tests.
 */

import { describe, test, expect } from "bun:test";
import {
  levenshteinDistance,
  similarityScore,
  findSimilarNames,
} from "../../src/utils/similarity";

describe("levenshteinDistance", () => {
  test("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0);
    expect(levenshteinDistance("", "")).toBe(0);
  });

  test("returns length of other string when one is empty", () => {
    expect(levenshteinDistance("", "hello")).toBe(5);
    expect(levenshteinDistance("hello", "")).toBe(5);
  });

  test("calculates single character substitution", () => {
    expect(levenshteinDistance("cat", "car")).toBe(1);
    expect(levenshteinDistance("hello", "hallo")).toBe(1);
  });

  test("calculates single character insertion", () => {
    expect(levenshteinDistance("cat", "cats")).toBe(1);
    expect(levenshteinDistance("helo", "hello")).toBe(1);
  });

  test("calculates single character deletion", () => {
    expect(levenshteinDistance("hello", "helo")).toBe(1);
    expect(levenshteinDistance("cats", "cat")).toBe(1);
  });

  test("calculates multiple edits", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
    expect(levenshteinDistance("saturday", "sunday")).toBe(3);
  });
});

describe("similarityScore", () => {
  test("returns 1 for identical strings", () => {
    expect(similarityScore("hello", "hello")).toBe(1);
  });

  test("returns 1 for two empty strings", () => {
    expect(similarityScore("", "")).toBe(1);
  });

  test("returns 0 for completely different strings of same length", () => {
    expect(similarityScore("abc", "xyz")).toBe(0);
  });

  test("returns value between 0 and 1 for similar strings", () => {
    const score = similarityScore("hello", "helo");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe("findSimilarNames", () => {
  test("finds exact prefix matches", () => {
    const candidates = ["hello", "help", "helper", "world"];
    const similar = findSimilarNames("helo", candidates);

    expect(similar.length).toBeGreaterThan(0);
    expect(similar[0].name).toBe("hello");
    expect(similar[0].distance).toBe(1);
  });

  test("excludes exact matches", () => {
    const candidates = ["hello", "helo", "help"];
    const similar = findSimilarNames("hello", candidates);

    expect(similar.map((s) => s.name)).not.toContain("hello");
  });

  test("respects maxDistance parameter", () => {
    const candidates = ["hello", "world", "helper"];
    const similar = findSimilarNames("helo", candidates, 1);

    // "hello" is distance 1, "helper" is distance 3
    expect(similar.map((s) => s.name)).toContain("hello");
    expect(similar.map((s) => s.name)).not.toContain("helper");
  });

  test("respects maxResults parameter", () => {
    const candidates = ["cat", "car", "can", "cap", "cab"];
    const similar = findSimilarNames("cas", candidates, 3, 2);

    expect(similar.length).toBeLessThanOrEqual(2);
  });

  test("sorts by distance", () => {
    const candidates = ["hello", "help", "helper"];
    const similar = findSimilarNames("helo", candidates);

    // hello (distance 1) should come before help (distance 2)
    const helloIdx = similar.findIndex((s) => s.name === "hello");
    const helpIdx = similar.findIndex((s) => s.name === "help");

    if (helloIdx !== -1 && helpIdx !== -1) {
      expect(helloIdx).toBeLessThan(helpIdx);
    }
  });

  test("returns empty array when no similar names found", () => {
    const candidates = ["apple", "banana", "cherry"];
    const similar = findSimilarNames("xyz", candidates, 1);

    expect(similar).toHaveLength(0);
  });

  test("handles empty candidates list", () => {
    const similar = findSimilarNames("hello", []);
    expect(similar).toHaveLength(0);
  });
});
