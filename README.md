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
| Long-click Marks | Pencil in what is possible in every cell — no further |

Keyboard: arrows move, `1`–`9` toggle, `Shift`+digit or a quick double press forces, `Delete` or
`Backspace` clears, `M` fills the marks, `Z` undoes, `Y` redoes, `F` puts on the fireworks. When Check or
Hint is set to need a hold, the matching keys are `Shift+C` and `Shift+H`.

Clear and Marks have no keyboard guard, whatever their buttons are set to. The
guard is there because a 44px button is easy to catch with a thumb on the way
to something else; a key press is neither easy to make by accident nor
ambiguous about which key it was, and rubbing a cell out or filling in the
marks costs nothing and undoes. Held to the setting, `Delete` did not clear the
cell and was swallowed doing nothing — the guard broke out of the handler after
the keystroke had already been claimed. Check and Hint keep their `Shift`,
because those two are counted against the puzzle and cannot be given back.

A guarded button goes off on a hold and nothing else. A quick double-tap counts
as a hold on a digit, where it forces the answer, but not on a guard: digits
get double-tapped all the time, and a double-tap that lands on a tool instead
is the very accident the guard is there for. A tap is not ignored in silence,
though, which made a guarded button look broken: it brings up a toast saying
the button needs a long press. When Check or Hint is guarded, `C` or `H`
without `Shift` says what it needs in the same way.

The block is two three-by-threes: the nine digits, and the nine tools beside
them drawn rather than named. Along the top, a table for the combinations, a
pencil for Marks and a tick for Check; through the middle, zoom, a bulb for
Hint and pause; along the bottom, undo, redo and a rub-out key for Clear. Four
colours still say which group a key belongs to before you look at the drawing,
and each tool's title says whether it wants holding.

**Keypad side**, under Display, puts the digits on the right under a right
thumb, with the tools across from them, as killer-sudoku offers it; left is
where they have always been. Only the two blocks swap: 1 to 9 keeps its order
and the tools keep their rows. **Undo needs a hold**, under Game, guards Undo
and Redo together, as killer-sudoku does — a stray Redo unpicks a move as
surely as a stray Undo — and like Clear and Marks it leaves `Z` and `Y` alone.

It came to that the long way round. Two matching blocks of *words* came first,
and the words had to shrink to twelve pixels to fit a key that size. The sudoku
family's arrangement replaced it — a pad, six labelled buttons two abreast
beside it and a Clear bar across the foot — which read well and ran to four
rows: 193px, nearly a third of a phone. On a phone a kakuro board is limited by
height, so every one of those pixels came off the board. Drawn, a tool needs no
more room than a digit, and three rows are 142px.

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

The drawings are SVG rather than text glyphs. As characters, `↶` and `↷` were a
gamble on the font — missing from several UI faces, or arriving at a different
weight and baseline from their neighbours. The bars' `?`, `⚙`, `←` and `⋯` are
drawn for the same reason: as characters the cog came out as a coloured emoji
on some phones, and the dots and the arrow sat at a different height in each
face.

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

The key's arrows show what the next press does: pointing apart to zoom in,
turned inward once zoomed, to come back out. Zooming in never makes the board
smaller — zoomed, a cell is the size a thumb can hit or half as big again as it
was, whichever is bigger. The floor on its own shrank any board whose cells were
already bigger than it, which on a desktop is most of them.

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
contrast to spare, and green digits on the dark clue squares could not be read.

Solving a puzzle puts on about eight seconds of fireworks above a dojo — the
belts are judo's, so the celebration is too. The dojo is a line drawing in the
theme's ink on the panel's paper, with a hint of the house colours: its roofs
washed in the accent's pale blue, like slate, and a curtain of the house coral
across the doorway. It stands on the top edge of the Solved panel. Rockets go up
from behind it trailing embers and burst in four kinds of shell — a two-tone peony, a
crackle that breaks into white specks, a tilted ring with a glittering heart,
and a gold willow that droops — before a finale of four at once. Every spark
glows and leaves a trail, each burst opens with a flash, and the show goes in
behind the panel, so nothing covers what it says. The sky behind it darkens to
the house night navy while it plays: over a board of dark clue squares, dimmed
by the panel's shade, even bright colours were lost. The first version was five
small single-colour bursts over in about two seconds, in the theme's muted
colours, and did not read as fireworks at all.

