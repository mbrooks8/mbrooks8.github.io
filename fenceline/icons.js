// Little pencil doodle icons (inline SVG, drawn with currentColor unless a colour is given).
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  undo: 'M9 6 L4 11 L9 16 M4 11 H14 C18 11 20 13.5 20 16.5 C20 19 18 21 15 21 H11',
  redo: 'M15 6 L20 11 L15 16 M20 11 H10 C6 11 4 13.5 4 16.5 C4 19 6 21 9 21 H13',
  pen: 'M4 20 L5 15 L16 4 L20 8 L9 19 Z M14 6 L18 10',
  x: 'M6 6 L18 18 M18 6 L6 18',
  draw: 'M4 19 C7 13 10 18 13 12 C15 8 18 9 20 5 M18 4.5 L20.5 4.5 L20.5 7',
  bulb: 'M9.5 18 h5 M10.5 21 h3 M12 3 C8.5 3 6 5.7 6 9 C6 11.2 7.2 12.6 8.3 13.6 C9 14.3 9.3 15 9.3 16 H14.7 C14.7 15 15 14.3 15.7 13.6 C16.8 12.6 18 11.2 18 9 C18 5.7 15.5 3 12 3 Z',
  people: 'M9 7.5 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M3 20 C3 16.5 5.7 14.5 9 14.5 C12.3 14.5 15 16.5 15 20 M16.5 6.5 m-2.3 0 a2.3 2.3 0 1 0 4.6 0 a2.3 2.3 0 1 0 -4.6 0 M16 13.5 C19 13.5 21 15.2 21 18.5',
  chart: 'M5 20 V12 M11 20 V6 M17 20 V14 M3 20.5 H21',
  gear: 'M12 12 m-3.2 0 a3.2 3.2 0 1 0 6.4 0 a3.2 3.2 0 1 0 -6.4 0 M12 2.5 v3 M12 18.5 v3 M2.5 12 h3 M18.5 12 h3 M5.3 5.3 l2.1 2.1 M16.6 16.6 l2.1 2.1 M5.3 18.7 l2.1 -2.1 M16.6 7.4 l2.1 -2.1',
  book: 'M3.5 5.5 C6.5 4.3 9.5 4.5 12 6.3 C14.5 4.5 17.5 4.3 20.5 5.5 V19.5 C17.5 18.3 14.5 18.5 12 20.3 C9.5 18.5 6.5 18.3 3.5 19.5 Z M12 6.3 V20.3',
  hash: 'M10 4 L8 20 M16.5 4 L14.5 20 M4.5 9 H20 M4 15 H19.5',
  share: 'M17 5.5 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M6.5 12 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M17 18.5 m-2.5 0 a2.5 2.5 0 1 0 5 0 a2.5 2.5 0 1 0 -5 0 M8.8 10.8 L14.7 6.8 M8.8 13.2 L14.7 17.2',
  restart: 'M5.2 13 A7 7 0 1 0 7.5 6.5 M4.5 3.5 V8.5 H9.5',
  eraser: 'M4 15.5 L12.5 7 L19 13.5 L13 19.5 H8 Z M8.5 11 L15 17.5 M13 19.5 H20',
  sun: 'M12 12 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M12 2.5 v2.2 M12 19.3 v2.2 M2.5 12 h2.2 M19.3 12 h2.2 M5.3 5.3 l1.6 1.6 M17.1 17.1 l1.6 1.6 M5.3 18.7 l1.6 -1.6 M17.1 6.9 l1.6 -1.6',
  moon: 'M19 14.5 A7.5 7.5 0 1 1 9.5 5 A6 6 0 0 0 19 14.5 Z',
  sprig: 'M5 21 C9 16 12 11 18 4 M8.3 17 C6.2 15.2 6 12.8 7.6 11.2 C9.3 12.8 9.6 15.2 8.3 17 Z M11.3 13 C9.6 10.9 9.8 8.5 11.6 7.2 C13 9 12.9 11.4 11.3 13 Z M10 15 C12.6 16.4 15 16 16.4 14.2 C14.6 12.6 12 13 10 15 Z M13.4 10.4 C16 11.6 18.3 11 19.5 9 C17.6 7.6 15.2 8.2 13.4 10.4 Z',
  candle: 'M12 3.5 C14.2 6 15 7.6 15 9 C15 10.7 13.7 12 12 12 C10.3 12 9 10.7 9 9 C9 7.6 9.8 6 12 3.5 Z M9.5 13.5 H14.5 V21 H9.5 Z',
  arrow: 'M5 12 H19 M13 6 L19 12 L13 18',
  back: 'M15 5 L8 12 L15 19',
  dots: 'M5 12 h.5 M12 12 h.5 M19 12 h.5',
  check: 'M5 12.5 L10 17.5 L19 6.5',
  invite: 'M10 7.5 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M4 20 C4 16.5 6.7 14.5 10 14.5 C11.5 14.5 12.8 14.9 13.8 15.6 M18 13 V20 M14.5 16.5 H21.5',
  ping: 'M12 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M12 12 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0 M12 12 m-9.5 0 a9.5 9.5 0 1 0 19 0',
  leave: 'M14 4 H19 V20 H14 M10 8 L6 12 L10 16 M6 12 H16',
  newp: 'M12 5 V19 M5 12 H19',
  paste: 'M9 4 H15 V7 H9 Z M7 5.5 H5 V21 H19 V5.5 H17 M8.5 13 H15.5 M8.5 17 H13',
};

/** An icon as an SVG element. [width] is the stroke width in a 24-unit box. */
export function icon(name, size = 24, color = 'currentColor', width = 1.8) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', PATHS[name] || '');
  p.setAttribute('fill', 'none'); p.setAttribute('stroke', color);
  p.setAttribute('stroke-width', name === 'dots' ? 3.2 : width);
  p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
  s.append(p);
  return s;
}
