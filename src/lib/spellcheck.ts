import { GROQ_API_KEY, GROQ_ENDPOINT, GROQ_MODEL, SPELLCHECK_AVAILABLE, SPELLCHECK_PROXY } from './config'
import { findProfanity } from './profanity'
import { findWord } from './textmap'

/**
 * Arabic/English spelling check, through Groq — directly with a build-time key
 * when developing, or through the Apps Script proxy that holds the key when
 * deployed. See the note in lib/config.ts for why only one of those can ship.
 *
 * This is the one part of قِرطاس that sends what a teacher typed off the device,
 * so it is deliberately narrow: the text of a single field, nothing else — no
 * document, no header, no identifiers, no key that ties two fields together.
 * It only runs while the setting is on, and the privacy page says so plainly.
 *
 * Everything else here is about not being annoying. A checker that flags
 * correctly written Arabic is worse than no checker at all, so the prompt is
 * built around refusing to guess, and a failure never escalates: the network
 * falls away, the local obscenity list stays.
 */

export type IssueType = 'spelling' | 'profanity'

export interface Issue {
  /** Copied from the text exactly as written, so it can be found again. */
  word: string
  /** Empty for obscenities: those are framed and removed whole, never rewritten. */
  suggestion: string
  type: IssueType
}

/**
 * Only used when talking to Groq directly with a build-time key. Through the
 * proxy the instructions live in Code.gs instead, so that an endpoint whose URL
 * is public cannot be handed an arbitrary prompt — KEEP THE TWO IN SYNC.
 */
const SYSTEM_PROMPT = `You check spelling on school exam papers written in Arabic, English, or both. You reply with JSON only.

Shape: {"issues":[{"word":"...","suggestion":"...","type":"spelling"}]}

- "word" MUST be copied from the input character for character. Never normalise it. Include any attached Arabic prefix (و ف ب ك ل ال) exactly as written.
- "type" is "spelling" for a misspelling, or "profanity" for an obscene, vulgar or insulting word.
- For "profanity", "suggestion" MUST be "".

In ARABIC these ARE misspellings and you SHOULD report them:
- a missing or wrong hamza: الايون → الأيون, اسئلة → أسئلة, ياتي → يأتي
- ه written where ة belongs at the end of a word: النبيله → النبيلة, الرابطه → الرابطة
- ي written where ى belongs, or ى where ي belongs, at the end of a word
- letters transposed, doubled or dropped

In ENGLISH report ordinary misspellings: studnet → student, quastion → question.

Report a spelling issue ONLY when the word is genuinely misspelled. When unsure, say nothing. Never report:
- proper nouns, place names, school names, or people's names
- chemical formulas, symbols, units, variables, or numbers
- abbreviations and acronyms
- missing tashkeel (the optional short-vowel marks) — their absence is normal and correct
- grammar, word choice, agreement, punctuation or spacing
- an English word inside Arabic text, or an Arabic word inside English text

If nothing is wrong, reply {"issues":[]}.`

/** Shorter than this is a mark or a number, not a sentence worth checking. */
const MIN_CHARS = 3
const REQUEST_TIMEOUT_MS = 12000
const CACHE_LIMIT = 80

/** After a failure, stop asking for a while rather than hammering a dead endpoint. */
const COOLDOWN_MS = 30000
const RATE_LIMIT_COOLDOWN_MS = 45000

/**
 * Groq's binding limit here is 8000 tokens per minute, not a request count, and
 * the system prompt alone is ~400 of them. One request per field burns the
 * whole budget on a single sheet, so requests go out one at a time and spaced —
 * and, far more importantly, a sweep asks about every changed field at once
 * (see `sweep`) instead of once per field.
 */
const MAX_CONCURRENT = 1
const MIN_GAP_MS = 4000

let active = 0
let lastStartedAt = 0
const waiting: (() => void)[] = []

async function acquireSlot() {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve))
  active++
  const gap = MIN_GAP_MS - (Date.now() - lastStartedAt)
  if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap))
  lastStartedAt = Date.now()
}

