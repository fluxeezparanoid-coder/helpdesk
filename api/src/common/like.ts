/** Escape LIKE wildcards so a search for "100%" matches the literal text (use with ESCAPE '\'). */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
