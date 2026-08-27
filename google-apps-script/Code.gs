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

    return jsonOut({ ok: true })
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) })
  } finally {
    try {
      lock.releaseLock()
    } catch (ignored) {}
  }
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

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
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

function idExists(sheet, id) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return false
  var column = HEADERS.indexOf('المعرّف') + 1
  var values = sheet.getRange(2, column, lastRow - 1, 1).getValues()
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) return true
  }
  return false
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  )
}
