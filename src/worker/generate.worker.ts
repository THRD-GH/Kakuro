import { generatePuzzle } from '../core/generator.ts';
import type { PuzzleId } from '../core/types.ts';

interface Request {
  token: number;
  id: PuzzleId;
}

// Typed by hand rather than pulling the WebWorker lib in alongside DOM.
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent) => void) | null;
};

ctx.onmessage = (e: MessageEvent) => {
  const { token, id } = e.data as Request;
  try {
    ctx.postMessage({ token, puzzle: generatePuzzle(id) });
  } catch (err) {
    ctx.postMessage({ token, error: err instanceof Error ? err.message : String(err) });
  }
};
