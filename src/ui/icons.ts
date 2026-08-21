/**
 * The four controls that carry a shape rather than a word.
 *
 * They were text glyphs — `↶ ↷ ⤢ ⏸` — which is a gamble on the font: the
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
