import './style.css';
import type { Level, PuzzleId, Size } from './core/types.ts';
import { displayPuzzleId } from './core/types.ts';
import { getPuzzle, prefetch } from './game/generate.ts';
import { registerServiceWorker, setThemeColour } from './game/pwa.ts';
import { keepScreenAwake } from './game/wakelock.ts';
import {
  POOL_SIZE,
  clearPuzzleLink,
  linkedPuzzle,
  loadHistory,
  loadSaveFor,
  loadSettings,
  saveSettings,
  saveFitsPuzzle,
  retireGeneratedPuzzles,
  unplayedNumbers,
} from './game/storage.ts';
import type { History, Settings, Theme } from './game/storage.ts';
import type { AppContext } from './ui/app-context.ts';
import { clear, el } from './ui/dom.ts';
import { openHelp } from './ui/help.ts';
import { buildMenu } from './ui/menu.ts';
import { closeAllOverlays, closeTopOverlay, onOverlayClose, onOverlayOpen, overlaysOpen, toast } from './ui/overlay.ts';
import { PlayScreen } from './ui/play.ts';
import { openSettings } from './ui/settings.ts';

/** The browser chrome colour that matches each board, for the PWA title bar. */
const THEME_COLOUR: Record<Theme, string> = {
  night: '#0a0d10',
  day: '#dfe4e9',
  contrast: '#000000',
};

/*
 * Before anything reads the history: New puzzles made by an older generator are
 * cleared out, so nothing on screen refers to a grid that can no longer be
 * played. Classic history is untouched.
 */
const forgotten = retireGeneratedPuzzles();

class App implements AppContext {
  settings: Settings = loadSettings();
  history: History = loadHistory();
  readonly poolSize = POOL_SIZE;

  private root: HTMLElement;
  private play: PlayScreen | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.applyTheme();
    this.guardBackButton();

    /*
     * The page can go without warning — a phone reclaiming a backgrounded app,
     * or the reload offered when a new version lands — and the last move must
     * not still be sitting in a save timer when it does.
     */
    window.addEventListener('pagehide', () => this.play?.flushSave());
    document.addEventListener('keydown', (e) => {
      if (overlaysOpen() > 0) {
        if (e.key === 'Escape') {
          closeTopOverlay();
          e.preventDefault();
        }
        return;
      }
      this.play?.handleKey(e);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.play?.pause();
      else this.play?.resume();
    });

    // A shared link names a puzzle outright; honour it instead of the menu.
    const linked = linkedPuzzle();
    clearPuzzleLink();

    this.goMenu();
    if (linked?.ok) this.playPuzzle(linked.id);
    else if (linked && !linked.ok) {
      toast('That New puzzle was made by an older generator and is no longer the same grid.');
    }

