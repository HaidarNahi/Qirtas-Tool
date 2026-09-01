/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  RATING ENDPOINT — paste your Google Apps Script Web App URL here.       │
 * │                                                                          │
 * │  Follow the steps in google-apps-script/README-SETUP.md, then replace    │
 * │  the empty string below with the /exec URL you get when you deploy.      │
 * │  It looks like:                                                          │
 * │    https://script.google.com/macros/s/AKfycb..../exec                    │
 * │                                                                          │
 * │  While it is empty the rating feature simply stays hidden — nothing      │
 * │  breaks, and no requests leave the device.                               │
 * │                                                                          │
 * │  This URL is not a secret: the app is client-side, so it ships inside    │
 * │  the JS bundle either way. Code.gs is what keeps it from being abused.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
const HARDCODED_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbyNU-N8WNjIPi9Krehi7C3Jp-ZSHMWqC4Y4VMpzshwMG8wMy3sBPRFj3p07p3Slh7cX/exec'

/** A .env value wins, so the URL can stay out of the source if preferred. */
export const RATING_ENDPOINT: string =
  (import.meta.env.VITE_RATING_ENDPOINT as string | undefined)?.trim() || HARDCODED_ENDPOINT

export const RATING_ENABLED = RATING_ENDPOINT.length > 0

export const APP_VERSION = '1.0.0'

/** Who built and owns قِرطاس. Shown in الإعدادات and in the document metadata. */
export const DEVELOPER = 'Asas Thaki'
export const DEVELOPER_URL = 'https://asasthaki.dev/'
export const COPYRIGHT_YEAR = '2026'

/**
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  SPELLING CHECK — Groq Cloud.                                            │
 * │                                                                          │
 * │  The key comes from `.env` (gitignored) as VITE_GROQ_API_KEY. There is   │
 * │  deliberately no fallback baked in here: a key committed to the repo is  │
 * │  a key on GitHub.                                                        │
 * │                                                                          │
 * │  Be clear-eyed about what this can and cannot protect. The app is        │
 * │  client-side, so whatever key is present at BUILD time is readable by    │
 * │  anyone who opens devtools on the deployed site — `.env` keeps it out    │
 * │  of version control, nothing more. The only real fix is a small proxy    │
 * │  that holds the key server-side and forwards the request.                │
 * │                                                                          │
 * │  With no key the feature disables itself: no requests, and the settings  │
 * │  row says why.                                                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const GROQ_API_KEY: string = (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim() ?? ''

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Picked by measurement, not by reputation: on a mixed Arabic/English exam
 * paper it caught every planted error in both scripts, flagged nothing in a
 * correctly written one, and answers in well under a second.
 */
export const GROQ_MODEL: string =
  (import.meta.env.VITE_GROQ_MODEL as string | undefined)?.trim() || 'openai/gpt-oss-20b'

/** The check is only offered when a key was present at build time. */
export const SPELLCHECK_AVAILABLE = GROQ_API_KEY.length > 0
