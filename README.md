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
app icons, and `npm run verify` generates across the whole board-by-level
matrix and reports what each pair costs.

## Rules

Fill the white cells with 1–9. A clue is the total of the run it points at: the
number above the diagonal is the run going *across* from that cell, the one
below it is the run going *down*. No digit repeats within a single run — but it
may repeat elsewhere, which is what makes this not sudoku.

## Controls

The cell holds a *set* of digits: one digit shows as an answer, two or more
show as pencil marks. That single idea explains the whole keypad — and it is
why there is no Notes mode.

| Gesture | Effect |
| --- | --- |
| Tap cell | Select it — on press, not release, so a tap that drifts still lands |
| Tap a keypad digit | Toggle that digit in the cell |
| Long-click / double-click a digit | Force it in as the answer, tidying the marks in both its runs |
| Long-click Clear | Empty the cell |
| Marks | Pencil in what is possible in every cell — no further |

Keyboard: arrows move, `1`–`9` toggle, `Shift`+digit forces, `Delete` or
`Backspace` clears, `M` fills the marks, `Z` undoes, `Y` redoes. When Check or
Hint is set to need a hold, the matching keys are `Shift+C` and `Shift+H`.

Clear has no keyboard guard, whatever the button is set to. The guard is there
because a 44px button is easy to catch with a thumb on the way to something
else; a key press is neither easy to make by accident nor ambiguous about
which key it was, and rubbing a cell out costs nothing and undoes. Held to the
setting, `Delete` did not clear the cell and was swallowed doing nothing —
the guard broke out of the handler after the keystroke had already been
claimed. Check and Hint keep their `Shift`, because those two are counted
against the puzzle and cannot be given back.

The block itself is laid out as the sudoku games lay theirs out: the digits
in a pad of their own, Clear and the undo pair across its foot, and the six
remaining buttons beside the pad, two abreast and grouped by column — the
solving aids in one, the session buttons in the other. Four colours say which
group a key belongs to before its label is read.

Two matching three-by-threes came first and was wrong in the hand: it made the
nine buttons pressed occasionally exactly as large as the nine pressed
constantly, which cost the digits their size — 59×44, wider than they are
tall, which no phone keypad is — and left the labels at twelve pixels in a
fifty-pixel box. Digits are now 48×44 with 13px labels beside them, and Clear,
the key used most after the digits, has the widest target on the board. The
editing strip runs under *both* columns rather than under the pad alone,
because tucked under the pad it gave the left column a fourth row against the
right column's three, and that made the keys pressed least the tallest things
on screen.

None of it costs the board anything: on a phone the grid is limited by the
width of the screen long before its height, so the block grew by 51px into
space that was already slack.

**Beside the board**, on anything wider than a phone, the controls and the
table share a column of their own. The table used to stay an overlay there
too, pinned to the foot of a board area far taller than the board, which left
it stranded halfway down the window with the whole of the second column empty
above it. It is read against the grid, so it belongs next to the grid.

The play screen is also allowed the whole window rather than the 56rem the
menus use. 56rem is a reading width, right for text; but the board is square
and takes its size from the *narrower* side of what it is given, so capping
the width capped the board — 556px of grid with 368px of height going spare,
and a 20×20 cell down at 28px for no reason. Uncapped it is 744px and 36px.
The menus stay where they were.

Undo, redo, zoom and pause are drawn rather than typed. As text glyphs they
were a gamble on the font — `↶` and `↷` are missing from several UI faces and
arrive as a box, or at a different weight and baseline from the labels beside
them, so a row that should read as one set came out ragged.

A mode is the wrong shape for this. It was invisible at the moment it counted:
you found out which one you were in from what came up in the cell, and by then
it was a move to undo. Tapping a second digit demoting the answer to two marks
is the same act as tapping the second candidate, and crossing marks off until
one is left answers the cell, so the two ways of playing are one gesture rather
than a switch between them. Only forcing an answer strikes that digit off the
rest of both runs — a tap is far too easy to make by accident to let it change
anything outside its own cell.

**Zoom** trades fitting the board on screen for cells you can actually hit.
Fitted to a phone, a 20×20 gives each cell about fifteen pixels: the answers
survive that but a two-figure clue in half of one does not, and it is well
under the size a thumb can hit. Large and Huge boards therefore open zoomed on
a narrow screen, scrolling inside their pane with the cursor kept in view.
A finger pans it natively; a mouse drags it, since the alternative was the
scrollbar and the combination bar floats over exactly where that lives. The
bar also reserves its own height under the board, so the bottom row can always
be scrolled clear of it.

**The table** is a strip over the foot of the board showing what can still go
in the cell you are on, both clues through it at once. A combination reads as
the run itself: the digits already written, in their places, and the ones still
to come bracketed in the gap they go in. A 39 across reading `8 4 _ _ 5 9`
shows as `8 4 (67) 5 9`, so the bracket can be read straight onto the cells it
belongs to without counting along the row. It follows the cursor, tap a
combination to pencil it into the run, hold one to rule it out, and Table folds
it away.

