/**
 * قِرطاس — the app's one server-side piece.
 *
 * It does two unrelated jobs, told apart by `kind` on the POST body:
 *
 *  1. Ratings (no `kind`). Appends one row per rating to a sheet named
 *     "Ratings". It only ever receives what the teacher typed into the rating
 *     form: a score, an optional comment, and a coarse platform string. No exam
 *     content is sent by the app, so none can arrive here.
 *
 *  2. Spelling check (`kind: "spellcheck"`). Forwards one field's text to Groq
 *     and hands the answer back. This exists for one reason: the app is
 *     client-side, so a Groq key given to it at build time is readable by
 *     anyone who opens devtools on the deployed site. Here the key sits in
 *     Script Properties and never reaches the browser. Nothing is stored, and
 *     nothing is written to the spreadsheet — the text passes through.
 *
 * Setup for both is in README-SETUP.md next to this file.
 */

/**
 * Which spreadsheet to write to. The id is the long string in the URL:
 *   docs.google.com/spreadsheets/d/THIS_PART/edit
 *
 * When this is set it WINS, even if the script is bound to a spreadsheet.
 * That is deliberate: a bound script silently ignoring the id you typed here
 * is how ratings end up in a file you are not looking at. Leave it empty only
 * if the script is bound and you want the file it is bound to.
 *
 * Run `whereAmI` from the editor to see which file actually receives rows.
 */
var SPREADSHEET_ID = '11EhvxLyjYbtw19pQ9SorrIzUpWWrOfTdmZlroFLlrcg'

var SHEET_NAME = 'Ratings'
var HEADERS = ['التاريخ', 'التقييم', 'الملاحظة', 'المنصة', 'الإصدار', 'المعرّف']
var MAX_COMMENT = 2000

/**
 * The app is client-side, so this endpoint's URL is public no matter where it
 * is stored. These caps are what actually keep it from being abused: a ceiling
 * on how many rows can land in one minute, and a hard limit on row count.
 */
var MAX_PER_MINUTE = 20
var MAX_ROWS = 50000

/** Handles the POST the app sends (Content-Type: text/plain). */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return jsonOut({ ok: false, error: 'empty body' })
  }

  var data
  try {
    data = JSON.parse(e.postData.contents)
  } catch (err) {
    return jsonOut({ ok: false, error: 'bad json' })
  }

  // The spelling check takes no lock and touches no sheet, so it must not go
  // through the rating path — it would serialise every keystroke behind it.
  if (data && data.kind === 'spellcheck') return handleSpellcheck(data)
  return handleRating(data)
}

function handleRating(data) {
  var lock = LockService.getScriptLock()
  try {
    // Serialise appends so two ratings arriving together cannot collide.
    lock.waitLock(20000)

    var rating = Number(data.rating)
    if (!(rating >= 1 && rating <= 5)) {
      return jsonOut({ ok: false, error: 'rating must be 1-5' })
    }

    if (isFlooding('rate', MAX_PER_MINUTE)) {
      return jsonOut({ ok: false, error: 'rate limited' })
    }

    var sheet = getSheet()
    if (sheet.getLastRow() > MAX_ROWS) {
      return jsonOut({ ok: false, error: 'sheet full' })
    }

    var id = String(data.id || '')

    // The app retries queued ratings after being offline, and a no-cors send
    // cannot be confirmed — so the same id may legitimately arrive twice.
    if (id && idExists(sheet, id)) {
      return jsonOut({ ok: true, duplicate: true })
    }

    sheet.appendRow([
      data.sentAt ? new Date(data.sentAt) : new Date(),
      rating,
      String(data.comment || '').slice(0, MAX_COMMENT),
      String(data.platform || ''),
      String(data.version || ''),
      id,
    ])
    rememberId(id)

    return jsonOut({ ok: true })
  } catch (err) {
    // The /exec URL is public, so the detail goes to the execution log and the
    // caller gets a bare failure.
    Logger.log('handleRating failed: ' + err)
    return jsonOut({ ok: false, error: 'could not record rating' })
  } finally {
    try {
      lock.releaseLock()
    } catch (ignored) {}
  }
}

/**
 * Run this once from the editor before deploying.
 *
 * It does three useful things: triggers the Google authorization prompt (a
 * deployment made before the script touched Sheets has no permission to write),
 * creates the Ratings tab with its headers, and prints the spreadsheet name so
 * you can confirm it reached the file you meant.
 */
function setup() {
  var sheet = getSheet()
  Logger.log(describeTarget(sheet))
  return sheet.getParent().getName()
}

/** Appends one obviously-labelled row, to prove the whole path works. */
function testAppend() {
  var result = doPost({
    postData: {
      contents: JSON.stringify({
        id: 'setup-test-' + Date.now(),
        rating: 5,
        comment: 'صف تجريبي من setup — يمكن حذفه',
        sentAt: new Date().toISOString(),
        platform: 'editor',
        version: 'test',
      }),
    },
  })
  Logger.log(result.getContent())
}

