/**
 * Source location tracking utilities
 */

export interface Position {
  /** 1-indexed line number */
  line: number;
  /** 1-indexed column number */
  column: number;
  /** 0-indexed byte offset */
  offset: number;
}

export interface SourceSpan {
  file: string;
  start: Position;
  end: Position;
}

export function position(line: number, column: number, offset: number): Position {
  return { line, column, offset };
}

export function span(file: string, start: Position, end: Position): SourceSpan {
  return { file, start, end };
}

export function formatPosition(pos: Position): string {
  return `${pos.line}:${pos.column}`;
}

export function formatSpan(span: SourceSpan): string {
  return `${span.file}:${formatPosition(span.start)}`;
}

export function mergeSpans(a: SourceSpan, b: SourceSpan): SourceSpan {
  if (a.file !== b.file) {
    throw new Error("Cannot merge spans from different files");
  }
  return {
    file: a.file,
    start: a.start.offset < b.start.offset ? a.start : b.start,
    end: a.end.offset > b.end.offset ? a.end : b.end,
  };
}
