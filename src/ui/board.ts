import { bit, digitsOf } from '../core/bits.ts';
import type { Game } from '../game/state.ts';
import type { Settings } from '../game/storage.ts';
import { el } from './dom.ts';

/**
 * The grid. Built once as a flat list of cells and then repainted in place —
 * a kakuro repaints on every keystroke, and rebuilding a hundred elements to
 * change one digit is how a board starts to feel slow on a phone.
 */
export class Board {
  readonly node: HTMLElement;

  private game: Game;
  private settings: Settings;
  private cells: HTMLElement[] = [];
  private digits: (HTMLElement | null)[] = [];
  private markNodes: (HTMLElement | null)[] = [];
  private acrossClue: (HTMLElement | null)[] = [];
  private downClue: (HTMLElement | null)[] = [];

  private selected = -1;
  private spotlit = new Set<number>();

  constructor(game: Game, settings: Settings, onSelect: (cell: number) => void) {
    this.game = game;
    this.settings = settings;
    this.node = el('div', {
      class: 'board',
      role: 'grid',
      'aria-label': 'Kakuro grid',
      'aria-rowcount': String(game.puzzle.size),
      'aria-colcount': String(game.puzzle.size),
      style: `--n:${game.puzzle.size}`,
    });

    const size = game.puzzle.size;
    for (let cell = 0; cell < size * size; cell++) {
      const row = Math.floor(cell / size) + 1;
      const column = (cell % size) + 1;

      if (game.isClue(cell)) {
        const { across, down } = game.cluesAt(cell);
        const node = el('i', {
          class: `cell clue${across || down ? ' clued' : ''}`,
          role: 'gridcell',
          'aria-rowindex': String(row),
          'aria-colindex': String(column),
          'aria-label': clueLabel(across?.sum, down?.sum, row, column),
        });
        const acrossNode = across ? el('b', { class: 'across', text: String(across.sum) }) : null;
        const downNode = down ? el('b', { class: 'down', text: String(down.sum) }) : null;
        if (acrossNode) node.append(acrossNode);
        if (downNode) node.append(downNode);
        this.cells.push(node);
        this.digits.push(null);
        this.markNodes.push(null);
        this.acrossClue.push(acrossNode);
        this.downClue.push(downNode);
        this.node.append(node);
        continue;
      }

      const digit = el('span', { class: 'digit' });
      const marks = el('span', { class: 'marks' });
      for (let d = 1; d <= 9; d++) marks.append(el('em', { text: '' }));
      const node = el(
        'i',
        {
          class: 'cell answer',
          role: 'gridcell',
          tabindex: '-1',
          'aria-selected': 'false',
          'aria-rowindex': String(row),
          'aria-colindex': String(column),
          'aria-label': `row ${row}, column ${column}, empty`,
        },
        digit,
        marks,
      );
      node.addEventListener('pointerdown', () => onSelect(cell));
      this.cells.push(node);
      this.digits.push(digit);
      this.markNodes.push(marks);
      this.acrossClue.push(null);
      this.downClue.push(null);
      this.node.append(node);
    }
  }

  select(cell: number): void {
    this.selected = cell;
    this.paint();
    const node = this.cells[cell];
    if (!node) return;
    node.focus({ preventScroll: true });
    /*
     * Zoomed, the board is larger than its pane, so the cursor can walk off the
     * edge of what is on screen. `nearest` scrolls only when it has to, which
     * keeps the board still while the cursor moves about the middle of it.
     */
    node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  get selection(): number {
    return this.selected;
  }

  /** Tint the cells a hint is talking about. */
  spotlight(cells: number[]): void {
    this.spotlit = new Set(cells);
    this.paint();
  }

  clearSpotlight(): void {
    if (this.spotlit.size === 0) return;
    this.spotlit.clear();
    this.paint();
  }

  useSettings(settings: Settings): void {
    this.settings = settings;
    this.paint();
  }

  paint(): void {
    const game = this.game;
    const selectedDigit = this.selected >= 0 ? game.values[this.selected] : 0;

    const peers = new Set<number>();
    if (this.selected >= 0 && this.settings.highlightRuns) {
      for (const run of [game.acrossRun(this.selected), game.downRun(this.selected)]) {
        if (run) for (const cell of run.cells) peers.add(cell);
      }
    }
    const conflicts = this.settings.instantCheck ? new Set(game.conflictCells()) : new Set<number>();

    for (let cell = 0; cell < this.cells.length; cell++) {
      const node = this.cells[cell];
      if (game.isClue(cell)) continue;

      const value = game.values[cell];
      const marks = game.marks[cell];
      const digitNode = this.digits[cell]!;
      const markNode = this.markNodes[cell]!;

      digitNode.textContent = value ? String(value) : '';
      const showMarks = !value && marks !== 0;
      markNode.classList.toggle('on', showMarks);
      if (showMarks) {
        const children = markNode.children;
        for (let d = 1; d <= 9; d++) {
          children[d - 1].textContent = marks & bit(d) ? String(d) : '';
        }
      }

      const selected = cell === this.selected;
      const wrong = game.flagged.has(cell) || (this.settings.instantCheck && conflicts.has(cell));

      node.tabIndex = selected ? 0 : -1;
      node.setAttribute('aria-selected', String(selected));
      node.classList.toggle('sel', selected);
      node.classList.toggle('peer', peers.has(cell) && !selected);
      node.classList.toggle(
        'same',
        this.settings.highlightSameDigit &&
          selectedDigit !== 0 &&
          value === selectedDigit &&
          cell !== this.selected,
      );
      node.classList.toggle('wrong', wrong);
      node.classList.toggle('spot', this.spotlit.has(cell));
      node.setAttribute(
        'aria-label',
        cellLabel(cell, game.puzzle.size, value, marks, wrong),
      );
    }

    // Clue cells wear the state of their own run: a run that is full and adds
    // up goes quiet, and one that is full and does not goes red. Both are
    // arithmetic the player can already do, so neither gives anything away.
    for (const run of game.puzzle.runs) {
      const node = (run.dir === 'across' ? this.acrossClue : this.downClue)[run.clue];
      if (!node) continue;
      const { full, left, repeated } = game.progress(run);
      node.classList.toggle('met', full && left === 0 && !repeated);
      node.classList.toggle('bust', (full && (left !== 0 || repeated)) || left < 0);
      node.parentElement?.classList.toggle('lit', this.spotlit.has(run.clue));
    }
  }
}

function clueLabel(across: number | undefined, down: number | undefined, row: number, column: number): string {
  const parts: string[] = [];
  if (across) parts.push(`${across} across`);
  if (down) parts.push(`${down} down`);
  return parts.length === 0
    ? `row ${row}, column ${column}, blank`
    : `row ${row}, column ${column}, clue ${parts.join(' and ')}`;
}

function cellLabel(cell: number, size: number, value: number, marks: number, wrong: boolean): string {
  const row = Math.floor(cell / size) + 1;
  const column = (cell % size) + 1;
  const where = `row ${row}, column ${column}`;
  if (value && wrong) return `${where}, ${value}, incorrect`;
  if (value) return `${where}, ${value}`;
  if (marks) return `${where}, pencilled ${digitsOf(marks).join(' ')}`;
  return `${where}, empty`;
}
