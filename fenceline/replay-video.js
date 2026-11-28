// Saving a replay as a video: the replay is played once more while each frame is drawn onto a
// picture-sized canvas (the board, the title, the clock, and who took a hint) and recorded.
// Works where the browser can record a canvas (Chrome, Android's WebView, Safari 14.1+).
import { canSaveFile, saveFile, shareSaved, canShareSaved, isApp } from './native.js';

const W = 720, H = 840;

/** The best video type this browser records (MP4 plays everywhere; WebM is the fallback), or null. */
export function videoType() {
  if (typeof MediaRecorder === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  const types = [['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4'], ['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm']];
  for (const [mime, ext] of types) { try { if (MediaRecorder.isTypeSupported(mime)) return { mime, ext }; } catch (e) { /* try the next */ } }
  return null;
}

/** Can the replay be saved as a video here? (Not in an app build that can't write files.) */
export const canMakeVideo = () => !!videoType() && (!isApp || canSaveFile());

/** Can the video be handed to a friend here (the phone's share sheet)? */
export const canShareVideo = () => {
  if (!canMakeVideo()) return false;
  if (isApp) return canShareSaved();
  return typeof File === 'function' && !!navigator.canShare && !!navigator.share;
};

function fit(ctx, src, x, y, w, h) {
  const k = Math.min(w / src.width, h / src.height);
  const dw = src.width * k, dh = src.height * k;
  ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/**
 * One picture of the video: paper, the board, then "Fenceline · 7x7 medium" with the game clock,
 * and a line for the latest hint or the players. [look] = {pal, font}.
 */
export function drawVideoFrame(ctx, boardCanvas, { title, clock, note, noteColor, look }) {
  const { pal, font } = look;
  ctx.fillStyle = pal.paper; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = pal.ruling; ctx.lineWidth = 2;
  for (let y = 60; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  fit(ctx, boardCanvas, 20, 20, W - 40, W - 40);
  ctx.textBaseline = 'middle';
  ctx.font = `30px ${font}`;
  ctx.fillStyle = pal.ink; ctx.textAlign = 'left'; ctx.fillText(title, 34, W + 36);
  ctx.textAlign = 'right'; ctx.fillText(clock, W - 34, W + 36);
  ctx.textAlign = 'center'; ctx.font = `28px ${font}`;
  ctx.fillStyle = noteColor || pal.inkSoft; ctx.fillText(note || '', W / 2, W + 90, W - 60);
}

/** Records a canvas that [draw](ctx, W, H) paints on. start(), then stop() gives the video Blob; cancel() throws it away. */
export function createVideoCapture(draw) {
  const type = videoType();
  if (!type) throw new Error('no video here');
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const ctx = out.getContext('2d');
  const parts = [];
  const rec = new MediaRecorder(out.captureStream(30), { mimeType: type.mime, videoBitsPerSecond: 3000000 });
  rec.ondataavailable = e => { if (e.data && e.data.size) parts.push(e.data); };
  let timer = 0, done = null;
  const frame = () => draw(ctx, W, H);
  return {
    ext: type.ext,
    start() { frame(); rec.start(500); timer = setInterval(frame, 33); },
    stop() {
      clearInterval(timer);
      frame();
      return new Promise(res => { rec.onstop = () => res(new Blob(parts, { type: type.mime.split(';')[0] })); done = true; try { rec.stop(); } catch (e) { res(new Blob(parts)); } });
    },
    cancel() { clearInterval(timer); rec.ondataavailable = null; rec.onstop = null; if (!done && rec.state !== 'inactive') { try { rec.stop(); } catch (e) { /* already stopped */ } } },
  };
}

/** Puts the video where the player can keep it. Returns a short sentence for the note line. */
export async function saveVideo(blob, name) {
  if (isApp) {
    const where = await saveFile(blob, name);
    return where ? `Saved to ${where}.` : "Couldn't save the video.";
  }
  const file = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  // Phones: the share sheet has "Save Video"; computers: a normal download.
  if (touch && file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'Video ready.'; } catch (e) { if (e && e.name === 'AbortError') return ''; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.hidden = true;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'Video saved to your downloads.';
}

/** Shares the video: the phone's share sheet with the file (app: saved first, then the sheet), else a download. */
export async function shareVideo(blob, name) {
  if (isApp) {
    const where = await saveFile(blob, name);
    if (!where) return "Couldn't save the video.";
    return shareSaved() ? `Saved to ${where}.` : `Saved to ${where}, but sharing didn't open.`;
  }
  const file = typeof File === 'function' ? new File([blob], name, { type: blob.type }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text: 'My Fenceline timelapse' }); return 'Shared.'; } catch (e) { if (e && e.name === 'AbortError') return ''; }
  }
  return saveVideo(blob, name);
}
