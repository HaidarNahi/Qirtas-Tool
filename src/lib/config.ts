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
 * │  SPELLING CHECK — Groq Cloud, one of two ways.                           │
 * │                                                                          │
 * │  THE PROXY (VITE_SPELLCHECK_PROXY) is the one to deploy with. It is the  │
 * │  same Apps Script Web App the ratings already use; the Groq key sits in  │
 * │  its Script Properties, and the browser never sees it. Point this at the │
 * │  /exec URL and the feature is safe to ship publicly.                     │
 * │                                                                          │
 * │  THE DIRECT KEY (VITE_GROQ_API_KEY) is for local work only. Be           │
 * │  clear-eyed about it: the app is client-side, so whatever key is present │
 * │  at BUILD time is readable by anyone who opens devtools on the deployed  │
 * │  site. `.env` keeps it out of version control and nothing more — it is   │
 * │  not a way to ship the feature, which is what the proxy is for. There is │
 * │  deliberately no fallback key baked in here: a key committed to the repo │
 * │  is a key on GitHub.                                                     │
 * │                                                                          │
 * │  With neither set the feature disables itself: no requests, and the      │
 * │  settings row says why.                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const GROQ_API_KEY: string = (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim() ?? ''

/** Apps Script /exec URL that holds the key. Wins over the direct key. */
export const SPELLCHECK_PROXY: string =
  (import.meta.env.VITE_SPELLCHECK_PROXY as string | undefined)?.trim() ?? ''

export const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'

/**
 * Picked by measurement, not by reputation: on a mixed Arabic/English exam
 * paper it caught every planted error in both scripts, flagged nothing in a
 * correctly written one, and answers in well under a second.
 */
export const GROQ_MODEL: string =
  (import.meta.env.VITE_GROQ_MODEL as string | undefined)?.trim() || 'openai/gpt-oss-20b'

/** The check is only offered when there is somewhere to send the request. */
export const SPELLCHECK_AVAILABLE = SPELLCHECK_PROXY.length > 0 || GROQ_API_KEY.length > 0
