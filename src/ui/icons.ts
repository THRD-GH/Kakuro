/**
 * The tools carry a shape rather than a word — all nine beside the digits,
 * since a word in a key the size of a digit either shrinks to twelve pixels
 * or takes room the board wants.
 *
 * The first four were text glyphs — `↶ ↷ ⤢ ⏸` — which is a gamble on the font: the
 * arrows are missing from several UI faces and arrive as a box or as a
 * different weight and baseline from the labels beside them, so a row of
 * buttons that should read as one set came out ragged. Drawn here they are
 * the same stroke on every platform, and they scale with the button.
 */
const NS = 'http://www.w3.org/2000/svg';

function icon(...parts: [string, Record<string, string>][]): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attrs] of parts) {
    const node = document.createElementNS(NS, tag);
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    svg.append(node);
  }
  return svg;
}

/** Stroked outline: the curves and arrowheads. */
const line = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '1.6',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

/** An arrow doubling back on itself, anticlockwise. */
export const undoIcon = (): SVGSVGElement =>
  icon(
    ['path', { ...line, d: 'M4 6.5h5.25a3.75 3.75 0 0 1 0 7.5H6.5' }],
    ['polyline', { ...line, points: '6.75 3.5 3.75 6.5 6.75 9.5' }],
  );

/** The same arrow the other way about. */
export const redoIcon = (): SVGSVGElement =>
  icon(
    ['path', { ...line, d: 'M12 6.5H6.75a3.75 3.75 0 0 0 0 7.5H9.5' }],
    ['polyline', { ...line, points: '9.25 3.5 12.25 6.5 9.25 9.5' }],
  );

/** Two arrows pulling apart on the diagonal. */
export const zoomIcon = (): SVGSVGElement =>
  icon(
    ['polyline', { ...line, points: '9.5 2.75 13.25 2.75 13.25 6.5' }],
    ['line', { ...line, x1: '13.25', y1: '2.75', x2: '9.25', y2: '6.75' }],
    ['polyline', { ...line, points: '6.5 13.25 2.75 13.25 2.75 9.5' }],
    ['line', { ...line, x1: '2.75', y1: '13.25', x2: '6.75', y2: '9.25' }],
  );

export const pauseIcon = (): SVGSVGElement =>
  icon(
    ['rect', { x: '4.6', y: '3.4', width: '2.4', height: '9.2', rx: '0.9', fill: 'currentColor' }],
    ['rect', { x: '9', y: '3.4', width: '2.4', height: '9.2', rx: '0.9', fill: 'currentColor' }],
  );

export const playIcon = (): SVGSVGElement =>
  icon(['path', { d: 'M5.4 3.6 12.4 8l-7 4.4z', fill: 'currentColor' }]);

/** A pencil: pencil in what is possible in every cell. */
export const marksIcon = (): SVGSVGElement =>
  icon(['path', { ...line, d: 'M11 2.6a1.7 1.7 0 1 1 2.4 2.4L5.3 13.1 2 14l.9-3.3L11 2.6z' }]);

/** A rub-out key with a cross in it: empty the cell. */
export const eraseIcon = (): SVGSVGElement =>
  icon(
    ['path', { ...line, d: 'M13.8 3.3H5.8L1.4 8.2l4.4 5h8a1.2 1.2 0 0 0 1.2-1.2V4.5a1.2 1.2 0 0 0-1.2-1.2z' }],
    ['line', { ...line, x1: '11.9', y1: '6.4', x2: '8.3', y2: '10' }],
    ['line', { ...line, x1: '8.3', y1: '6.4', x2: '11.9', y2: '10' }],
  );

/** A tick: check the grid against the answer. */
export const checkIcon = (): SVGSVGElement =>
  icon(['polyline', { ...line, points: '3 8.6 6.5 12 13 4.5' }]);

/** A bulb rather than a question mark: every belt already has a ? that means explain. */
export const hintIcon = (): SVGSVGElement =>
  icon(
    ['path', { ...line, d: 'M5.9 11c0-1.2-2.4-2.3-2.4-4.9a4.5 4.5 0 0 1 9 0c0 2.6-2.4 3.7-2.4 4.9z' }],
    ['path', { ...line, d: 'M6.2 13h3.6M6.9 14.9h2.2' }],
  );

/** A table with a heading row: the combinations. */
export const tableIcon = (): SVGSVGElement =>
  icon(
    ['rect', { ...line, x: '2.2', y: '2.8', width: '11.6', height: '10.4', rx: '1' }],
    ['path', { ...line, d: 'M2.2 6.3h11.6M2.2 9.8h11.6M6.3 6.3v6.9' }],
  );