Once the empty cells are no longer one stretch there is no gap the set belongs
in, and putting it in the first says something untrue — `_ _ _ 3 _ 2 _ _` came
out `(456789) 3 · 2 ·`, which reads as six digits going into the first three
cells. So a broken run dots every empty cell and states the set once at the
end: `· 4 · 5 · · = 6789`. The dots also carry how wide each gap is, which the
first-gap bracket threw away.

Only combinations that can actually be *dealt out* are listed — the same
matching test the solver uses — so a set needing a 7 is dropped when every
empty cell of the run crosses a run that already has one. That is both more
useful and much shorter than listing everything that merely adds up.

**Your own pencil marks count too.** A cell marked `2 3` is you saying it is
one of those two, so a set with nothing for it is not on offer: a 10 down
listing `19 28 37 46` comes down to `28 37`. Without that, the strip went on
showing the same dozen sets it showed from the opening position long after the
cells had been narrowed down by hand — the moment it had least to say was the
moment it was saying most. It cuts the other way as well, and that is the point:
marks that cannot be right leave the run with *nothing that fits*, which is
worth being told before the rest of the grid is built on them.

**Marks** pencils in what is *possible* in every cell at once — and possible
is where it stops. A digit is offered when nothing in the rules has ruled it
out: it is not already written in either run through the cell, and it appears
in at least one set that adds up to what that run has left. Working out which
of those survive is the puzzle. Doing that for the player is not saving them
the writing, it is playing for them.

So Marks deliberately does *less* than the table beside the board. The table
lists only combinations that can actually be dealt out across a run's cells —
a real deduction, run through a matching — for the one run you asked about.
Marks writes into two hundred cells at once and nobody asked, so it stops at
the arithmetic. On an untouched grid the two agree, because a cell that can
take any digit can always be dealt one; part-solved is where they part, and
there the matching was cutting 2.58 candidates a cell down to 2.25.

It has been too clever twice. First it filled from the technique solver run to
a standstill — and those rules *place* digits, and a placed digit feeds the
next sweep, so on an easy grid one tap returned a single correct candidate for
every empty cell: the whole answer, in pencil. Measured across the four
boards, 100% of cells came back decided at white belt and 70–93% at black.
Cutting that back to one pass of dealable combinations fixed the back door but
still did the player's narrowing for them. Sums and repeats are where the line
goes. `node tools/marks.ts` prints the comparison.

**Hint** names the technique that cracks the position, explains why it works
and tints the cells it is talking about; it only writes the digit in if asked.
Pressing it again walks another step down the same line of reasoning rather
than repeating itself, which matters because most kakuro deductions rule digits
*out* rather than write one in. **Check** marks digits that disagree with the
unique answer and is counted against the puzzle, so it is held rather than
tapped by default. Hint is a tap unless you turn hold on in Settings.
**Instant check** (off by default) flags a digit that already repeats in a run
or overshoots a clue — it never looks up the answer.

A cell settles — taking a green wash — once *both* runs through it are full and
add up, so nothing about it can change again. The wash spreads across the grid
as the puzzle comes together. A run that is full and does *not* add up washes
its clue square red instead, because that is where the arithmetic went wrong
and there is nowhere else to point. Both are sums the player could do unaided,
so neither gives anything away.

Neither is coloured *ink*: a clue square is the one place on the board with no
contrast to spare, and green digits on black could not be read.

## Boards and levels

Two separate choices. **Size** is how long you want to be here; **level** is how
hard you want it to be.

| Board | | |
| --- | --- | --- |
| Small | 9×9 | all six levels |
| Medium | 12×12 | all six levels |
| Large | 16×16 | all six levels |
| Huge | 20×20 | all six levels |

Puzzles are generated on demand rather than shipped: there is no Classic and
New split, just a board, a level and a number. Every number is the same grid on
every device, so a link or a saved game still names one particular puzzle.

**500 numbers to each board and level**, so 12,000 puzzles, none of which are
downloaded or stored — the pool is a bound on which numbers may be asked for,
not a collection sitting somewhere. Raising it cannot disturb what is already
there, because a grid is seeded from its size, level and number and nothing
else: number 158 was the same puzzle when the pool was 400. `node
tools/pool.ts` generates past the current bound and reports what fails, what
lands off its band, and what it costs.

A puzzle is printed as `KAH1-373` — Kakuro, **H**uge, white belt, number 373.
The board is a letter: S, M, L, H. It used to be left out on the grounds that
the board was on screen beside the id wherever the id appeared, and that
stopped being true as more places came to print it — the picker's
confirmation, its toast, the loading line and the menu's `Last:` all show a
bare code with nothing else around it. Worse, the code was ambiguous without
it: numbers run 1..500 inside one board *and* level, so a 9×9 white belt 158
and a 20×20 white belt 158 are different puzzles that printed the same name.
The letter rather than `20` matches the family, where the sudoku variants
print `XJHC6-1`.

