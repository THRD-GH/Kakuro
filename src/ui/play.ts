import { Solver, TECHNIQUE_NAMES } from '../core/solver.ts';
import type { Step } from '../core/solver.ts';
import { displayPuzzleId } from '../core/types.ts';
import type { Puzzle, PuzzleId } from '../core/types.ts';
import { Game } from '../game/state.ts';
import type { SavedGame } from '../game/storage.ts';
import { dropSave, puzzleLink, putSave, recordFinish, recordStart, saveSettings } from '../game/storage.ts';
import type { AppContext } from './app-context.ts';
import { fireworks } from './fireworks.ts';
import {
  backIcon,
  checkIcon,
  eraseIcon,
  hintIcon,
  marksIcon,
  moreIcon,
  pauseIcon,
  playIcon,
  redoIcon,
  tableIcon,
  undoIcon,
  unzoomIcon,
  zoomIcon,
} from './icons.ts';
import { Board } from './board.ts';
import { CombosBar, dodgeSide, fillCandidates } from './combos.ts';
import type { StripSide } from './combos.ts';
import { clear, el, formatTime } from './dom.ts';
import { DOUBLE_MS, bindPan, bindTap } from './pointer.ts';
import { closeTopOverlay, confirmPanel, openOverlay, toast } from './overlay.ts';

export class PlayScreen {
  readonly node: HTMLElement;

  private app: AppContext;
  private game: Game;
  private board: Board;
  private combos: CombosBar;

  private clock: HTMLElement;
  private claim!: HTMLElement;
  private undoButton: HTMLButtonElement;
  private redoButton: HTMLButtonElement;
  private hintNote: HTMLElement;

  private zoomed = false;
  /** Panning a zoomed board slides the cell being played under the table; the table gets out of its way. */
  private paneScrollQueued = false;
  private readonly onPaneScroll = (): void => {
    if (this.paneScrollQueued) return;
    this.paneScrollQueued = true;
    requestAnimationFrame(() => {
      this.paneScrollQueued = false;
      this.dodgeCombos();
    });
  };
  /**
   * Which end of the board the player has parked the table at, and the drag
   * that puts it there.
   *
   * The handle is a clue badge rather than the whole panel: the panel scrolls
   * when a clue has more combinations than fit across it, and a drag that
   * fought that scroll would be a poor thing to use. A badge does nothing else.
   */
  private combosSide: StripSide = 'bottom';
  private dragFrom: number | null = null;
  private readonly onCombosDown = (e: PointerEvent): void => {
    const on = e.target as HTMLElement | null;
    if (!on?.closest('.combos-clue')) return;
    const overlays = this.node.querySelector<HTMLElement>('.board-overlays');
    const bar = this.node.querySelector<HTMLElement>('.combos-wrap');
    // In the column beside the board there is nowhere to drag it to.
    if (!overlays || !bar || !overlays.contains(bar)) return;
    this.dragFrom = e.clientY;
    // Captured, so the drag carries on once the finger leaves the badge. A
    // pointer that has already gone cannot be captured, and that is no reason
    // to drop the drag: it goes by clientY, not by the capture.
    try {
      bar.setPointerCapture(e.pointerId);
    } catch {
      // Nothing to do about it.
    }
  };
  private readonly onCombosMove = (e: PointerEvent): void => {
    if (this.dragFrom === null) return;
    // A little slop first, so resting a finger on a badge is not a drag.
    if (Math.abs(e.clientY - this.dragFrom) < 8) return;
    const area = this.node.querySelector<HTMLElement>('.board-area');
    const pane = this.node.querySelector<HTMLElement>('.board-wrap');
    if (!area || !pane) return;
    const view = pane.getBoundingClientRect();
    // Two resting places, and the finger picks one by the half it is in.
    const side: StripSide = e.clientY < (view.top + view.bottom) / 2 ? 'top' : 'bottom';
    if (side === this.combosSide) return;
    this.combosSide = side;
    /*
     * Straight there, without consulting the dodge: a table that answered back
     * mid-drag would read as broken. The rule takes over at the next selection
     * and will lift it off the run then if this end is in the way.
     */
    area.classList.toggle('combos-high', side === 'top');
  };
  private readonly onCombosUp = (): void => {
    this.dragFrom = null;
  };
  /** The last digit typed on a keyboard, to tell a double press from two presses. */
  private lastDigitKey: { digit: number; cell: number; at: number } | null = null;
  /**
   * The layouts that put the controls beside the board, matching the
   * stylesheet's two queries: a wide screen, or a phone on its side. In both,
   * the combination strip belongs in the column under the controls rather than
   * floating over a board with no height to spare.
   */
  private wide = window.matchMedia(
    '(min-width: 46rem) and (min-height: 34rem), (orientation: landscape) and (max-height: 560px)',
  );
  private zoomButton!: HTMLButtonElement;
  private pauseButton!: HTMLButtonElement;
  private tableButton!: HTMLButtonElement;
  private paused = false;
  /** How far down the current line of reasoning Hint has walked. */
  private hintDepth = 0;
  private barWatch: ResizeObserver | null = null;
  private ticker: number | null = null;
  private saveTimer: number | null = null;
  private finished = false;
  /** Stops a fireworks show still running when the screen goes. */
  private stopFireworks: (() => void) | null = null;

