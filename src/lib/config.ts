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