Each level on the menu says how many of its 500 are left, and how many are
done once any are. `unplayed` said nothing about how much there was, and
`1 done` said nothing about how much was not — neither answers the question
the row is really asked, which is whether there is more of this to play.

**The ladder is calibrated to each board.** That is not a shortcut, it is the
only honest way to offer six levels on four boards: a 20×20 that falls to the
combination union *everywhere* does not exist, because somewhere in two hundred
cells something always wants more. A ladder defined by technique alone left the
easiest levels permanently out of reach on the largest boards, and no amount of
tuning the measure changed that — it was a fact about kakuro, not about the
measure.

So a level is a puzzle's rank against its own board. A white belt 20×20 is the
easiest kind of 20×20 rather than a 9×9 stretched out, and every level exists
on every board by construction. The band edges are the sextiles of what the
generator really produces on each board; `node tools/bands.ts` refits them.
`node tools/matrix.ts` prints which pairs are reachable.

Difficulty is measured in two parts: the dearest technique the grid forces, and
how much of the grid actually needed it. The second is measured by taking the
technique away — solve again with the ladder capped a rung lower and see what
is left standing. A puzzle where that leaves three cells needed it once, in a
corner; one where it leaves half the grid needed it throughout.

That share is a fraction of cells, and a stuck pocket is a clump rather than a
cell, so the same few awkward corners read as half a small grid and a fifteenth
of a large one — measured, the medians run 0.52 down to 0.07 across the four
boards. Normalising against each board's own median is what stops the ladder
meaning different things at different sizes.

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

**Speed matters most on the big boards**, which are the interesting ones, and
they were the slow ones: a 20×20 level 3 averaged 4.1 seconds and reached 7.8.
Three things, none of which moved a single puzzle — `node tools/snapshot.ts`
fingerprints 120 grids across every board and level, and it is the same before
and after.

- **A run that has not moved is not swept again.** A combination sweep reads
  nothing but its own run's cells, so a run untouched since that sweep last
  looked at it cannot answer differently. On a 20×20 there are two hundred
  runs and a sweep that changes anything usually changes one. Cleared *before*
  the work rather than after, so a run this sweep does change marks itself and
  gets its next look, exactly as when every run was swept every time.
- **`live()` stopped recomputing what it was handed.** Every caller reads the
  run's state to decide whether to ask at all, and `live` then read it again —
  a second walk and a second array per run, per sweep, on every grid judged.
- **`measure()` takes the solve the caller already did.** Judging a grid means
  solving it to see whether it is a puzzle and measuring it to see how hard,
  and the measure solved it again from a fresh solver.

89.2s → 61.7s over those 120 grids; the worst 20×20 went 7.8s to 5.3s. One
thing tried and reverted: packing the per-sweep flags into one buffer of
`subarray` views cost 43%, which is more than the sweeps themselves saved.

That still leaves seconds on a Huge board, so **the next puzzle is chosen when
the last one opens** rather than when it is asked for, and the worker builds it
while you play. There was already a prefetch, warming `number + 1` — which
`playRandom` had about a one in five hundred chance of asking for, since it
picks at random from every number still unplayed. Warming a puzzle nobody opens
is worse than warming none: the same wait, with the worker busy. Now the choice
is made first and prefetched, so the second Huge puzzle of a sitting opens at
once and the third is already building.

Levels come out in tens to hundreds of milliseconds. `node tools/matrix.ts`
prints which size-and-level pairs are reachable, `node tools/density.ts` the
black ratio each board wants, `node tools/effort.ts` the spread the level bands
are cut from, `node tools/marks.ts` how much of the answer the Marks key gives
away, `node tools/pool.ts` what generating past the current pool costs,
`node tools/snapshot.ts` a fingerprint of what the generator produces — so a
change meant to be a speed-up can be proved not to have moved a puzzle — and
`node tools/prof.ts` where the time goes. `node --prof tools/one.ts 20 3 158`
profiles a single grid.

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

A save is filed under its printed id, and that id has been through three
formats: `level-Nnumber`, then with the board size in front of it, then with
the Classic/New letter taken out. A save written under an older one sat under
a key the current code could not work out, so throwing it away deleted nothing
and the row came back the moment the list redrew — while the toast said it had
gone. It could not be picked up either: with no size on its id there was no
board to build, which is what `undefined×undefined` in the picker was saying.
They are re-filed on load rather than binned, because the size is recoverable
from the puzzle the save carries; where two old keys land on one new one, the
game played most recently is the one kept.

Storage is namespaced `kk:v1:` and only ever prunes its own keys: the DanDoku
games share one origin, and a game that tidied up `localStorage` generally
would be deleting another game's saves. Classic puzzles are read from the
packs, not from that cache, so rebuilding the collection cannot leave an old
grid in a save slot. A shared New link carries the generator version (`g=`);
an older generator's number is refused rather than opening a different puzzle
under the same id.
