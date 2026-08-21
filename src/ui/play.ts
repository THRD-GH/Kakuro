import { ALL } from '../core/bits.ts';
import { Solver, TECHNIQUE_NAMES } from '../core/solver.ts';
import type { Step } from '../core/solver.ts';
import { displayPuzzleId } from '../core/types.ts';
import type { Puzzle, PuzzleId } from '../core/types.ts';
import { Game } from '../game/state.ts';
import type { SavedGame } from '../game/storage.ts';
import { dropSave, puzzleLink, putSave, recordFinish, recordStart } from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { Board } from './board.ts';
import { openCombinations } from './combos.ts';
import { clear, el, formatTime } from './dom.ts';
import { bindTap } from './pointer.ts';
import { closeTopOverlay, confirmPanel, openOverlay, toast } from './overlay.ts';

export class PlayScreen {
  readonly node: HTMLElement;

  private app: AppContext;
  private game: Game;
  private board: Board;

  private clock: HTMLElement;
  private claim!: HTMLElement;
  private noteButton: HTMLButtonElement;
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;
  private hintNote: HTMLElement;

  private notes = false;
  private zoomed = false;
  private zoomButton!: HTMLButtonElement;
  private pauseButton!: HTMLButtonElement;
  private paused = false;
  /** How far down the current line of reasoning Hint has walked. */
  private hintDepth = 0;
  private ticker: number | null = null;
  private saveTimer: number | null = null;
  private finished = false;

  constructor(app: AppContext, id: PuzzleId, puzzle: Puzzle, save: SavedGame | null) {
    this.app = app;
    this.game = new Game(id, puzzle, save);
    app.history = recordStart(app.history, id);

    this.board = new Board(this.game, app.settings, (cell) => this.select(cell));

    this.clock = el('button', { class: 'clock', type: 'button', 'aria-label': 'Time' });
    this.clock.addEventListener('click', () => {
      this.clock.classList.toggle('hidden-time');
      this.tick();
    });

    this.hintNote = el('div', { class: 'hint-note', 'aria-live': 'polite' });

    this.noteButton = el('button', {
      class: 'key act',
      type: 'button',
      'aria-pressed': 'false',
      text: 'Notes',
    });
    this.noteButton.addEventListener('click', () => this.setNotes(!this.notes));

    this.undoButton = el('button', {
      class: 'key act glyph',
      type: 'button',
      'aria-label': 'Undo',
      title: 'Undo',
      text: '↶',
    });
    this.undoButton.addEventListener('click', () => this.undo());
    this.redoButton = el('button', {
      class: 'key act glyph',
      type: 'button',
      'aria-label': 'Redo',
      title: 'Redo',
      text: '↷',
    });
    this.redoButton.addEventListener('click', () => this.redo());

    this.node = el(
      'div',
      { class: 'play' },
      this.topBar(id, puzzle),
      /*
       * The table and the hint both float over the board rather than taking a
       * slice of the screen for themselves. In the column they pushed: opening
       * a hint on a short screen shrank the grid from 354px to 262px under the
       * player's hands, which is no way to read a board.
       */
      el(
        'div',
        { class: 'board-area' },
        el('div', { class: 'board-wrap' }, this.board.node),
        el('div', { class: 'board-overlays' }, this.hintNote),
      ),
      this.controls(),
    );

    /*
     * Big boards start zoomed on a narrow screen. Fitted to a phone, a 20x20
     * gives each cell about eighteen pixels: the answers are still readable but
     * a two-figure clue in half of that is not, and it is below the size a
     * thumb can hit. On anything wider there is room to show the whole board.
     */
    this.setZoom(puzzle.size >= 16 && window.innerWidth < 520);
    this.tick();
    this.ticker = window.setInterval(() => this.tick(), 500);
    if (this.game.complete) {
      this.win();
      return;
    }
    this.select(this.firstEmpty());
    this.game.start();
  }

  /** Called once the play tree is in the document, so the selected cell can take focus. */
  attached(): void {
    if (this.finished) return;
    if (this.board.selection >= 0) this.board.select(this.board.selection);
    this.undoButton.disabled = !this.game.canUndo;
    this.redoButton.disabled = !this.game.canRedo;
  }

  // -------------------------------------------------------------- furniture