  constructor(app: AppContext, id: PuzzleId, puzzle: Puzzle, save: SavedGame | null) {
    this.app = app;
    this.game = new Game(id, puzzle, save);
    app.history = recordStart(app.history, id);

    this.board = new Board(this.game, app.settings, (cell) => this.select(cell));
    this.combos = new CombosBar(this.game, (run, mask) => {
      this.game.pencilInto(run.cells, mask);
      this.afterEdit();
    });

    this.clock = el('button', { class: 'clock', type: 'button', 'aria-label': 'Time' });
    this.clock.addEventListener('click', () => {
      this.clock.classList.toggle('hidden-time');
      this.tick();
    });

    this.hintNote = el('div', { class: 'hint-note', 'aria-live': 'polite' });

    this.undoButton = el('button', {
      class: 'key edit glyph',
      type: 'button',
      'aria-label': 'Undo',
      title: 'Undo',
    });
    this.undoButton.append(undoIcon());
    this.redoButton = el('button', {
      class: 'key edit glyph',
      type: 'button',
      'aria-label': 'Redo',
      title: 'Redo',
    });
    this.redoButton.append(redoIcon());

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
        el(
          'div',
          { class: 'board-overlays' },
          this.hintNote,
          el('div', { class: 'combos-wrap folded' }, this.combos.node),
        ),
      ),
      /*
       * Beside the board on a wide screen this column holds the table as well
       * as the controls; on a phone it is `display: contents` and the controls
       * are a child of `.play` exactly as before.
       */
      el('div', { class: 'side' }, this.controls()),
    );

    /*
     * Big boards start zoomed on a narrow screen. Fitted to a phone, a 20x20
     * gives each cell about eighteen pixels: the answers are still readable but
     * a two-figure clue in half of that is not, and it is below the size a
     * thumb can hit. On anything wider there is room to show the whole board.
     */
    const pane = this.node.querySelector<HTMLElement>('.board-wrap');
    if (pane) {
      bindPan(pane);
      pane.addEventListener('scroll', this.onPaneScroll, { passive: true });
    }

    /*
     * The table grows and shrinks with what it has to say, and how tall it is
     * decides where it can sit, so a ResizeObserver puts it back in its place
     * whenever it changes size. It moves; the board does not.
     */
    const area = this.node.querySelector<HTMLElement>('.board-area');
    const bar = this.node.querySelector<HTMLElement>('.combos-wrap');
    if (area && bar && typeof ResizeObserver !== 'undefined') {
      this.barWatch = new ResizeObserver(() => this.dodgeCombos());
      this.barWatch.observe(bar);
    }
    if (bar) {
      // On the tree, so they go when it goes, like every button on it.
      bar.addEventListener('pointerdown', this.onCombosDown);
      bar.addEventListener('pointermove', this.onCombosMove);
      bar.addEventListener('pointerup', this.onCombosUp);
      bar.addEventListener('pointercancel', this.onCombosUp);
    }

    this.placeCombos();
    /*
     * `resize` as well as the media query's own `change`. The query is the
     * honest signal and fires on a rotation, but it did not fire at all under
     * a viewport resized out from under the page, which left the table parked
     * in a column that no longer existed — below the keypad, in the flow,
     * taking a fifth of a phone screen. `placeCombos` is a parent check, so
     * calling it twice costs nothing.
     */
    this.wide.addEventListener('change', this.replace);
    window.addEventListener('resize', this.replace);
    this.applyCombosSetting();
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

  /**
   * The table has two homes and the layout decides which.
   *
   * Over the foot of the board on a phone, where there is nowhere else for it
   * to go. Beside the board on a wide screen, under the controls: floating, it
   * sat at the bottom of a board area much taller than the board and ended up
   * stranded halfway down the window, with the whole of the second column
   * empty above it. Read against the grid it belongs next to the grid.
   */
  private replace = (): void => this.placeCombos();

  private placeCombos(): void {
    const bar = this.node.querySelector<HTMLElement>('.combos-wrap');
    const side = this.node.querySelector<HTMLElement>('.side');
    const overlays = this.node.querySelector<HTMLElement>('.board-overlays');
    if (!bar || !side || !overlays) return;
    const home = this.wide.matches ? side : overlays;
    if (bar.parentElement !== home) home.append(bar);
    this.dodgeCombos();
  }

  /**
   * Keep the table off the cell being played, by moving the table.
   *
   * Under the board it covered the last rows of a big one, and on a board that
   * already fits its pane there was nothing to scroll: those rows simply could
   * not be played. Everything about where it goes is in `dodgeSide`; this
   * measures what that needs and hangs the answer on the board area, where the
   * stylesheet reads it.
   */
  private dodgeCombos(): void {
    const area = this.node.querySelector<HTMLElement>('.board-area');
    const pane = this.node.querySelector<HTMLElement>('.board-wrap');
    const overlays = this.node.querySelector<HTMLElement>('.board-overlays');
    const bar = this.node.querySelector<HTMLElement>('.combos-wrap');
    if (!area || !pane || !overlays || !bar) return;
    // Beside the board, in the column, there is nothing to dodge.
    if (!overlays.contains(bar)) {
      area.classList.remove('combos-high', 'combos-over');
      return;
    }
    const view = pane.getBoundingClientRect();
    const strip = bar.getBoundingClientRect();
    // How far off the edge the stylesheet holds it: measured, not repeated here.
    const inset =
      area.classList.contains('combos-high') ? strip.top - view.top : view.bottom - strip.bottom;
    const side = dodgeSide(
      this.combosSide,
      view,
      this.playedBands(),
      bar.offsetHeight,
      Math.max(0, Math.round(inset)),
    );
    area.classList.toggle('combos-high', side === 'top');
    // Folded, it asks nothing of the board and the grid centres as it always did.
    area.classList.toggle('combos-over', bar.offsetHeight > 0);
  }

  /**
   * The cells the table has to keep clear of: the one being played and both
   * runs through it, which are the runs the table is talking about.
   */
  private playedBands(): DOMRect[] {
    const selected = this.board.selection;
    if (selected < 0) return [];
    const wanted = new Set<number>([selected]);
    for (const run of [this.game.acrossRun(selected), this.game.downRun(selected)]) {
      if (run) for (const cell of run.cells) wanted.add(cell);
    }
    const bands: DOMRect[] = [];
    for (const cell of wanted) {
      const rect = this.board.rectFor(cell);
      if (rect) bands.push(rect);
    }
    return bands;
  }

  /** Called once the play tree is in the document, so the selected cell can take focus. */
  attached(): void {
    this.placeCombos();
    if (this.finished) return;
    if (this.board.selection >= 0) this.board.select(this.board.selection);
    this.undoButton.disabled = !this.game.canUndo;
    this.redoButton.disabled = !this.game.canRedo;
  }

  // -------------------------------------------------------------- furniture

  private topBar(id: PuzzleId, puzzle: Puzzle): HTMLElement {
    const back = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Back to the menu', title: 'Back to the menu' });
    back.append(backIcon());
    back.addEventListener('click', () => this.leave());

    const menu = el('button', { class: 'icon-button', type: 'button', 'aria-label': 'Puzzle menu', title: 'Puzzle menu' });
    menu.append(moreIcon());
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
   * Two three-by-threes: the nine digits, and the nine tools beside them,
   * drawn rather than named.
   *
   * The sudoku family's arrangement — a pad, six labelled buttons two abreast
   * beside it and a Clear bar across the foot of both — read well and ran to
   * four rows: 193px, nearly a third of a phone. On a phone a kakuro board is
   * limited by height, so all of it came off the board. Three rows are 142px.
   * Two matching blocks were tried once before and read badly, because their
   * words had to shrink to twelve pixels to fit; drawn, a tool needs no more
   * room than a digit. The four colours still say which group a key is in.
   */
  private controls(): HTMLElement {
    const pad = el('div', { class: 'keypad' });
    for (let digit = 1; digit <= 9; digit++) {
      const key = el('button', { class: 'key digit', type: 'button', text: String(digit) });
      /*
       * Tap toggles the digit in the cell's set; hold — or double-tap —
       * forces it in as the answer and tidies the marks in both runs. There
       * is no mode to be in and so no mode to be caught out by.
       */
      bindTap(key, {
        onTap: () => this.tap(digit),
        onHold: () => this.force(digit),
      });
      pad.append(key);
    }

    /*
     * A drawn tool still says what it is — to a screen reader through its
     * label, and to a pointer through its title, which also says when the key
     * wants holding rather than tapping, since nothing on the drawing can.
     */
    const tool = (
      group: string,
      name: string,
      needsHold: boolean,
      drawing: SVGSVGElement,
      what?: string,
    ): HTMLButtonElement => {
      const label = needsHold ? `${name} (hold)` : name;
      const button = el('button', {
        class: `key ${group}`,
        type: 'button',
        'aria-label': name,
        title: what ? `${label}: ${what}` : label,
      });
      button.append(drawing);
      return button;
    };

    /*
     * A guarded tool goes off on a hold and on nothing else — not on a
     * double-tap either, though bindTap counts one as a hold. Digits are
     * double-tapped all the time now that it forces an answer, and a double-tap
     * that lands on a tool instead is exactly the accident a guard is for.
     *
     * A tap still gets an answer: a toast saying the key wants a long press.
     * Ignored in silence, a guarded key looked as if it was broken.
     */
    const guard = (button: HTMLButtonElement, needsHold: boolean, action: () => void): void => {
      if (!needsHold) {
        bindTap(button, { onTap: action });
        return;
      }
      const name = button.getAttribute('aria-label') ?? 'This key';
      bindTap(button, {
        onHold: action,
        // Undo and Redo are greyed out with nothing to take back, and a nudge
        // to hold a key that could do nothing anyway would only be noise.
        onTap: () => {
          if (!button.disabled) toast(`${name} needs a long press.`);
        },
        doubleTap: false,
      });
    };

    const { marksNeedsHold, clearNeedsHold, checkNeedsHold, hintNeedsHold, undoNeedsHold } = this.app.settings;

    /*
     * The slot the Notes button used to hold. Nothing has to switch modes any
     * more, so it went to the one writing job the keypad could not do: filling
     * every cell's marks with what the clues still allow, which is where a lot
     * of players start a hard grid. It wants a hold by default, because a stray
     * tap on it pencilled marks into the whole board.
     */
    const marks = tool('aid', 'Marks', marksNeedsHold, marksIcon(), 'pencil in what is possible in every cell');
    guard(marks, marksNeedsHold, () => this.fillMarks());

    const erase = tool('edit', 'Clear', clearNeedsHold, eraseIcon());
    guard(erase, clearNeedsHold, () => this.eraseCell());

    const check = tool('aid', 'Check', checkNeedsHold, checkIcon());
    guard(check, checkNeedsHold, () => this.check());

    const hint = tool('aid', 'Hint', hintNeedsHold, hintIcon());
    guard(hint, hintNeedsHold, () => this.hint());

    // One setting for both, as killer-sudoku has it: a stray Redo unpicks a move as surely as a stray Undo.
    guard(this.undoButton, undoNeedsHold, () => this.undo());
    guard(this.redoButton, undoNeedsHold, () => this.redo());

    this.tableButton = tool('session', 'Table', false, tableIcon());
    this.tableButton.setAttribute('aria-pressed', 'false');
    this.tableButton.addEventListener('click', () => {
      this.app.settings.showCombos = !this.app.settings.showCombos;
      saveSettings(this.app.settings);
      this.applyCombosSetting();
    });

    this.zoomButton = el('button', {
      class: 'key session glyph',
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': 'Zoom',
      title: 'Zoom',
    });
    this.zoomButton.append(zoomIcon());
    this.zoomButton.addEventListener('click', () => this.setZoom(!this.zoomed));

    this.pauseButton = el('button', {
      class: 'key session glyph',
      type: 'button',
      'aria-pressed': 'false',
      'aria-label': 'Pause',
      title: 'Pause',
    });
    this.pauseButton.append(pauseIcon());
    this.pauseButton.addEventListener('click', () => this.setPaused(!this.paused));

    return el(
      'div',
      { class: 'controls' },
      pad,
      /*
       * Row by row: the table, Marks and Check along the top; zoom, Hint and
       * pause through the middle; undo, redo and Clear along the bottom — the
       * three edit keys together at the foot of the block.
       */
      el(
        'div',
        { class: 'tools' },
        this.tableButton,
        marks,
        check,
        this.zoomButton,
        hint,
        this.pauseButton,
        this.undoButton,
        this.redoButton,
        erase,
      ),
    );
  }

  private applyCombosSetting(): void {
    const open = this.app.settings.showCombos;
    const bar = this.node.querySelector<HTMLElement>('.combos-wrap');
    bar?.classList.toggle('folded', !open);
    this.dodgeCombos();
    this.tableButton?.setAttribute('aria-pressed', String(open));
    this.tableButton?.classList.toggle('on', open);
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
    clear(this.pauseButton);
    this.pauseButton.append(on ? playIcon() : pauseIcon());
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
    // The arrows show what the next press does: pointing apart to zoom in,
    // turned inward once zoomed, to come back out.
    clear(this.zoomButton);
    this.zoomButton.append(on ? unzoomIcon() : zoomIcon());
    this.zoomButton.setAttribute('aria-label', on ? 'Zoom out' : 'Zoom in');
    this.zoomButton.title = on ? 'Zoom out' : 'Zoom in';
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
    this.combos.show(cell);
    this.dodgeCombos();
  }

  /** The cell a digit is going into, with the hint display cleared off it. */
  private target(): number {
    const cell = this.board.selection;
    if (cell < 0 || this.game.isClue(cell)) return -1;
    this.board.clearSpotlight();
    clear(this.hintNote);
    return cell;
  }

  /** A plain tap: toggle the digit in the cell's set. */
  private tap(digit: number): void {
    const cell = this.target();
    if (cell < 0) return;
    this.game.tapDigit(cell, digit, this.app.settings.allowSingleMark);
    this.afterEdit();
  }

  /** Hold, double-tap or Shift+digit: this is the answer, and say so. */
  private force(digit: number): void {
    const cell = this.target();
    if (cell < 0) return;
    this.game.forceDigit(cell, digit, this.app.settings.autoRemoveMarks);
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
    this.combos.refresh();
    this.dodgeCombos();
    this.undoButton.disabled = !this.game.canUndo;
    this.redoButton.disabled = !this.game.canRedo;
    this.queueSave();
    if (this.game.complete) this.win(true);
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
      e.preventDefault();
      // A key held down repeats itself; a repeat is not a second press, and
      // taking each one as a toggle made the digit flicker in and out.
      if (e.repeat) return;
      const digit = Number(key);
      if (e.shiftKey) {
        this.lastDigitKey = null;
        this.force(digit);
        return;
      }
      /*
       * A quick second press of the same digit on the same cell forces it in,
       * as a double-tap on the keypad does — within the keypad's own window,
       * so the two cannot drift apart. The first press has already been taken
       * as a toggle, exactly as the first tap is, and forcing settles the cell
       * whatever that toggle did.
       */
      const now = performance.now();
      const cell = this.board.selection;
      const last = this.lastDigitKey;
      if (last && last.digit === digit && last.cell === cell && now - last.at < DOUBLE_MS) {
        this.lastDigitKey = null;
        this.force(digit);
        return;
      }
      this.lastDigitKey = { digit, cell, at: now };
      this.tap(digit);
      return;
    }

    // Anything pressed in between — a move, a rub-out, an undo — makes the
    // next press of a digit a fresh one.
    this.lastDigitKey = null;

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
      /*
       * Always, whatever Clear's guard is set to.
       *
       * That guard exists because a 44px button is easy to catch with a thumb
       * on the way to something else. A key press is neither easy to make by
       * accident nor ambiguous about which key it was, and rubbing a cell out
       * costs nothing and undoes. Held to the setting, `Delete` did not clear
       * the cell — and, worse, was swallowed doing nothing, because the guard
       * broke out of the switch and the keystroke was already claimed.
       *
       * Check and Hint keep their Shift: those two are counted against the
       * puzzle, so pressing one by accident takes something that cannot be
       * given back.
       */
      case 'Backspace':
      case 'Delete':
      case '0':
        this.eraseCell();
        break;
      case 'm':
      case 'M':
        this.fillMarks();
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
        if (this.app.settings.hintNeedsHold && !e.shiftKey) {
          toast('Hint needs Shift+H.');
          break;
        }
        this.hint();
        break;
      case 'c':
      case 'C':
        if (this.app.settings.checkNeedsHold && !e.shiftKey) {
          toast('Check needs Shift+C.');
          break;
        }
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

  /**
   * `celebrate` is for the moment the last digit goes in. Opening a puzzle
   * that was already finished comes through here as well, and gets the panel
   * without the show.
   */
  private win(celebrate = false): void {
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

    const shown = openOverlay(
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

    // The show stands on the Solved panel: the dojo on its top edge, the
    // fireworks above it.
    if (celebrate && this.app.settings.fireworks) this.stopFireworks = fireworks({ above: shown.querySelector('.panel') });
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
      item('Stats', 'Times, streaks and what is left, then back to this puzzle', () => this.app.goStats(this.game.id.level)),
      item('Settings', 'Theme, highlighting, guarded buttons', () => this.app.openSettings()),
      item('How to play', 'The rules and what the buttons do', () => this.app.openHelp()),
    );

    openOverlay(body, { title: 'This puzzle', actions: [{ label: 'Close' }] });
  }

  private fillMarks(): void {
    const candidates = fillCandidates(this.game);
    const changed = this.game.fillMarks((cell) => candidates[cell]);
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

  get puzzleId(): PuzzleId {
    return this.game.id;
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
    this.stopFireworks?.();
    this.stopFireworks = null;
    this.node.querySelector<HTMLElement>('.board-wrap')?.removeEventListener('scroll', this.onPaneScroll);
    this.barWatch?.disconnect();
    this.barWatch = null;
    this.wide.removeEventListener('change', this.replace);
    window.removeEventListener('resize', this.replace);
    if (this.ticker !== null) window.clearInterval(this.ticker);
    this.ticker = null;
    this.pause();
  }
}
