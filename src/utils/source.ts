/**
 * Source file handling utilities
 */

import { Position, SourceSpan, position, span } from "./span";

export class SourceFile {
  readonly name: string;
  readonly content: string;
  private lineStarts: number[];

  constructor(name: string, content: string) {
    this.name = name;
    this.content = content;
    this.lineStarts = this.computeLineStarts();
  }

  private computeLineStarts(): number[] {
    const starts = [0];
    for (let i = 0; i < this.content.length; i++) {
      if (this.content[i] === "\n") {
        starts.push(i + 1);
      }
    }
    return starts;
  }

  positionAt(offset: number): Position {
    if (offset < 0) offset = 0;
    if (offset > this.content.length) offset = this.content.length;

    // Binary search for the line
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.lineStarts[mid] <= offset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }

    const line = low + 1; // 1-indexed
    const column = offset - this.lineStarts[low] + 1; // 1-indexed
    return position(line, column, offset);
  }

  spanAt(start: number, end: number): SourceSpan {
    return span(this.name, this.positionAt(start), this.positionAt(end));
  }

  getLine(lineNumber: number): string {
    if (lineNumber < 1 || lineNumber > this.lineStarts.length) {
      return "";
    }
    const start = this.lineStarts[lineNumber - 1];
    const end =
      lineNumber < this.lineStarts.length
        ? this.lineStarts[lineNumber] - 1
        : this.content.length;
    return this.content.slice(start, end);
  }

  getSnippet(span: SourceSpan, contextLines: number = 0): string {
    const startLine = Math.max(1, span.start.line - contextLines);
    const endLine = Math.min(this.lineStarts.length, span.end.line + contextLines);
    const lines: string[] = [];
    for (let i = startLine; i <= endLine; i++) {
      lines.push(this.getLine(i));
    }
    return lines.join("\n");
  }
}

export async function readSourceFile(path: string): Promise<SourceFile> {
  const content = await Bun.file(path).text();
  return new SourceFile(path, content);
}

export function sourceFromString(name: string, content: string): SourceFile {
  return new SourceFile(name, content);
}