It scales to the screen, and where there is too little room above the panel the
dojo is left out. Every rocket climbs at 30° or more from the horizontal, in a
direction dealt afresh for each show. Bursts used to be placed first and the
rockets aimed at them, and on a wide screen the ones beside a centred panel had
rockets flying out almost flat to reach them; now the direction comes first, and
a test holds every rocket to the angle. Settings can turn the show off, and it
never plays when
the device asks for reduced motion: the stylesheet stills CSS animation for
that, but a canvas is drawn by script and has to check for itself. Reopening a
puzzle that was already finished shows the panel without it, and leaving for
the next puzzle stops a show that is still going.

To see it without solving anything, Settings > Display has a row under the
switch that plays the show on a panel of its own, standing in for the Solved
panel so the layout is the one a solve gets, with Again to run it once more.
`F` on a keyboard does the same from the menu or a puzzle. It plays whether or
not the switch is on, since seeing it is how to decide; on a device that asks
for reduced motion the panel says why there is nothing to see.

`src/ui/fireworks.ts` is written to be lifted into the other DanDoku games as it
is: no imports, no stylesheet, the dojo's colours from the house tokens every
one of them defines, and the panel to stand on passed in.

## Stats

The chart on the menu bar, or Stats in a puzzle's own menu, opens a screen laid
out as killer-sudoku's is. First the totals across everything played: puzzles
solved of those opened, the average and best times, the run of days with a
puzzle solved, the hints and checks spent, and how many were solved on each
belt. Then the unfinished games — the same saved games the menu's picker lists,
drawn by the same row, with the same tap to pick one up and bin to throw it
away. Last, the puzzles of one board and belt: a row of belts and a row of
boards where killer has levels and sources, a line of what has been played,
solved and is left, and a row for each puzzle with its date and best time.

A solved puzzle is out of the pool, so the menu does not deal it again. Holding
its row in Stats puts it back, counted as left and dealt again, without losing
its best time; solving it again takes it back out. Reset clears a board and belt
outright, unfinished games with it, after asking. Opened from a puzzle, Stats
saves the game first and its way out leads back to that puzzle, board and clock
as they were, and the phone's back gesture goes the same way.

## Your data and the pool

The Game tab of Settings ends with **Your data**, as in the other DanDoku games,
though it is left off Display: Export data downloads `kakuro-backup.json` with
your history, settings and unfinished games,
and Import data replaces them from one, after asking. The file is checked in
full before anything is written, so a wrong or damaged one leaves everything as
it was. It records the generator its puzzles came from; a backup from an older
generator brings back its settings only, because its history and games name
grids that no longer exist. The background photo stays on the device it was
chosen on.

**Puzzles per belt**, first under Game, sets how many numbered grids each board
and belt offers: 500, 1,000, 2,500 or 5,000, as killer-sudoku offers. Every grid
is generated from its number, so a bigger pool is more puzzles rather than
different ones, and the menu's counts of what is left follow it as it changes.

## The look

Kakuro wears the DanDoku house style, taken from killer-sudoku and Sudoku
Variants rather than invented here, so the three read as one family: navy ink
`#17273d` on warm stock `#f4efe5`, square corners, hard offset shadows and no
blur anywhere, and a monospace for the things that label rather than speak —
the app's name, the kicker, a belt's rank, a puzzle's code, the counts.

It had its own cream and near-black before, a wordmark instead of a title bar,
and coloured rectangles for belts. Next to the other games it looked like a
different app. The menu now opens the way theirs do: a title bar framed in 2px
of ink, a kicker under a coral dash, a big tight title, and the belts drawn as
belts, from the same paths as killer's so a brown belt is the same brown belt
in every game. Each level reads down the left in killer's three lines — belt
and name, rank and what it stands for, what the puzzles ask — with what is
left against the right-hand edge. Every row is the same 63px, so the list does
not move under the eye.

