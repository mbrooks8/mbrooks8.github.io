// A web page opened from a share or invite link on an Android phone: open the Fenceline app instead when it is installed.
// Android only opens the app by itself when the site's assetlinks.json lists the key the installed app is signed with
// and the phone has checked it; links tapped inside some apps' own browsers never do. So the page tries once by itself
// (an intent: link names the app, com.fenceline.app, directly, and falls back to this page when the app is missing),
// and also shows an "Open in the app" strip, which always works because it is a real tap.
import { el, sk } from './ui.js';
import { isApp } from './native.js';

const TRIED = 'fenceline.triedApp';

/** The intent: link that opens [url] (an https link on our site) in the Android app, falling back to the page itself. */
export function appIntentUrl(url) {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.fenceline.app;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
}

/**
 * Tries to open [url] in the app once per link per tab. When the app is missing, the browser comes back to the same
 * link (the fallback), and the mark in sessionStorage stops it trying again. No storage means no try, so it can't loop.
 * Not inside other apps' web views ("; wv)"): they can't follow intent: links and show an error page instead.
 */
export function tryApp(url, { ua = navigator.userAgent, go = (href) => location.assign(href) } = {}) {
  if (isApp || !url || !/Android/i.test(ua) || /; wv\)/.test(ua)) return false;
  try {
    if (sessionStorage.getItem(TRIED) === url) return false;
    sessionStorage.setItem(TRIED, url);
  } catch (e) { return false; }
  go(appIntentUrl(url));
  return true;
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
