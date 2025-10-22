import { Component, ChangeDetectionStrategy, signal, computed, effect, inject } from '@angular/core';
import { DiffService } from './diff.service';
import { DiffOptions, DiffStats, DiffType, ViewMode, ProcessedLine, ProcessedUnifiedLine } from './diff.model';
import type * as Diff from 'diff';

export type Theme = 'light' | 'dark' | 'mono' | 'mono-dark';
export type NavButtonLayout = 'horizontal' | 'vertical';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  providers: [DiffService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:scroll)': 'onWindowScroll()',
    '(window:keydown)': 'handleKeyboardShortcuts($event)',
  },
})
export class AppComponent {
  private diffService = inject(DiffService);

  theme = signal<Theme>('light');
  viewMode = signal<ViewMode>('side-by-side');
  navButtonLayout = signal<NavButtonLayout>('horizontal');
  wrapNavigation = signal<boolean>(true);
  textA = signal('');
  textB = signal('');
  diffOptions = signal<DiffOptions>({
    ignoreWhitespace: false,
    caseSensitive: true,
    diffType: 'lines',
  });

  diffResult = signal<Diff.Change[]>([]);
  diffStats = signal<DiffStats | null>(null);
  isComparisonReady = computed(() => this.textA().length > 0 || this.textB().length > 0);
  noDifferences = computed(() => {
    const stats = this.diffStats();
    return !!stats && stats.additions === 0 && stats.deletions === 0;
  });
  showScrollToTop = signal(false);
  isAtFirstDiff = signal(false);
  isAtLastDiff = signal(false);

  private readonly themes: Theme[] = ['light', 'dark', 'mono', 'mono-dark'];

