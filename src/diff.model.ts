
// FIX: Removed 'diff' imports as they were causing errors and types are now declared globally.

// Fix: Use the namespaced 'Diff.Options' type from the imported 'diff' module to resolve type errors.
export type DiffType = 'lines' | 'words' | 'chars';
export type ViewMode = 'side-by-side' | 'unified';

export interface DiffOptions {
  ignoreWhitespace: boolean;
  caseSensitive: boolean;
  diffType: DiffType;
}

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface ProcessedLine {
  left: LineContent;
  right: LineContent;
}

export interface LineContent {
  content: string;
  number: number | null;
  type: 'added' | 'removed' | 'equal' | 'placeholder';
}

export interface ProcessedUnifiedLine {
  content: string;
  type: 'added' | 'removed' | 'equal';
  leftNumber: number | null;
  rightNumber: number | null;
}

declare global {
  // FIX: Declare types for the global `Diff` object locally, as they cannot be imported from a module into the global scope.
  interface DiffChange {
    count?: number;
    value: string;
    added?: boolean;
    removed?: boolean;
  }

  interface DiffOptionsGlobal {
    ignoreCase?: boolean;
  }

  const Diff: {
    diffChars(oldStr: string, newStr: string, options?: DiffOptionsGlobal): DiffChange[];
    diffWords(oldStr: string, newStr: string, options?: DiffOptionsGlobal): DiffChange[];
    diffWordsWithSpace(oldStr: string, newStr: string, options?: DiffOptionsGlobal): DiffChange[];
    diffLines(oldStr: string, newStr: string, options?: DiffOptionsGlobal): DiffChange[];
  };
}
