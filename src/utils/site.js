// One origin, always.
//
// The Netlify alias (fancy-heliotrope-5cae85.netlify.app) serves the identical
// build, but a browser treats it as a different origin: its own localStorage, its
// own supabase session, its own service worker. A confirmation link pointing there
// signs the new user in somewhere boomlog.app cannot see, and their farm looks
// empty when they later type the real address. netlify.toml 301s that host; this
// is the other half — the address we hand to supabase for auth links.
export const SITE_URL = "https://boomlog.app";

// Dev servers and phones on the LAN keep their own origin, or auth links would
// bounce testers to production mid-test.
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/;
const LAN_HOST   = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;

export function authRedirectTo() {
  const h = window.location.hostname;
  if (LOCAL_HOST.test(h) || LAN_HOST.test(h)) return window.location.origin;
  return SITE_URL;
}