function releaseSlot() {
  active--
  waiting.shift()?.()
}

const cache = new Map<string, Issue[]>()
const inFlight = new Map<string, Promise<Issue[]>>()
let cooldownUntil = 0

function remember(key: string, issues: Issue[]) {
  cache.delete(key)
  cache.set(key, issues)
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

function localIssues(text: string): Issue[] {
  return findProfanity(text).map((word) => ({ word, suggestion: '', type: 'profanity' as const }))
}

function merge(a: Issue[], b: Issue[]): Issue[] {
  const seen = new Set<string>()
  const out: Issue[] = []
  for (const issue of [...a, ...b]) {
    const key = `${issue.type}:${issue.word}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(issue)
  }
  return out
}

/**
 * Sometimes the model puts the *corrected* spelling in `word`, so the pair comes
 * back as ("الرابطة", "الرابطة") and there is nothing in the text to underline.
 * The errors we ask it about are a short, known list — ة written as ه, a
 * dropped hamza, ى for ي — so the misspelling can be reconstructed by undoing
 * each of those on the suggestion and seeing which variant is really there.
 */
function recoverMisspelling(suggestion: string, text: string): string | null {
  const variants = [
    suggestion.replace(/ة/g, 'ه'),
    suggestion.replace(/[أإآ]/g, 'ا'),
    suggestion.replace(/ى/g, 'ي'),
    suggestion.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه'),
  ]
  for (const variant of variants) {
    if (variant !== suggestion && findWord(text, variant).length > 0) return variant
  }
  return null
}

/** The model is asked for JSON, but the parse is still defensive. */
function parseIssues(raw: unknown, text: string): Issue[] {
  if (typeof raw !== 'string') return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  const list = (parsed as { issues?: unknown })?.issues
  if (!Array.isArray(list)) return []

  const issues: Issue[] = []
  for (const entry of list.slice(0, 60)) {
    const word = (entry as Issue)?.word
    if (typeof word !== 'string' || !word.trim()) continue
    const type: IssueType = (entry as Issue)?.type === 'profanity' ? 'profanity' : 'spelling'
    const suggestion = typeof (entry as Issue)?.suggestion === 'string' ? (entry as Issue).suggestion.trim() : ''
    let target = word.trim()
    if (type === 'spelling') {
      if (!suggestion) continue
      if (suggestion === target) {
        // Either the model normalised the word, or it found nothing and said so
        // awkwardly. Recovering tells the two apart.
        const recovered = recoverMisspelling(suggestion, text)
        if (!recovered) continue
        target = recovered
      }
    }
    issues.push({ word: target, suggestion: type === 'profanity' ? '' : suggestion.slice(0, 80), type })
  }
  return issues
}

async function ask(text: string): Promise<Issue[]> {
  await acquireSlot()
  // The cooldown may have started while this request sat in the queue.
  if (Date.now() < cooldownUntil) {
    releaseSlot()
    return []
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = SPELLCHECK_PROXY
      ? // text/plain is CORS-safelisted, so the browser skips the preflight
        // that Apps Script never answers. Same trick as lib/rating.ts.
        await fetch(SPELLCHECK_PROXY, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ kind: 'spellcheck', text }),
          redirect: 'follow',
          signal: controller.signal,
        })
      : await fetch(GROQ_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0,
            reasoning_effort: 'low',
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: text },
            ],
          }),
          signal: controller.signal,
        })

    if (!response.ok) {
      cooldownUntil = Date.now() + (response.status === 429 ? RATE_LIMIT_COOLDOWN_MS : COOLDOWN_MS)
      return []
    }

    const data = await response.json()

    if (SPELLCHECK_PROXY) {
      // Apps Script answers 200 with its own error shape, so the status alone
      // proves nothing. A rate limit upstream is still a rate limit here.
      if (data?.ok !== true) {
        cooldownUntil = Date.now() + (data?.status === 429 ? RATE_LIMIT_COOLDOWN_MS : COOLDOWN_MS)
        return []
      }
      return parseIssues(data.content, text)
    }

    return parseIssues(data?.choices?.[0]?.message?.content, text)
  } catch {
    cooldownUntil = Date.now() + COOLDOWN_MS
    return []
  } finally {
    clearTimeout(timer)
    releaseSlot()
  }
}

/* --------------------------------------------------------------- sweeping */

/**
 * All the fields on screen, checked together.
 *
 * A per-field request was the obvious shape and the wrong one: ten fields meant
 * ten copies of the system prompt, which is most of a minute's token budget
 * before the teacher has typed anything. A sweep sends every field whose text
 * the cache has not already seen, in one request, and hands the whole issue
 * list back to every field — each one then finds the words that occur in its
 * own text, which is what it was doing anyway.
 */

const DEBOUNCE_MS = 1000
/** One sheet's worth. Past this the tail waits for the next sweep. */
const MAX_SWEEP_CHARS = 4000

interface Field {
  text: string
  notify: (issues: Issue[]) => void
}

const fields = new Map<string, Field>()
let timer: ReturnType<typeof setTimeout> | undefined

export function registerField(id: string, notify: (issues: Issue[]) => void): () => void {
  fields.set(id, { text: '', notify })
  return () => {
    fields.delete(id)
  }
}

export function updateField(id: string, text: string) {
  const field = fields.get(id)
  if (!field) return
  field.text = text.trim().slice(0, MAX_SWEEP_CHARS)
  clearTimeout(timer)
  timer = setTimeout(() => void sweep(), DEBOUNCE_MS)
}

/** Everything known about the texts currently on screen. */
function knownIssues(): Issue[] {
  const merged: Issue[] = []
  for (const field of fields.values()) {
    const cached = cache.get(field.text)
    if (cached) merged.push(...cached)
    else merged.push(...localIssues(field.text))
  }
  return merge(merged, [])
}

function broadcast() {
  const issues = knownIssues()
  for (const field of fields.values()) field.notify(issues)
}

async function sweep(): Promise<void> {
  const texts = [...new Set([...fields.values()].map((field) => field.text))].filter(
    (text) => text.length >= MIN_CHARS,
  )

  // Anything already answered costs nothing and is served from the cache.
  const unseen = texts.filter((text) => !cache.has(text))
  broadcast()
  if (unseen.length === 0) return

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false
  if (!SPELLCHECK_AVAILABLE || offline || Date.now() < cooldownUntil) return

  // Blank lines between fields: the model reads them as separate sentences and
  // does not try to make one thought out of two questions.
  const batch: string[] = []
  let budget = MAX_SWEEP_CHARS
  for (const text of unseen) {
    if (text.length > budget) break
    batch.push(text)
    budget -= text.length
  }
  if (batch.length === 0) return

  const combined = batch.join('\n\n')
  const pending = inFlight.get(combined)
  if (pending) {
    await pending
    broadcast()
    return
  }

  const request = ask(combined)
    .then((remote) => {
      // The answer covers the batch, so every text in it is now known. Each
      // field keeps only the issues whose words it actually contains, which is
      // decided later by findWord against that field's own text.
      for (const text of batch) remember(text, merge(remote, localIssues(text)))
      return remote
    })
    .catch(() => [] as Issue[])
    .finally(() => inFlight.delete(combined))

  inFlight.set(combined, request)
  await request
  broadcast()

  // A sheet longer than one batch leaves fields unasked. Without this they wait
  // for an edit that may never come — the teacher stops typing and the rest of
  // the paper is simply never checked.
  if (batch.length < unseen.length) {
    clearTimeout(timer)
    timer = setTimeout(() => void sweep(), DEBOUNCE_MS)
  }
}

/** Lets the settings panel say why the row is disabled. */
export const spellcheckConfigured = SPELLCHECK_AVAILABLE
