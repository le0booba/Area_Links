import { Injectable } from '@angular/core';
import * as Diff from 'diff';
// FIX: Removed named import for Options and WordsOptions as they are not exported members.
// The types will be accessed via the `Diff` namespace.
import { DiffOptions, DiffStats } from './diff.model';

@Injectable({
  providedIn: 'root',
})
export class DiffService {
  compare(textA: string, textB: string, options: DiffOptions): Diff.Change[] {
    // FIX: Correctly type `diffOptions` using an inline type that is structurally
    // compatible with the options expected by `diff` functions. This resolves the
    // error where `Diff.Options` could not be found on the imported namespace.
    const diffOptions: { ignoreCase?: boolean, ignoreWhitespace?: boolean } = {
      ignoreCase: !options.caseSensitive,
    };

    let processedA = textA;
    let processedB = textB;

    if (options.ignoreWhitespace) {
      if (options.diffType === 'lines') {
        processedA = processedA.split('\n').map(line => line.trim()).join('\n');
        processedB = processedB.split('\n').map(line => line.trim()).join('\n');
      } else if (options.diffType === 'words') {
        // FIX: Set `ignoreWhitespace` property directly. This is now allowed by the
        // inline type of `diffOptions` and resolves the error from the unknown
        // `Diff.WordsOptions` type.
        diffOptions.ignoreWhitespace = true;
      }
    }

    switch (options.diffType) {
      case 'chars':
        return Diff.diffChars(processedA, processedB, diffOptions);
      case 'words':
        // FIX: Remove the unnecessary and problematic type cast to `Diff.WordsOptions`.
        // The `diffOptions` object is already compatible.
        return Diff.diffWordsWithSpace(processedA, processedB, diffOptions);
      case 'lines':
      default:
        return Diff.diffLines(processedA, processedB, diffOptions);
    }
  }

  calculateStats(changes: Diff.Change[]): DiffStats {
    return changes.reduce((acc, part) => {
      const count = part.count ?? 0;
      if (part.added) {
        acc.additions += count;
      } else if (part.removed) {
        acc.deletions += count;
      }
      return acc;
    }, { additions: 0, deletions: 0 });
  }
}