  private topBar(id: PuzzleId, puzzle: Puzzle): HTMLElement {
    const back = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Back to the menu' }, '←');
    back.addEventListener('click', () => this.leave());

    const menu = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Puzzle menu' }, '⋯');
    menu.addEventListener('click', () => this.openGameMenu());

    const stars = `${'★'.repeat(puzzle.difficulty)}${'☆'.repeat(6 - puzzle.difficulty)}`;
    this.claim = el('span', {
      class: 'play-claim',
      text: `${stars} · ${puzzle.size}×${puzzle.size}`,
    });

    return el(
      'header',
      { class: 'play-bar' },
      back,
      el('div', { class: 'play-id' }, el('b', { text: displayPuzzleId(id) }), this.claim),
      this.clock,
      menu,
    );
  }

  /*
   * One control block, laid out as Killer Sudoku lays its own out: the digits
   * as a three-by-three pad on one side and the buttons as a matching
   * three-by-three on the other. Nine and nine, the same size and the same
   * rhythm, rather than a pad with an odd column of extras bolted to it — that
   * arrangement was what let four stacked buttons set the height of three rows
   * of digits and inflate the whole thing.
   */
  private controls(): HTMLElement {
    const pad = el('div', { class: 'keypad' });
    for (let digit = 1; digit <= 9; digit++) {
      const key = el('button', { class: 'key digit', type: 'button', text: String(digit) });
      // Tap does whatever mode you are in; holding does the other one, so a
      // stray pencil mark never needs a trip to the Notes button and back.
      bindTap(key, {
        onTap: () => this.enter(digit, !this.notes),
        onHold: () => this.enter(digit, this.notes),
      });
      pad.append(key);
    }

    const erase = el('button', { class: 'key act', type: 'button', text: 'Clear' });
    if (this.app.settings.clearNeedsHold) bindTap(erase, { onHold: () => this.eraseCell() });
    else bindTap(erase, { onTap: () => this.eraseCell() });

    const check = el('button', { class: 'key act', type: 'button', text: 'Check' });
    if (this.app.settings.checkNeedsHold) bindTap(check, { onHold: () => this.check() });
    else bindTap(check, { onTap: () => this.check() });

    const hint = el('button', { class: 'key act', type: 'button', text: 'Hint' });
    if (this.app.settings.hintNeedsHold) bindTap(hint, { onHold: () => this.hint() });
    else bindTap(hint, { onTap: () => this.hint() });

    const table = el('button', { class: 'key act', type: 'button', text: 'Table' });
    table.addEventListener('click', () => this.openTable());

    this.zoomButton = el('button', {
      class: 'key act glyph',
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': 'Zoom',
      title: 'Zoom',
      text: '⤢',
    });
    this.zoomButton.addEventListener('click', () => this.setZoom(!this.zoomed));

    this.pauseButton = el('button', {
      class: 'key act glyph',
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': 'Pause',
      title: 'Pause',
      text: '⏸',
    });
    this.pauseButton.addEventListener('click', () => this.setPaused(!this.paused));

    return el(
      'div',
      { class: 'controls' },
      el('div', { class: 'controls-left' }, pad),
      el(
        'div',
        { class: 'controls-right' },
        el(
          'div',
          { class: 'actions' },
          this.noteButton,
          erase,
          check,
          hint,
          table,
          this.undoButton,
          this.redoButton,
          this.zoomButton,
          this.pauseButton,
        ),
      ),
    );
  }

  /** The combination finder, on the run through the cell in hand. */
  private openTable(): void {
    const cell = this.board.selection;
    if (cell < 0 || this.game.isClue(cell)) {
      toast('Pick a cell first — the table works on the runs through it.');
      return;
    }
    openCombinations(this.game, cell, (run, mask) => {
      const empty = run.cells.filter((at) => !this.game.values[at]);
      this.game.pencilInto(empty, mask);
      this.afterEdit();
      toast('Pencilled in.');
    });
  }

