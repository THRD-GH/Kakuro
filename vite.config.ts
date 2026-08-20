import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Short commit of the build, or 'dev' outside a git checkout. */
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// `base` is relative so the built site works from any sub-path. dandoku.com
// serves this game from /kakuro/, and its own Pages site serves it from
// /Kakuro/ — the same dist has to run from both.
export default defineConfig({
  base: './',
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2022',
  },
});