/**
 * Run this from the editor when ratings are "missing".
 *
 * They are almost never lost — they are in a spreadsheet or a tab other than
 * the one being watched. This prints the exact file, its URL, the tab, and how
 * many ratings it holds, so the answer takes one click instead of guesswork.
 *
 * It is deliberately not exposed through doGet: the /exec URL is public, and
 * the name and link of the file are not.
 */
function whereAmI() {
  var sheet = getSheet()
  Logger.log(describeTarget(sheet))
  return sheet.getParent().getUrl()
}

/** Shared by setup and whereAmI so both report the same thing. */
function describeTarget(sheet) {
  var file = sheet.getParent()
  var ratings = Math.max(0, sheet.getLastRow() - 1)
  return [
    'Source     : ' + (SPREADSHEET_ID ? 'SPREADSHEET_ID' : 'bound spreadsheet'),
    'File       : ' + file.getName(),
    'File id    : ' + file.getId(),
    // #gid= targets the tab itself. Without it the link opens whichever sheet
    // is first, which is not the one being written to — the rows look missing
    // while sitting one tab away.
    'URL        : ' + file.getUrl() + '#gid=' + sheet.getSheetId(),
    'Tab        : ' + sheet.getName() + ' (gid ' + sheet.getSheetId() + ')',
    'Ratings    : ' + ratings,
  ].join('\n')
}

/** Opening the /exec URL in a browser should say something reassuring. */
function doGet() {
  return jsonOut({ ok: true, service: 'qirtas' })
}

/* ======================================================== spelling check */

/**
 * The key lives in Script Properties, never in this file and never in the app.
 *
 * Set it once, from the Apps Script editor:
 *   Project Settings → Script Properties → Add
 *   Property: GROQ_API_KEY      Value: gsk_...
 *
 * With no property set the endpoint answers "not configured" and the app
 * quietly turns the feature off — exactly as it does with no key at all.
 */
var GROQ_KEY_PROPERTY = 'GROQ_API_KEY'
var GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
var GROQ_MODEL = 'openai/gpt-oss-20b'

/** One sheet's worth of text. The app batches a whole sweep into one request. */
var SPELLCHECK_MAX_CHARS = 4000

/**
 * Groq's free tier is a token budget per minute, shared by every user of the
 * deployment — so this ceiling is what stops one open tab from spending the
 * whole school's allowance. Well above what one teacher can type, well below
 * what a script can.
 */
var SPELLCHECK_MAX_PER_MINUTE = 60
var SPELLCHECK_TIMEOUT_MS = 20000

/**
 * The instructions live here rather than in the request.
 *
 * A proxy that forwards whatever prompt it is handed is a free LLM for anyone
 * who finds the URL. This one only ever asks the one question the app exists to
 * ask, so the worst an abuser gets is their spelling checked.
 *
 * KEEP IN SYNC with SYSTEM_PROMPT in src/lib/spellcheck.ts, which is the same
 * text used when the app talks to Groq directly with a build-time key.
 */
var SYSTEM_PROMPT = [
  'You check spelling on school exam papers written in Arabic, English, or both. You reply with JSON only.',
  '',
  'Shape: {"issues":[{"word":"...","suggestion":"...","type":"spelling"}]}',
  '',
  '- "word" MUST be copied from the input character for character. Never normalise it. Include any attached Arabic prefix (و ف ب ك ل ال) exactly as written.',
  '- "type" is "spelling" for a misspelling, or "profanity" for an obscene, vulgar or insulting word.',
  '- For "profanity", "suggestion" MUST be "".',
  '',
  'In ARABIC these ARE misspellings and you SHOULD report them:',
  '- a missing or wrong hamza: الايون → الأيون, اسئلة → أسئلة, ياتي → يأتي',
  '- ه written where ة belongs at the end of a word: النبيله → النبيلة, الرابطه → الرابطة',
  '- ي written where ى belongs, or ى where ي belongs, at the end of a word',
  '- letters transposed, doubled or dropped',
  '',
  'In ENGLISH report ordinary misspellings: studnet → student, quastion → question.',
  '',
  'Report a spelling issue ONLY when the word is genuinely misspelled. When unsure, say nothing. Never report:',
  '- proper nouns, place names, school names, or people\'s names',
  '- chemical formulas, symbols, units, variables, or numbers',
  '- abbreviations and acronyms',
  '- missing tashkeel (the optional short-vowel marks) — their absence is normal and correct',
  '- grammar, word choice, agreement, punctuation or spacing',
  '- an English word inside Arabic text, or an Arabic word inside English text',
  '',
  'If nothing is wrong, reply {"issues":[]}.',
].join('\n')