  /**
   * Pause hides the board and stops the clock. Both halves matter: a clock
   * that keeps running while you answer the door makes the time meaningless,
   * and a board still on screen makes stopping the clock a way to study it for
   * free.
   */
  private setPaused(on: boolean): void {
    if (this.finished) return;
    this.paused = on;
    this.pauseButton.setAttribute('aria-pressed', String(on));
    this.pauseButton.classList.toggle('on', on);
    this.pauseButton.textContent = on ? '▶' : '⏸';
    this.pauseButton.setAttribute('aria-label', on ? 'Resume' : 'Pause');
    this.node.querySelector('.board-area')?.classList.toggle('paused', on);
    if (on) this.game.pause();
    else this.game.start();
    this.tick();
  }

  private setZoom(on: boolean): void {
    this.zoomed = on;
    this.zoomButton.setAttribute('aria-pressed', String(on));
    this.zoomButton.classList.toggle('on', on);
    this.node.querySelector('.board-wrap')?.classList.toggle('zoomed', on);
    if (this.board.selection >= 0) this.board.select(this.board.selection);
  }

  // ----------------------------------------------------------------- editing

  private firstEmpty(): number {
    const empty = this.game.emptyCells();
    return empty.length > 0 ? empty[0] : -1;
  }

  private select(cell: number): void {
    if (cell < 0) return;
    this.board.select(cell);
  }

  private setNotes(on: boolean): void {
    this.notes = on;
    this.noteButton.setAttribute('aria-pressed', String(on));
    this.noteButton.classList.toggle('on', on);
  }

  /** A digit from the keypad or the keyboard. `asAnswer` decides which it is. */
  private enter(digit: number, asAnswer: boolean): void {
    const cell = this.board.selection;
    if (cell < 0 || this.game.isClue(cell)) return;
    this.board.clearSpotlight();
    clear(this.hintNote);

    if (asAnswer) {
      const already = this.game.values[cell] === digit;
      this.game.write(cell, already ? 0 : digit, this.app.settings.autoRemoveMarks);
    } else {
      this.game.toggleMark(cell, digit);
    }

    this.afterEdit();
  }

  private eraseCell(): void {
    const cell = this.board.selection;
    if (cell < 0) return;
    this.game.erase(cell);
    this.afterEdit();
  }

  private undo(): void {
    if (!this.game.undo()) return;
    this.afterEdit();
  }

  private redo(): void {
    if (!this.game.redo()) return;
    this.afterEdit();
  }

  private afterEdit(): void {
    this.hintDepth = 0;
    this.board.paint();
    this.undoButton.disabled = !this.game.canUndo;
    this.redoButton.disabled = !this.game.canRedo;
    this.queueSave();
    if (this.game.complete) this.win();
  }

  private move(dr: number, dc: number): void {
    const size = this.game.puzzle.size;
    let cell = this.board.selection;
    if (cell < 0) {
      this.select(this.firstEmpty());
      return;
    }
    let row = Math.floor(cell / size);
    let column = cell % size;
    for (let step = 0; step < size; step++) {
      row = (row + dr + size) % size;
      column = (column + dc + size) % size;
      cell = row * size + column;
      if (!this.game.isClue(cell)) {
        this.select(cell);
        return;
      }
    }
  }

