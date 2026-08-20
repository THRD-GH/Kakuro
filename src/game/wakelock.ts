/**
 * Keep the screen on while a puzzle is open. A kakuro is read as much as it is
 * played, and a phone that dims every thirty seconds while you count a run is
 * its own kind of difficulty.
 *
 * The lock is dropped whenever the tab is hidden — the browser drops it for us
 * anyway — and retaken when it comes back, for as long as the caller still
 * wants it.
 */
type Sentinel = { released: boolean; release(): Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
};

let sentinel: Sentinel | null = null;
let wanted = false;
let listening = false;

async function take(): Promise<void> {
  const api = (navigator as WakeLockNavigator).wakeLock;
  if (!api || sentinel || document.hidden) return;
  try {
    sentinel = await api.request('screen');
    sentinel.release = sentinel.release.bind(sentinel);
  } catch {
    // Denied, or the battery is too low. Nothing to do about it.
  }
}

function drop(): void {
  const held = sentinel;
  sentinel = null;
  void held?.release().catch(() => undefined);
}

export function keepScreenAwake(on: boolean): void {
  wanted = on;
  if (!listening) {
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) drop();
      else if (wanted) void take();
    });
  }
  if (on) void take();
  else drop();
}