    if (forgotten > 0) {
      toast(
        `New puzzles have been regenerated — ${forgotten} played ` +
          `${forgotten === 1 ? 'grid is' : 'grids are'} no longer in the pool`,
      );
    }
  }

  // ------------------------------------------------------------------ screens

  goMenu(): void {
    closeAllOverlays();
    this.play?.destroy();
    this.play = null;
    this.onMenu = true;
    clear(this.root);
    this.root.append(buildMenu(this));
    this.syncGuard();
    this.applyWakeLock();
  }

  openHelp(): void {
    openHelp();
  }

  openSettings(): void {
    openSettings(this);
  }

  playPuzzle(id: PuzzleId): void {
    closeAllOverlays();
    this.onMenu = false;
    clear(this.root);
    this.root.append(
      el(
        'div',
        { class: 'loading' },
        el('div', { class: 'spinner', 'aria-hidden': 'true' }),
        el('p', { text: `Building ${displayPuzzleId(id)}…` }),
      ),
    );
    this.syncGuard();

    void getPuzzle(id)
      .then((puzzle) => {
        this.play?.destroy();
        const save = loadSaveFor(id);
        if (save && !saveFitsPuzzle(save, puzzle)) {
          toast('That save was for a different grid, so this one starts empty.');
        }
        const screen = new PlayScreen(this, id, puzzle, save);
        this.play = screen;
        clear(this.root);
        this.root.append(screen.node);
        screen.attached();
        this.syncGuard();
        this.applyWakeLock();

        // Whichever one this level will hand out next, started now so the
        // worker has it ready rather than the player waiting for it.
        this.queueNext(id.size, id.level, id.number);
      })
      .catch((error: unknown) => {
        toast(error instanceof Error ? error.message : 'That puzzle could not be opened');
        this.goMenu();
      });
  }

  /** The board the menu is set to. */
  get size(): Size {
    return this.settings.size;
  }

  setSize(size: Size): void {
    if (this.settings.size === size) return;
    this.settings.size = size;
    saveSettings(this.settings);
    this.goMenu();
  }

  /**
   * Which number each board and level will hand out next.
   *
   * Chosen when the last one was opened rather than when this one is asked
   * for, which is what lets the worker have it built before anybody wants it.
   * A 20x20 takes seconds to search out, and seconds spent watching a spinner
   * are seconds the player did not ask to spend.
   *
   * The old prefetch warmed `number + 1`, which `playRandom` then had about a
   * one in five hundred chance of asking for — it picks at random from every
   * number still unplayed. Warming a puzzle nobody goes on to open is worse
   * than not warming one at all: it is the same wait, with the worker busy.
   */
  private onDeck = new Map<string, number>();

  playRandom(level: Level): void {
    const size = this.size;
    const key = `${size}-${level}`;
    const from = this.choosableNumbers(size, level);
    const waiting = this.onDeck.get(key);
    // Only if it is still a legitimate choice — the history may have moved.
    const number =
      waiting !== undefined && from.includes(waiting)
        ? waiting
        : from[Math.floor(Math.random() * from.length)];
    this.onDeck.delete(key);
    this.playPuzzle({ size, level, number });
  }

  /** Unplayed numbers, or all of them once the level has been finished off. */
  private choosableNumbers(size: Size, level: Level): number[] {
    const unplayed = unplayedNumbers(this.history, { size, level }, this.poolSize);
    return unplayed.length > 0 ? unplayed : Array.from({ length: this.poolSize }, (_, i) => i + 1);
  }

  /** Pick the one after this, and set the worker on it. */
  private queueNext(size: Size, level: Level, just: number): void {
    const rest = this.choosableNumbers(size, level).filter((number) => number !== just);
    if (rest.length === 0) return;
    const next = rest[Math.floor(Math.random() * rest.length)];
    this.onDeck.set(`${size}-${level}`, next);
    prefetch({ size, level, number: next });
  }

  // ----------------------------------------------------------------- settings

  applyTheme(): void {
    document.documentElement.dataset.theme = this.settings.theme;
    setThemeColour(THEME_COLOUR[this.settings.theme]);
  }

  applyWakeLock(): void {
    keepScreenAwake(this.settings.keepAwake && this.play !== null);
  }

  refreshBoard(): void {
    this.play?.refreshBoard();
  }

  /**
   * Installed as a PWA there is no browser chrome, so the phone's back gesture
   * is the only back there is — and by default it leaves the app entirely,
   * mid-puzzle. One history entry is kept while anything other than the bare
   * menu is on screen, and going back spends it: the top panel closes, or the
   * menu comes back. Only from the bare menu does back leave.
   */
  private guarded = false;
  private spending = false;
  private onMenu = true;

  private guardBackButton(): void {
    onOverlayOpen(() => this.arm());
    onOverlayClose(() => this.syncGuard());
    window.addEventListener('popstate', () => {
      if (this.spending) {
        this.spending = false;
        return;
      }
      this.guarded = false;
      if (closeTopOverlay()) {
        this.syncGuard();
        return;
      }
      if (!this.onMenu) {
        this.goMenu();
        return;
      }
      // Nothing left to close: let the press through by not re-arming.
    });
  }

  private arm(): void {
    if (this.guarded) return;
    this.guarded = true;
    window.history.pushState({ kakuro: true }, '');
  }

  private release(): void {
    if (!this.guarded) return;
    this.guarded = false;
    this.spending = true;
    window.history.back();
  }

  private syncGuard(): void {
    const wanted = overlaysOpen() > 0 || !this.onMenu;
    if (wanted) this.arm();
    else this.release();
  }
}

const root = document.querySelector<HTMLElement>('#app');
if (root) new App(root);

registerServiceWorker(() => toast('A new version has loaded.'));
