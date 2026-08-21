# Kakuro

Cross sums, with a combination table, technique-named hints and a six-star
level ladder. Part of the [DanDoku](https://dandoku.com) collection, and served
from `dandoku.com/kakuro/`.

Vite + TypeScript, no runtime dependencies. `npm run dev`, `npm run build`,
`npm test`. MIT licensed so the rest of the collection can share the core.

## Installing

It is a PWA: installable from the browser, and it runs offline. Every puzzle is
generated on the device, so there is no collection to download — the whole app
is about 110 kB and works on a train from the first run.

`npm run build` regenerates `dist/sw.js` from the actual build output, so the
precache list always matches the hashed filenames. `npm run icons` redraws the
app icons; `npm run packs` rebuilds the Classic collection and `npm run verify`
checks it.

## Rules

Fill the white cells with 1–9. A clue is the total of the run it points at: the
number above the diagonal is the run going *across* from that cell, the one
below it is the run going *down*. No digit repeats within a single run — but it
may repeat elsewhere, which is what makes this not sudoku.

## Controls

| Gesture | Effect |
| --- | --- |
| Tap cell | Select it — on press, not release, so a tap that drifts still lands |
| Tap keypad digit | Write it in — or pencil it, in Notes. Pencil marks stay under an answer until Clear. |
| Long-click / double-click a digit | The other one: a pencil mark while writing answers, an answer while pencilling |
| Long-click Clear | Empty the cell |

Keyboard: arrows move, `1`–`9` write, `Shift`+digit pencils, `Backspace`
clears, `N` toggles notes, `Z` undoes, `Y` redoes. When Check, Hint or Clear
is set to need a hold, the matching keys are `Shift+C`, `Shift+H` and
`Shift+Backspace`.

**Zoom** trades fitting the board on screen for cells you can actually hit.
Fitted to a phone, a 20×20 gives each cell about fifteen pixels: the answers
survive that but a two-figure clue in half of one does not, and it is well
under the size a thumb can hit. Large and Huge boards therefore open zoomed on
a narrow screen, scrolling inside their pane with the cursor kept in view.

**The table** under the board lists every combination that still fits the two
clues through the selected cell, with the digits already written in taken out
of both the total and the alphabet — so a 23 across with a 6 in it shows the
ways to make 17 in what is left. Table folds it away.

**Hint** names the technique that cracks the position, explains why it works
and tints the cells it is talking about; it only writes the digit in if asked.
Pressing it again walks another step down the same line of reasoning rather
than repeating itself, which matters because most kakuro deductions rule digits
*out* rather than write one in. **Check** marks digits that disagree with the
unique answer and is counted against the puzzle, so it is held rather than
tapped by default. Hint is a tap unless you turn hold on in Settings.
**Instant check** (off by default) flags a digit that already repeats in a run
or overshoots a clue — it never looks up the answer.

A clue goes green when its run is full and adds up, and red when it is full and
does not. That is arithmetic the player can do unaided, so it gives nothing
away.

## Boards and levels

Two separate choices. **Size** is how long you want to be here; **level** is how
hard you want it to be.

| Board | | Levels it reaches |
| --- | --- | --- |
| Small | 9×9 | all six |
| Medium | 12×12 | all six |
| Large | 16×16 | four of six |
| Huge | 20×20 | the harder end |

Puzzles are generated on demand rather than shipped: there is no Classic and
New split, just a board, a level and a number. Every number is the same grid on
every device, so a link or a saved game still names one particular puzzle.

Size is deliberately not part of the difficulty rating. While it was, a 20×20
that fell to plain combination sums was being filed as a black belt purely for
being large. It now sits beside the level instead of inside it — but the two
are not fully independent *facts*: a big board interlocks more, so its easy
techniques run out sooner and its easy levels are genuinely scarce. A level
with no puzzles on the chosen board is greyed out rather than faked.
`node tools/matrix.ts` prints which pairs are reachable.

Six levels, the same white-belt-to-1st-Dan ladder as the rest of the
collection, and they mean something specific here: **a level is a rung of the
technique ladder.**

| Level | What the puzzle forces |
| --- | --- |
| 1 | Clues with only one combination |
| 2 | The same, over more of the grid before it gives |
| 3 | A digit every combination needs, with one cell left to hold it |
| 4 | Combinations that add up but cannot be written in |
| 5 | Dealing combinations out across a run, cell by cell |
| 6 | The same, on a grid that holds out most of the way |

Four rungs carry six levels, because two of the seven techniques cannot carry
one: `unique-combination` is never the hardest thing a grid asks for, and
`sum-difference` turns up in about one grid in fifty — hunted directly, it
appeared once in six tries at 9×9 and not at all at 14×14. So the two abundant
rungs are split by how much of the grid put up a fight.

Solving a puzzle names the hardest technique it actually needed, on the win
panel and in the header (`Unique combination · 8×8`), so the level number can
be checked against what the grid really asked of you.

**Every puzzle has exactly one answer and can be finished without guessing.**
That is enforced rather than hoped for: the generator throws away any grid its
technique solver cannot finish, and `npm test` re-checks generated puzzles by
exhaustive search — a different argument from the generator's own, which
reasons that a complete technique solve *is* a uniqueness proof.

## How the puzzles are made

Worth writing down, because the obvious approach does not work at all.

A kakuro is generated by filling the grid first and reading the clues off it.
The trouble is that a random fill almost never produces a puzzle: the clues it
implies typically admit dozens of answers. Of the first several hundred grids
this generator produced, **not one** was unique — not at 7×7, not at any block
density, not with the fill biased towards extreme sums, and not with the runs
pinned to combinations that can be written only one way.

The reason is that a run of two summing to 11 says very little, and a grid full
of such runs says nothing at all. Whole regions can shift into another
arrangement with every clue still satisfied. The most obvious case is the swap
— four cells at the corners of a rectangle holding `a b / b a`, which can be
exchanged with every row and column total unchanged — and `fillLayout` refuses
those outright while filling. But the swap is only the cheapest of the
degeneracies, and removing it barely moves the odds.

So the generator does not sample and reject. It takes the grid it has and
*works on it*: the technique solver says which cells it could not pin down,
those cells are cleared and filled again, and the grid is kept if it came out
closer. Ambiguity first, then answers that cannot be reached without guessing,
then the difficulty band. It is a hill climb over the space of clue sets, and it
converges because the blame is always local — the cells the solver got stuck on
are exactly the ones whose clues are not saying enough.

Two things make it fast enough to run in a worker:

- **A complete logical solve is a uniqueness proof.** Every rung of the ladder
  only removes candidates that cannot be right, so a grid the solver finishes
  has exactly one answer. Counting solutions is a tree search; the ladder walks
  a line. The generator never counts.
- **The easy techniques go first, and most grids stop there.** Running
  combination matching over a grid that is nowhere near being a puzzle is
  expensive work to reach a conclusion that was already clear.

Levels come out in tens to hundreds of milliseconds. `node tools/matrix.ts`
prints which size-and-level pairs are reachable, `node tools/density.ts` the
black ratio each board wants, `node tools/effort.ts` the spread the level bands
are cut from, and `node tools/prof.ts` where the time goes.

## Commands

- `npm run dev` — development server
- `npm run build` — typecheck, build into `dist/`, regenerate `sw.js`
- `npm run verify` — generate across the board-and-level matrix and report what is reachable
- `npm test` — fast checks of the ladder, pack encoding, and shared links
- `npm run icons` — redraw `public/icons/`

## Layout

- `src/core/` — no DOM: combinations, layout, the fill, the solver, the generator
- `src/game/` — state, storage (`kk:v1:`), packs, the generation worker
- `src/ui/` — hand-built DOM, no framework
- `tools/` — the pack builder, the verifier, the icon drawer, and the
  measurement scripts the level bands were set from

Storage is namespaced `kk:v1:` and only ever prunes its own keys: the DanDoku
games share one origin, and a game that tidied up `localStorage` generally
would be deleting another game's saves. Classic puzzles are read from the
packs, not from that cache, so rebuilding the collection cannot leave an old
grid in a save slot. A shared New link carries the generator version (`g=`);
an older generator's number is refused rather than opening a different puzzle
under the same id.
