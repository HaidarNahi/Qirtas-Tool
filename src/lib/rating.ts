import { APP_VERSION, RATING_ENDPOINT } from './config'

/**
 * Sends a rating to a Google Apps Script Web App.
 *
 * Two things make this work where a naive fetch would not:
 *
 *  1. The body is sent as `text/plain`. That is a CORS-safelisted content type,
 *     so the browser skips the preflight OPTIONS request — which matters
 *     because Apps Script web apps do not answer OPTIONS at all. Sending
 *     `application/json` would trigger a preflight and fail every time.
 *  2. Apps Script answers /exec with a 302 to googleusercontent.com. fetch
 *     follows that automatically, and because the request is simple, the CORS
 *     check passes on both hops.
 *
 * If anything still goes wrong we retry once with `mode: 'no-cors'`, which
 * cannot read a response but does put the request on the wire, and failing
 * that the rating waits in a queue until the device is back online.
 */

const QUEUE_KEY = 'qirtas:rating-queue:v1'
const REQUEST_TIMEOUT_MS = 12000

export interface Rating {
  id: string
  rating: number
  comment: string
  sentAt: string
  platform: string
  version: string
}

export type SendResult = 'sent' | 'queued'

export function buildRating(rating: number, comment: string): Rating {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    rating,
    comment: comment.trim().slice(0, 2000),
    sentAt: new Date().toISOString(),
    platform: describePlatform(),
    version: APP_VERSION,
  }
}

/** Coarse device description only — never anything that identifies a person. */
function describePlatform(): string {
  const ua = navigator.userAgent
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Other'
  const browser = /EdgA?\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Other'
  return `${os} · ${browser}`
}

function readQueue(): Rating[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.slice(-20) : []
  } catch {
    return []
  }
}

function writeQueue(items: Rating[]) {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-20)))
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Returns true only when the server actually confirmed the row.
 *
 * `mode: 'no-cors'` is still fired as a side attempt, because a CORS failure
 * does not mean the server ignored the request — but its response is opaque,
 * so it can never be used as proof. Treating it as proof is exactly how a
 * misconfigured deployment ends up thanking the teacher for a rating that was
 * never recorded. Anything unconfirmed goes to the queue instead, and Code.gs
 * de-duplicates by id so a later retry cannot double-count.
 */
async function post(rating: Rating): Promise<boolean> {
  if (!RATING_ENDPOINT) return false

  const body = JSON.stringify(rating)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(RATING_ENDPOINT, {
      method: 'POST',
      // Safelisted content type => no preflight => Apps Script accepts it.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      signal: controller.signal,
    })

    if (response.ok) {
      const text = await response.text()
      try {
        const data = JSON.parse(text)
        return data?.ok === true
      } catch {
        // Apps Script answers with its own HTML page, still on HTTP 200, when
        // doPost is missing or the deployment is not public.
        return false
      }
    }
    return false
  } catch {
    // Network-level failure: offline, DNS, or a CORS check we cannot inspect.
    void blindSend(body)
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Best effort only; the result is unknowable by design. */
function blindSend(body: string) {
  try {
    void fetch(RATING_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    }).catch(() => {})
  } catch {
    /* ignore */
  }
}

export async function submitRating(rating: Rating): Promise<SendResult> {
  const ok = await post(rating)
  if (ok) return 'sent'
  writeQueue([...readQueue(), rating])
  return 'queued'
}

/** Retries anything that was written while the device was offline. */
export async function flushRatingQueue(): Promise<void> {
  const queue = readQueue()
  if (queue.length === 0 || !RATING_ENDPOINT) return

  const remaining: Rating[] = []
  for (const item of queue) {
    const ok = await post(item)
    if (!ok) remaining.push(item)
  }
  writeQueue(remaining)
}

export function hasQueuedRatings(): boolean {
  return readQueue().length > 0
}