The one solid button on the page is the resume, under the levels rather than
over them: it comes and goes with whether anything is unfinished, and sitting
above the choices it moved the whole list down the screen when it did. One
game goes straight back to it; several open the picker.

The palette is global, because a navy menu in front of a brown board would be
two apps again. The board's own meanings did not have to move — the cursor's
ochre, the settled green and the red for a mistake were already the family's
values — so only the ink changed: the clue squares are the navy of the text
beside them.

**Backgrounds**, from the same six drawn patterns the other games offer —
Seigaiha, Shippō, Tatami, Washi, Sumi and Obi, built as SVG at load so nothing
is downloaded — or a photo of your own, shrunk to 1600px and kept on the
device. A Dim slider lays the page colour over the picture to taste. On a
wide screen each screen stands on the picture as a framed mat; on a phone the
mat would hide the picture entirely, so every piece stands on it as a tile of
its own instead. Kakuro has more loose print on its menu than the other games
— a hero, the board picker, section labels, the line at the foot — and each
gets a tile or a tab, so nothing readable ever sits on the image. The board's
rules are translucent ink drawn through the gaps between cells, so behind a
picture they sit on the page colour rather than showing the picture through.

On a desktop the frame ends where the game does. The play screen used to be
the height of the window, because the board takes its size from the space it
is given — but a desktop board is limited by the width of its column long
before the height, so the frame ran from the top of the window to the bottom
with the game in its top two thirds, as killer's once did. The board's area is
square instead: as wide as its column, and never taller than the window allows
once the bar and the frame are paid for. When the height is what limits it,
the play screen narrows to match, so the frame hugs the game both ways rather
than leaving a band of empty sheet beside the board. On a phone the play
screen is still sized to the window, and there is no frame to size.

The picture is pinned to the window rather than painted on the page, so it
covers the whole background whatever height the content is, and holds still
while a page scrolls. Painted on the page, it stopped where the page did. The
plain CSS for a fixed background would do the same, except that mobile Safari
ignores it.

**Settings split in two**, as killer's did: Game for how the puzzle behaves
and how you write into it, Display for how it looks and what the device does.
The switches are the house switch — a square track framed in ink, a square
knob that slides across and inks the whole thing in when on — and a choice
such as the theme is a row of buttons with one lit. The one place Kakuro keeps
its own way is that each switch is still a real button with a switch role,
which a keyboard and a screen reader can work.

**Each belt has a `?`**, which says what it asks before you commit to one: the
technique it introduces, named and explained in the solver's own words, so the
panel, a hint and the win screen all call a step by the same name. Kakuro's
level row is a single button that starts a puzzle, and a button cannot sit
inside a button, so the `?` has a cell of its own at the end of the row rather
than inside the belt's lines as killer draws it.

**On a phone, one screen.** The menu ran to 793px on a 664px phone — about
what an iPhone shows with Safari's bars up — and to 856 with a picture behind
it, so the last belts and the Resume button were a scroll away. It now tightens
on any phone and gives things up in steps as the screen gets shorter: first the
standfirst, each belt's third line and the hint, which the `?` on every belt
explains in full; then the build stamp; on the smallest phones, the title the
bar above already says. Measured with a picture behind it and unfinished games
waiting, it fits at 390×664, 375×553 and 360×640.

The top bar keeps its controls on any width: the puzzle's name is the part that
gives way, trimming to an ellipsis before the ⋯ at the end can be pushed past
the edge of a screen that clips what spills — checked with text set to 150%.
The play screen's height also takes off the phone's safe areas: the body is
padded out of them, and a height that ignored them ran the keypad off the
bottom of a notched phone playing from its home screen.

Held sideways, the combination strip moves into the column under the controls,
as it sits on a desktop, instead of floating over the bottom of a board with no
height to spare while that column stood empty.

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
