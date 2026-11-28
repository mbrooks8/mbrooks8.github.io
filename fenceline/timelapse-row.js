// Three quiet icons for a finished game's timelapse: watch it, save it as a video, share it with a friend.
// Used by the win card and the Play together results. Nothing shows when the game has no timelapse.
import { el } from './ui.js';
import { icon } from './icons.js';
import { replayDialog } from './replay.js';
import { canMakeVideo, canShareVideo } from './replay-video.js';
import { findTimelapse } from './timelapse.js';

/** [entry] = {code, tl, ms} (the history entry just added). Returns the row, or null. */
export function timelapseRow(entry) {
  if (!entry || !entry.tl || !entry.code || !findTimelapse(entry.tl)) return null;
  const tool = (label, name, auto) => {
    const b = el('button', { type: 'button', class: 'tool', 'aria-label': label, title: label }, icon(name, 24));
    b.addEventListener('click', () => replayDialog(entry, auto ? { auto } : {}));
    return b;
  };
  return el('div', { class: 'tlrow' },
    tool('Watch the timelapse', 'play'),
    ...(canMakeVideo() ? [tool('Save the timelapse video', 'download', 'save')] : []),
    ...(canShareVideo() ? [tool('Share the timelapse video', 'share', 'share')] : []));
}