/**
 * Forwards one field's text to Groq and hands back the raw JSON string.
 *
 * Nothing is logged and nothing is stored: the text arrives, goes to Groq, and
 * the answer goes back. That is the whole point of the hop — it exists so the
 * key does not have to ship inside the app, not to collect anything.
 */
function handleSpellcheck(data) {
  var key = PropertiesService.getScriptProperties().getProperty(GROQ_KEY_PROPERTY)
  if (!key) return jsonOut({ ok: false, error: 'spellcheck not configured' })

  var text = String(data.text || '').slice(0, SPELLCHECK_MAX_CHARS)
  if (!text.trim()) return jsonOut({ ok: false, error: 'empty text' })

  if (isFlooding('spell', SPELLCHECK_MAX_PER_MINUTE)) {
    return jsonOut({ ok: false, error: 'rate limited' })
  }

  try {
    var response = UrlFetchApp.fetch(GROQ_ENDPOINT, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + key },
      payload: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
      muteHttpExceptions: true,
      validateHttpsCertificates: true,
      followRedirects: true,
      timeout: SPELLCHECK_TIMEOUT_MS,
    })

    var status = response.getResponseCode()
    if (status !== 200) {
      // The app backs off on its own; 429 makes it back off for longer.
      return jsonOut({ ok: false, error: 'upstream ' + status, status: status })
    }

    var body = JSON.parse(response.getContentText())
    var content =
      body && body.choices && body.choices[0] && body.choices[0].message
        ? body.choices[0].message.content
        : ''

    return jsonOut({ ok: true, content: String(content || '') })
  } catch (err) {
    Logger.log('handleSpellcheck failed: ' + err)
    return jsonOut({ ok: false, error: 'upstream failed' })
  }
}

/** Run this from the editor to check the key and the whole path in one go. */
function testSpellcheck() {
  var result = handleSpellcheck({ kind: 'spellcheck', text: 'اكتب الرابطه الايونيه. the studnet is here.' })
  Logger.log(result.getContent())
}

/**
 * Rolling per-minute counter kept in the script cache.
 *
 * One bucket per job: a burst of spelling checks must not lock out ratings,
 * and the two have very different natural rates.
 */
function isFlooding(bucket, limit) {
  var cache = CacheService.getScriptCache()
  var key = bucket + '-' + Math.floor(Date.now() / 60000)
  var count = Number(cache.get(key) || 0) + 1
  cache.put(key, String(count), 120)
  return count > limit
}

/**
 * Works both bound to a sheet and standalone.
 *
 * An explicit SPREADSHEET_ID is authoritative. The previous order asked for
 * the active spreadsheet first, which meant a script bound to some other file
 * kept writing there and quietly discarded the id set above — rows landed in
 * one spreadsheet while the id pointed at another.
 */
function getSpreadsheet() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID)
  var active = SpreadsheetApp.getActiveSpreadsheet()
  if (active) return active
  throw new Error(
    'This script is standalone, so SPREADSHEET_ID must be set to the id in your spreadsheet URL.',
  )
}

function getSheet() {
  var ss = getSpreadsheet()
  var sheet = ss.getSheetByName(SHEET_NAME)
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME)
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS)
    sheet.setFrozenRows(1)
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold')
    sheet.setColumnWidth(3, 420)
  }
  return sheet
}

/**
 * The app retries a rating whose delivery it could not confirm — a queued send
 * after being offline, or a no-cors attempt that may well have landed — so the
 * same id legitimately arrives twice and must not become two rows.
 *
 * The cache answers the common case, which is a retry minutes later, without
 * touching the sheet at all. Behind it the lookup covers the WHOLE column,
 * because a retry can also arrive days later: a window of recent rows would
 * miss the original and write the duplicate this exists to prevent.
 *
 * It is a TextFinder rather than getValues() so that "whole column" does not
 * mean pulling fifty thousand cells into memory on every POST while holding the
 * script lock. The search runs on the server and returns a single hit.
 */
var SEEN_TTL_SECONDS = 21600 // 6 hours

function idExists(sheet, id) {
  if (!id) return false

  var cache = CacheService.getScriptCache()
  if (cache.get('seen-' + id)) return true

  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return false

  var column = HEADERS.indexOf('المعرّف') + 1
  var hit = sheet
    .getRange(2, column, lastRow - 1, 1)
    .createTextFinder(id)
    .matchEntireCell(true)
    .matchCase(true)
    .findNext()

  if (hit) rememberId(id)
  return hit !== null
}

/** Remembers an id so its retry is recognised without touching the sheet. */
function rememberId(id) {
  if (!id) return
  try {
    CacheService.getScriptCache().put('seen-' + id, '1', SEEN_TTL_SECONDS)
  } catch (ignored) {}
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