  constructor() {
    this.initializeTheme();
    this.initializeNavButtonLayout();
    this.initializeWrapNavigation();

    effect(() => this.runComparison());

    effect(() => {
        const currentTheme = this.theme();
        document.documentElement.classList.remove('dark', 'mono', 'mono-dark');
        if (currentTheme !== 'light') {
            document.documentElement.classList.add(currentTheme);
        }
        if (typeof window !== 'undefined') {
          localStorage.setItem('diff-checker-theme', currentTheme);
        }
    });

    effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('diff-checker-nav-layout', this.navButtonLayout());
        }
    });

    effect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('diff-checker-wrap-nav', this.wrapNavigation().toString());
        }
    });
  }

  private initializeTheme() {
    if (typeof window !== 'undefined') {
        const storedTheme = localStorage.getItem('diff-checker-theme') as Theme | null;
        if (storedTheme && ['light', 'dark', 'mono', 'mono-dark'].includes(storedTheme)) {
            this.theme.set(storedTheme);
        } else {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            this.theme.set(prefersDark ? 'dark' : 'light');
        }
    }
  }

  private initializeNavButtonLayout() {
    if (typeof window !== 'undefined') {
        const storedLayout = localStorage.getItem('diff-checker-nav-layout') as NavButtonLayout | null;
        if (storedLayout && ['horizontal', 'vertical'].includes(storedLayout)) {
            this.navButtonLayout.set(storedLayout);
        }
    }
  }

  private initializeWrapNavigation() {
    if (typeof window !== 'undefined') {
      const storedWrap = localStorage.getItem('diff-checker-wrap-nav');
      if (storedWrap) {
        this.wrapNavigation.set(storedWrap === 'true');
      }
    }
  }

  toggleTheme() {
    this.theme.update(current => {
      const currentIndex = this.themes.indexOf(current);
      const nextIndex = (currentIndex + 1) % this.themes.length;
      return this.themes[nextIndex];
    });
  }

  setNavButtonLayout(layout: NavButtonLayout) {
    this.navButtonLayout.set(layout);
  }

  toggleNavButtonLayout() {
    this.navButtonLayout.update(current => current === 'horizontal' ? 'vertical' : 'horizontal');
  }

  toggleWrapNavigation() {
    this.wrapNavigation.update(v => !v);
  }

  private getTextSignal(pane: 'A' | 'B') {
    return pane === 'A' ? this.textA : this.textB;
  }

  getTextValue(pane: 'A' | 'B'): string {
    return this.getTextSignal(pane)();
  }

  handleTextInput(event: Event, pane: 'A' | 'B') {
    const value = (event.target as HTMLTextAreaElement).value;
    this.getTextSignal(pane).set(value);
  }

  async handleFileInput(event: Event, pane: 'A' | 'B') {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      const text = await input.files[0].text();
      this.getTextSignal(pane).set(text);
      input.value = '';
    }
  }

  async pasteFromClipboard(pane: 'A' | 'B') {
    try {
      const text = await navigator.clipboard.readText();
      this.getTextSignal(pane).set(text);
    } catch (err) {
      console.error('Failed to read clipboard contents:', err);
      // Optionally, implement a user-facing error message here.
    }
  }

  clearText(pane: 'A' | 'B') {
    this.getTextSignal(pane).set('');
  }

  clearAllTexts() {
    this.textA.set('');
    this.textB.set('');
  }

  setDiffType(type: DiffType) {
    this.diffOptions.update(options => ({ ...options, diffType: type }));
  }

  toggleOption(option: 'ignoreWhitespace' | 'caseSensitive') {
    this.diffOptions.update(options => ({ ...options, [option]: !options[option] }));
  }

  setViewMode(mode: ViewMode) {
    this.viewMode.set(mode);
  }

  private runComparison() {
    const result = this.diffService.compare(this.textA(), this.textB(), this.diffOptions());
    this.diffResult.set(result);
    this.diffStats.set(this.diffOptions().diffType === 'lines' ? this.diffService.calculateStats(result) : null);
    this.isAtFirstDiff.set(false);
    this.isAtLastDiff.set(false);
  }

  onWindowScroll() {
    if (typeof window !== 'undefined') {
      const show = window.scrollY > 400;
      if (show !== this.showScrollToTop()) {
        this.showScrollToTop.set(show);
      }
    }
  }

  scrollToTop() {
    if (typeof window === 'undefined') {
      return;
    }

    const startY = window.scrollY;
    const startTime = performance.now();
    const duration = 800; // Increased duration for a more pronounced ease-out effect

    // Using an ease-out function to scroll quickly at the start and slow down near the top.
    const easeOutQuart = (t: number): number => {
      return 1 - Math.pow(1 - t, 4);
    };

    const scrollStep = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      
      if (elapsedTime >= duration) {
        window.scrollTo(0, 0);
        return;
      }
      
      const progress = elapsedTime / duration;
      const easedProgress = easeOutQuart(progress);
      
      window.scrollTo(0, startY * (1 - easedProgress));
      
      requestAnimationFrame(scrollStep);
    };

    requestAnimationFrame(scrollStep);
  }

  handleKeyboardShortcuts(event: KeyboardEvent) {
    if (!event.altKey) {
      return;
    }

    const shortcuts: Record<string, () => void> = {
      'Backquote': () => this.scrollToTop(),
      'KeyS': () => this.navigateToDiff('next'),
      'KeyW': () => this.navigateToDiff('previous'),
    };

    if (shortcuts[event.code]) {
      event.preventDefault();
      shortcuts[event.code]();
    }
  }

  navigateToDiff(direction: 'next' | 'previous') {
    if (typeof document === 'undefined' || this.diffOptions().diffType !== 'lines') {
        return;
    }

    const diffChunks = Array.from(document.querySelectorAll('.diff-chunk')) as HTMLElement[];
    if (diffChunks.length === 0) return;

    // If there is only one diff, re-center it on click and update state.
    if (diffChunks.length === 1) {
        diffChunks[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.isAtFirstDiff.set(true);
        this.isAtLastDiff.set(true);
        return;
    }

    const viewportCenterY = window.scrollY + (window.innerHeight / 2);
    let targetIndex = -1;

    if (direction === 'next') {
        // Find the first chunk whose top edge is below the viewport's center.
        const foundIndex = diffChunks.findIndex(chunk => chunk.offsetTop > viewportCenterY);
        if (foundIndex !== -1) {
            targetIndex = foundIndex;
        } else {
            // We are at or after the last chunk.
            if (this.wrapNavigation()) {
              targetIndex = 0; // Wrap to the first chunk.
            } else {
              return; // No wrap, do nothing.
            }
        }
    } else { // 'previous'
        // Find the last chunk whose bottom edge is above the viewport's center.
        let foundIndex = -1;
        for (let i = diffChunks.length - 1; i >= 0; i--) {
            const chunk = diffChunks[i];
            if ((chunk.offsetTop + chunk.offsetHeight) < viewportCenterY) {
                foundIndex = i;
                break;
            }
        }

        if (foundIndex !== -1) {
            targetIndex = foundIndex;
        } else {
            // We are at or before the first chunk.
            if (this.wrapNavigation()) {
              targetIndex = diffChunks.length - 1; // Wrap to the last chunk.
            } else {
              return; // No wrap, do nothing.
            }
        }
    }
    
    const targetElement = diffChunks[targetIndex];

    if (targetElement) {
        targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
        });
        
        this.isAtFirstDiff.set(targetIndex === 0);
        this.isAtLastDiff.set(targetIndex === diffChunks.length - 1);
    }
  }

  processedUnifiedDiff = computed<ProcessedUnifiedLine[]>(() => {
    if (this.diffOptions().diffType !== 'lines') {
      return [];
    }

    const changes = this.diffResult();
    const processedLines: ProcessedUnifiedLine[] = [];
    let leftLineNum = 1;
    let rightLineNum = 1;

    for (const part of changes) {
      const lines = part.value.replace(/\n$/, '').split('\n');

      lines.forEach(line => {
        if (part.added) {
          processedLines.push({
            content: line,
            type: 'added',
            leftNumber: null,
            rightNumber: rightLineNum++,
          });
        } else if (part.removed) {
          processedLines.push({
            content: line,
            type: 'removed',
            leftNumber: leftLineNum++,
            rightNumber: null,
          });
        } else {
          processedLines.push({
            content: line,
            type: 'equal',
            leftNumber: leftLineNum++,
            rightNumber: rightLineNum++,
          });
        }
      });
    }

    return processedLines;
  });

  processedSideBySideDiff = computed<ProcessedLine[]>(() => {
    const changes = this.diffResult();
    if (this.diffOptions().diffType !== 'lines') return [];

    const processedLines: ProcessedLine[] = [];
    let leftLineNum = 1;
    let rightLineNum = 1;

    for (let i = 0; i < changes.length; i++) {
      const currentPart = changes[i];
      const nextPart = changes[i + 1];

      if (currentPart.removed && nextPart?.added) {
        const removedLines = currentPart.value.replace(/\n$/, '').split('\n');
        const addedLines = nextPart.value.replace(/\n$/, '').split('\n');
        const maxLen = Math.max(removedLines.length, addedLines.length);

        for (let j = 0; j < maxLen; j++) {
          const leftContent = removedLines[j];
          const rightContent = addedLines[j];
          processedLines.push({
            left: { content: leftContent ?? '', number: leftContent !== undefined ? leftLineNum++ : null, type: 'removed' },
            right: { content: rightContent ?? '', number: rightContent !== undefined ? rightLineNum++ : null, type: 'added' },
          });
        }
        i++;
      } else {
        const lines = currentPart.value.replace(/\n$/, '').split('\n');
        lines.forEach(line => {
          if (currentPart.removed) {
            processedLines.push({ left: { content: line, number: leftLineNum++, type: 'removed' }, right: { content: '', number: null, type: 'placeholder' } });
          } else if (currentPart.added) {
            processedLines.push({ left: { content: '', number: null, type: 'placeholder' }, right: { content: line, number: rightLineNum++, type: 'added' } });
          } else {
            processedLines.push({ left: { content: line, number: leftLineNum++, type: 'equal' }, right: { content: line, number: rightLineNum++, type: 'equal' } });
          }
        });
      }
    }
    return processedLines;
  });
}