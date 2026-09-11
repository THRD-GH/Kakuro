import type { Level } from '../core/types.ts';

const SVG = 'http://www.w3.org/2000/svg';

/**
 * The six belt colours, as the whole of DanDoku wears them — the same values
 * killer-sudoku and Sudoku Variants draw with, so a brown belt here is the
 * brown belt there. The Black belt is the house navy, the same ink as the
 * text beside it.
 */
const COLOURS: Record<Level, string> = {
  1: '#fffdfa',
  2: '#efc44f',
  3: '#6c9a72',
  4: '#3979a8',
  5: '#8a563b',
  6: '#17273d',
};

/**
 * The belt, drawn as the other DanDoku games draw it: a flat band with two
 * lines of stitching, the knot square on it with a fold across, and the two
 * tails hanging below. Same paths, same viewBox, same stroke classes as
 * killer-sudoku's, so a belt looks the same whichever game it is met in.
 *
 * It replaces a coloured rectangle, which read as a swatch rather than as a
 * belt, and which had nothing to keep the white one off the white panel it
 * sat on. The outline here is the theme's strong line, and that is what keeps
 * both ends of the ladder visible — white against the day stock, black
 * against the night page. The Black belt carries its rank on the knot.
 */
export function belt(level: Level, width = 28): SVGSVGElement {
  const colour = COLOURS[level];
  const height = Math.round((width * 22) / 48);

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 48 22');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'belt');

  const path = (d: string, cls: string, fill: string): void => {
    const node = document.createElementNS(SVG, 'path');
    node.setAttribute('d', d);
    node.setAttribute('fill', fill);
    node.setAttribute('class', cls);
    svg.append(node);
  };

  path('M1 5 H47 V13 H1 Z', 'belt-stroke', colour);
  path('M3 7.3 H45 M3 10.7 H45', 'belt-stitch', 'none');
  path('M23 12.5 L29.5 21 L34.5 21 L27.5 12.5 Z', 'belt-stroke', colour);
  path('M20.5 12.5 L13.5 21 L18.5 21 L25 12.5 Z', 'belt-stroke', colour);
  path('M19.5 3.5 H28.5 V14.5 H19.5 Z', 'belt-stroke', colour);
  path('M19.5 3.5 L28.5 14.5', 'belt-fold', 'none');

  if (level === 6) {
    const dan = document.createElementNS(SVG, 'text');
    dan.setAttribute('x', '24');
    dan.setAttribute('y', '10.8');
    dan.setAttribute('text-anchor', 'middle');
    dan.setAttribute('class', 'belt-dan');
    dan.textContent = 'DAN';
    svg.append(dan);
  }

  return svg;
}
