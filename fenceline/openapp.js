// A web page opened from a share or invite link on an Android phone: offer to open the Fenceline app instead.
// Android only opens the app by itself when the site's assetlinks.json lists the key the installed app is signed with;
// this button works either way, because an intent: link names the app (com.fenceline.app) directly.
import { el, sk } from './ui.js';
import { isApp } from './native.js';

/** The intent: link that opens [url] (an https link on our site) in the Android app, falling back to the page itself. */
export function appIntentUrl(url) {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.fenceline.app;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
}

/** Shows a small "Open in the app" strip when [url] came from a link on Android Chrome. Returns the strip, or null. */
export function offerApp(url, { android = /Android/i.test(navigator.userAgent) } = {}) {
  if (isApp || !android || !url) return null;
  const bar = sk(el('div', { class: 'note float openapp' },
    el('a', { href: appIntentUrl(url), class: 'openapp-go', text: 'Open in the Fenceline app' }),
    el('button', { type: 'button', class: 'openapp-x', 'aria-label': 'Close', text: '×', onclick: () => bar.remove() })), { kind: 'box' });
  document.body.append(bar);
  return bar;
}
