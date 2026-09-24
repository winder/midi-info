// Google Analytics (GA4). Loads gtag.js at runtime so index.html stays free of
// inline JS. Only the public GitHub Pages host reports; the local dev server
// and the e2e harness never load the tag.
//
// Beyond the automatic page_view, the app reports a small usage funnel plus a
// settings snapshot. Event names show up in GA4 on their own; event params
// and user properties only appear in reports once registered under
// Admin > Custom definitions.
//
// Events (params):
//   midi_unsupported                       browser has no Web MIDI API
//   midi_access (result)                   'granted' | 'denied'
//   midi_device_connected (device_count)   first time an input shows up
//   first_midi_note                        first key played from a MIDI device
//   first_mouse_note                       first key clicked on the on-screen piano
//   level_changed (level)                  basic | intermediate | nerd
//   theme_selected (theme)
// User properties (the persisted settings, refreshed whenever one is saved):
//   level, theme, visible_keys, display_off, chords_custom

// GA4 measurement ID (Admin > Data streams > Web, e.g. 'G-XXXXXXXXXX').
// Baked in at build time from the GA_MEASUREMENT_ID env var via esbuild
// --define (see package.json); CI sets it from the GitHub Actions repository
// variable of the same name. Empty (the local default) disables analytics.
// The typeof guard keeps the module importable under node:test, where no
// bundler has replaced the identifier.
declare const __GA_MEASUREMENT_ID__: string;
export const GA_MEASUREMENT_ID: string = typeof __GA_MEASUREMENT_ID__ === 'string' ? __GA_MEASUREMENT_ID__ : '';

const TRACKED_HOSTS = ['winder.github.io'];

// GA4 limits: param values 100 chars, user property values 36 chars, and
// events are dropped past ~500 per session. Playing a keyboard fires many
// note-ons a second, so nothing note-driven is ever sent per note: funnel
// steps go through once(), and the tracker caps the total regardless.
export const MAX_PARAM_VALUE_LENGTH = 100;
export const MAX_USER_PROPERTY_LENGTH = 36;
export const MAX_EVENTS_PER_SESSION = 400;

export type Params = Record<string, string | number>;
export type Gtag = (...args: unknown[]) => void;

export interface Tracker {
  // Sends an event, subject to the per-session cap.
  event(name: string, params?: Params): void;
  // Sends an event at most once per page load, regardless of params.
  once(name: string, params?: Params): void;
  // Replaces the given user properties. Not an event, so uncapped.
  setUserProperties(props: Params): void;
}

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: Gtag;
  }
}

export function shouldTrack(hostname: string, measurementId: string = GA_MEASUREMENT_ID): boolean {
  return measurementId !== '' && TRACKED_HOSTS.includes(hostname);
}

export function clampValues(params: Params, maxLength: number): Params {
  const out: Params = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = typeof value === 'string' && value.length > maxLength ? value.slice(0, maxLength) : value;
  }
  return out;
}

export function createTracker(gtag: Gtag): Tracker {
  const fired = new Set<string>();
  let sent = 0;
  function event(name: string, params: Params = {}): void {
    if (sent >= MAX_EVENTS_PER_SESSION) return;
    sent++;
    gtag('event', name, clampValues(params, MAX_PARAM_VALUE_LENGTH));
  }
  return {
    event,
    once(name, params) {
      if (fired.has(name)) return;
      fired.add(name);
      event(name, params);
    },
    setUserProperties(props) {
      gtag('set', 'user_properties', clampValues(props, MAX_USER_PROPERTY_LENGTH));
    },
  };
}

const NOOP_TRACKER: Tracker = {
  event() {},
  once() {},
  setUserProperties() {},
};

let tracker: Tracker = NOOP_TRACKER;

// The active tracker: a no-op until initAnalytics() decides this host
// reports, so callers never need to check.
export function analytics(): Tracker {
  return tracker;
}

// userProperties ride along on the config call so the initial page_view
// already carries the settings snapshot.
export function initAnalytics(userProperties: Params = {}): void {
  if (!shouldTrack(window.location.hostname)) return;

  window.dataLayer = window.dataLayer || [];
  // Must push the real `arguments` object, exactly like Google's snippet:
  // gtag.js only processes dataLayer entries that are Arguments objects and
  // silently ignores plain arrays, so a rest-parameter version loads the tag
  // but never sends a single hit.
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    user_properties: clampValues(userProperties, MAX_USER_PROPERTY_LENGTH),
    // gtag's default 'auto' cookie domain probes from the top down and
    // first tries github.io, a public-suffix domain every browser rejects.
    // Firefox logs each attempt as a console error. Naming the host skips
    // the probing; the cookie ends up on the same domain either way.
    cookie_domain: window.location.hostname,
  });
  tracker = createTracker(window.gtag);

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}
