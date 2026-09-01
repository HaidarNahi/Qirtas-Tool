/**
 * قِرطاس — receiver for app ratings.
 *
 * Appends one row per rating to a sheet named "Ratings". It only ever receives
 * what the teacher typed into the rating form: a score, an optional comment,
 * and a coarse platform string. No exam content is sent by the app, so none can
 * arrive here.
 *
 * Setup is in README-SETUP.md next to this file.
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
  var lock = LockService.getScriptLock()
  try {
    // Serialise appends so two ratings arriving together cannot collide.
    lock.waitLock(20000)

    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: 'empty body' })
    }

    var data = JSON.parse(e.postData.contents)
    var rating = Number(data.rating)
    if (!(rating >= 1 && rating <= 5)) {
      return jsonOut({ ok: false, error: 'rating must be 1-5' })
    }

    if (isFlooding()) {
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
    Logger.log('doPost failed: ' + err)
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
  return jsonOut({ ok: true, service: 'qirtas-ratings' })
}

/** Rolling per-minute counter kept in the script cache. */
function isFlooding() {
  var cache = CacheService.getScriptCache()
  var key = 'rate-' + Math.floor(Date.now() / 60000)
  var count = Number(cache.get(key) || 0) + 1
  cache.put(key, String(count), 120)
  return count > MAX_PER_MINUTE
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