  handleKey(e: KeyboardEvent): void {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key;

    if (key >= '1' && key <= '9') {
      this.enter(Number(key), this.notes === e.shiftKey);
      e.preventDefault();
      return;
    }

    switch (key) {
      case 'ArrowUp':
        this.move(-1, 0);
        break;
      case 'ArrowDown':
        this.move(1, 0);
        break;
      case 'ArrowLeft':
        this.move(0, -1);
        break;
      case 'ArrowRight':
        this.move(0, 1);
        break;
      case 'Backspace':
      case 'Delete':
      case '0':
        if (this.app.settings.clearNeedsHold && !e.shiftKey) break;
        this.eraseCell();
        break;
      case 'n':
      case 'N':
        this.setNotes(!this.notes);
        break;
      case 'z':
      case 'Z':
        this.undo();
        break;
      case 'y':
      case 'Y':
        this.redo();
        break;
      case 'h':
      case 'H':
        if (this.app.settings.hintNeedsHold && !e.shiftKey) break;
        this.hint();
        break;
      case 'c':
      case 'C':
        if (this.app.settings.checkNeedsHold && !e.shiftKey) break;
        this.check();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // ------------------------------------------------------------ check & hint

  private check(): void {
    const wrong = this.game.wrongCells();
    this.game.checks++;
    if (wrong.length === 0) {
      const left = this.game.emptyCells().length;
      toast(left === 0 ? 'All correct.' : `Nothing wrong so far — ${left} cells to go.`);
      this.board.paint();
      this.queueSave();
      return;
    }

    for (const cell of wrong) this.game.flagged.add(cell);
    this.board.paint();
    this.queueSave();
    toast(`${wrong.length} wrong ${wrong.length === 1 ? 'digit' : 'digits'} marked.`);
  }

  /**
   * The next deduction, named and explained — and only filled in if asked for.
   * A hint that just writes a digit teaches nothing; the point is to show
   * which clue was about to give something away.
   */
  private hint(): void {
    const wrong = this.game.wrongCells();
    if (wrong.length > 0) {
      for (const cell of wrong) this.game.flagged.add(cell);
      this.board.spotlight(wrong);
      this.showHintNote(
        'Something is wrong first',
        `There ${wrong.length === 1 ? 'is a digit' : `are ${wrong.length} digits`} on the board that ` +
          `cannot be right. Take ${wrong.length === 1 ? 'it' : 'them'} out and the hint will follow.`,
      );
      this.game.hints++;
      this.queueSave();
      return;
    }

    /*
     * Pressing Hint again walks another step down the same line of reasoning,
     * rather than repeating itself. Most deductions in kakuro rule digits out
     * rather than write one in, and a hint that says "the 6 cannot go there"
     * to a player with no pencil marks on the board has nothing to apply and
     * nothing new to say the next time it is asked. Walking forward, it
     * reaches the digit that follows from it instead. The chain is thrown away
     * the moment the board changes.
     */
    const solver = new Solver(this.game.puzzle, this.game.values);
    let step: Step | null = null;
    for (let i = 0; i <= this.hintDepth; i++) {
      const next = solver.step();
      if (!next) break;
      step = next;
    }

    if (!step) {
      this.hintDepth = 0;
      this.showHintNote('Nothing to add', 'Every technique this game knows is out of ideas here.');
      return;
    }

    // One press or ten down the same chain is one hint: the count is there to
    // say how much help a puzzle took, not to charge by the tap.
    if (this.hintDepth === 0) this.game.hints++;
    this.hintDepth++;

    this.board.spotlight(step.cells.length > 0 ? step.cells : [step.cell]);
    this.showHintNote(TECHNIQUE_NAMES[step.technique], step.text, step);
    this.queueSave();
  }

  private showHintNote(title: string, text: string, step?: Step): void {
    clear(this.hintNote);
    const body = el(
      'div',
      { class: 'hint-body' },
      el('b', { text: title }),
      el('span', { text }),
    );
    this.hintNote.append(body);

    if (step && step.cell >= 0) {
      const apply = el('button', { class: 'hint-apply', type: 'button', text: `Write the ${step.digit} in` });
      apply.addEventListener('click', () => {
        this.select(step.cell);
        this.game.write(step.cell, step.digit, this.app.settings.autoRemoveMarks);
        this.board.clearSpotlight();
        clear(this.hintNote);
        this.afterEdit();
      });
      this.hintNote.append(apply);
    } else if (step && step.removals.some(([cell, mask]) => this.game.marks[cell] & mask)) {
      const apply = el('button', { class: 'hint-apply', type: 'button', text: 'Rub those marks out' });
      apply.addEventListener('click', () => {
        this.game.rubOut(step.removals);
        this.board.clearSpotlight();
        clear(this.hintNote);
        this.afterEdit();
      });
      this.hintNote.append(apply);
    }

    const dismiss = el('button', { class: 'hint-close', type: 'button', 'aria-label': 'Dismiss the hint' }, '×');
    dismiss.addEventListener('click', () => {
      this.board.clearSpotlight();
      clear(this.hintNote);
    });
    this.hintNote.append(dismiss);
  }

  // ------------------------------------------------------------------ finish

  private win(): void {
    if (this.finished) return;
    this.finished = true;
    this.game.pause();
    const ms = this.game.time;

    this.app.history = recordFinish(this.app.history, this.game.id, ms, this.game.hints, this.game.checks);
    dropSave(this.game.id);
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = null;

    const ground = new Solver(this.game.puzzle).grind();
    const technique = ground.hardest ? TECHNIQUE_NAMES[ground.hardest] : 'Arithmetic alone';
    this.claim.textContent = `${technique} · ${this.game.puzzle.size}×${this.game.puzzle.size}`;
    this.claim.setAttribute('aria-live', 'polite');

    const filed = this.game.id.level;
    const played = this.game.puzzle.difficulty;
    const summary =
      filed === played
        ? `Level ${filed}. The hardest thing it asked for was ${technique.toLowerCase()}.`
        : `Opened as level ${filed}, this grid played as level ${played}. The hardest thing it asked for was ${technique.toLowerCase()}.`;

    openOverlay(
      el(
        'div',
        { class: 'won' },
        el('p', { class: 'won-time', text: formatTime(ms) }),
        el('p', { text: summary }),
        this.game.hints > 0 || this.game.checks > 0
          ? el('p', {
              class: 'won-aids',
              text: `${this.game.hints} hint${this.game.hints === 1 ? '' : 's'}, ${this.game.checks} check${this.game.checks === 1 ? '' : 's'}.`,
            })
          : null,
      ),
      {
        title: 'Solved',
        dismissable: false,
        onDismiss: () => this.app.goMenu(),
        actions: [
          { label: 'Menu', onClick: () => this.app.goMenu() },
          {
            label: 'Next puzzle',
            primary: true,
            onClick: () => this.app.playRandom(this.game.id.level),
          },
        ],
      },
    );
  }

  private openGameMenu(): void {
    const body = el('div', { class: 'menu-list' });

    const item = (label: string, note: string, onClick: () => void): HTMLElement => {
      const button = el(
        'button',
        { class: 'menu-item', type: 'button' },
        el('b', { text: label }),
        el('span', { text: note }),
      );
      button.addEventListener('click', () => {
        closeTopOverlay();
        onClick();
      });
      return button;
    };

    body.append(
      item('Fill in all pencil marks', 'Every candidate the clues still allow', () => this.fillMarks()),
      item('Share this puzzle', 'A link that opens this exact grid', () => this.share()),
      item('Restart', 'Empty the grid and start again', () =>
        confirmPanel('Restart this puzzle?', 'Everything written in goes, and the clock keeps running.', 'Restart', () => {
          this.game.restart();
          this.afterEdit();
        }),
      ),
      item('Settings', 'Theme, highlighting, guarded buttons', () => this.app.openSettings()),
      item('How to play', 'The rules and what the buttons do', () => this.app.openHelp()),
    );

    openOverlay(body, { title: 'This puzzle', actions: [{ label: 'Close' }] });
  }

  private fillMarks(): void {
    const solver = new Solver(this.game.puzzle, this.game.values);
    solver.propagate(false);
    const changed = this.game.fillMarks((cell) => (solver.masks[cell] === 0 ? ALL : solver.masks[cell]));
    if (!changed) {
      toast('Every empty cell already has its marks.');
      return;
    }
    this.afterEdit();
    toast('Pencil marks filled in.');
  }

  private share(): void {
    const link = puzzleLink(this.game.id);
    void navigator.clipboard
      ?.writeText(link)
      .then(() => toast('Link copied.'))
      .catch(() => {
        openOverlay(el('p', { class: 'share-link', text: link }), {
          title: 'Share this puzzle',
          note: 'Copy the link below.',
        });
      });
  }

  // ------------------------------------------------------------------- clock

  private tick(): void {
    if (!this.app.settings.showTimer || this.clock.classList.contains('hidden-time')) {
      this.clock.textContent = '·····';
      return;
    }
    this.clock.textContent = formatTime(this.game.time);
  }

  pause(): void {
    this.game.pause();
    this.flushSave();
  }

  resume(): void {
    if (!this.finished && !this.paused) this.game.start();
  }

  private queueSave(): void {
    if (this.finished) return;
    if (this.saveTimer !== null) return;
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      putSave(this.game.toSave());
    }, 800);
  }

  flushSave(): void {
    if (this.finished) return;
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    putSave(this.game.toSave());
  }

  private leave(): void {
    this.pause();
    this.app.goMenu();
  }

  refreshBoard(): void {
    this.board.useSettings(this.app.settings);
    this.tick();
  }

  destroy(): void {
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.ticker = null;
    this.pause();
  }
}
