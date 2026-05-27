// PostHog client for Punchlister.
// Behaves as a no-op when VITE_POSTHOG_KEY isn't set, so local dev and
// preview environments without analytics don't break or send junk events.
//
// Config:
//   VITE_POSTHOG_KEY  — project API key from PostHog (Settings → Project)
//   VITE_POSTHOG_HOST — defaults to https://eu.i.posthog.com (EU cloud,
//                       picked because the app is for Belgian construction).
//                       Override with https://us.i.posthog.com for US cloud.

import posthog from 'posthog-js';

const KEY  = import.meta.env.VITE_POSTHOG_KEY;
// Route all ingestion through our own /ingest path (Vercel rewrites it to
// PostHog). This dodges adblock lists that target eu.i.posthog.com directly.
// VITE_POSTHOG_HOST is still honored if you want to override (e.g. localhost
// dev pointing straight at PostHog).
const HOST    = import.meta.env.VITE_POSTHOG_HOST || '/ingest';
const UI_HOST = import.meta.env.VITE_POSTHOG_UI_HOST || 'https://eu.posthog.com';

let initialized = false;

export function initPostHog() {
  if (initialized || !KEY || typeof window === 'undefined') return;
  posthog.init(KEY, {
    api_host:                HOST,
    ui_host:                 UI_HOST,
    // Auto-capture pageviews on history changes (SPA navigation)
    capture_pageview:        'history_change',
    capture_pageleave:       true,
    // Don't capture sensitive form fields. Adds the data-attr opt-out hook too.
    autocapture: {
      dom_event_allowlist:  ['click', 'change', 'submit'],
      css_selector_allowlist: undefined,
      element_allowlist:    ['button', 'a', 'input', 'select', 'textarea', 'label', 'form'],
    },
    // Mask passwords + any input flagged with .ph-no-capture or data-ph-mask
    mask_all_text:           false,
    mask_all_element_attributes: false,
    // Session replay — enable from PostHog UI per environment if you want it
    disable_session_recording: true,
  });
  initialized = true;
}

// Tie events to the Supabase user. Call this after auth state resolves.
export function identifyUser(user) {
  if (!initialized || !user) return;
  posthog.identify(user.id, {
    email: user.email,
    // user_metadata may contain full_name etc.
    name:  user.user_metadata?.full_name ?? null,
  });
}

// Clear identity on sign-out so the next session starts anonymous.
export function resetUser() {
  if (!initialized) return;
  posthog.reset();
}

// Optional: thin custom-event wrapper for the few moments worth instrumenting
// by name (project created, field log submitted, RFI sent, etc.). Safe to
// call even when not initialized — becomes a no-op.
export function track(event, props = {}) {
  if (!initialized) return;
  posthog.capture(event, props);
}

export default posthog;
