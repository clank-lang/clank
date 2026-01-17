/**
 * String Similarity Utilities
 *
 * Provides Levenshtein distance and similar name suggestions
 * for compiler error repairs.
 */

/**
 * Calculate Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits needed
 * to transform one string into the other.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two-row optimization for space efficiency
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    prev[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }

    // Swap rows
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/**
 * Calculate a similarity score between 0 and 1.
 * 1 means identical, 0 means completely different.
 */
export function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Calculate the longest common prefix length between two strings.
 * Used as a tie-breaker when Levenshtein distances are equal.
 */
export function longestCommonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i++;
  }
  return i;
}

export interface SimilarName {
  name: string;
  distance: number;
  score: number;
}

/**
 * Find similar names from a list of candidates.
 *
 * @param target - The name to find similar matches for
 * @param candidates - List of candidate names to search
 * @param maxDistance - Maximum Levenshtein distance to consider (default: 3)
 * @param maxResults - Maximum number of results to return (default: 3)
 * @returns Array of similar names sorted by distance (best first)
 */
export function findSimilarNames(
  target: string,
  candidates: string[],
  maxDistance: number = 3,
  maxResults: number = 3
): SimilarName[] {
  const results: SimilarName[] = [];

  for (const name of candidates) {
    // Skip if same name
    if (name === target) continue;

    // Quick length check - if lengths differ by more than maxDistance,
    // the Levenshtein distance will definitely be greater
    if (Math.abs(name.length - target.length) > maxDistance) continue;

    const distance = levenshteinDistance(target, name);

    if (distance <= maxDistance) {
      results.push({
        name,
        distance,
        score: similarityScore(target, name),
      });
    }
  }

  // Sort by distance (ascending), then by score (descending), then by LCP (descending) for ties
  results.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.score !== b.score) return b.score - a.score;
    // Final tie-breaker: prefer longer common prefix with original name
    const lcpA = longestCommonPrefix(target, a.name);
    const lcpB = longestCommonPrefix(target, b.name);
    return lcpB - lcpA;
  });

  return results.slice(0, maxResults);
}
