# Receiving ratings in a Google Sheet

Ten minutes, once. Until you finish it the rating feature stays hidden in the
app and nothing is ever sent anywhere.

## 1. Make the sheet

1. Go to <https://sheets.new> and give the spreadsheet a name, e.g. *قِرطاس —
   التقييمات*.

## 2. Add the script

There are two ways to attach a script, and they behave differently.

**Bound (simplest):** in the spreadsheet, choose **Extensions → Apps Script**.
The script belongs to that sheet, and `SPREADSHEET_ID` in `Code.gs` can stay
empty.

**Standalone:** a project created from <https://script.google.com>. Its URL
looks like `script.google.com/u/0/home/projects/…`. A standalone script has no
"active" spreadsheet, so you must set `SPREADSHEET_ID` near the top of
`Code.gs` to the long id in your spreadsheet URL:

```
docs.google.com/spreadsheets/d/THIS_PART_IS_THE_ID/edit
```

Setting `SPREADSHEET_ID` is safe either way: when it is filled in it wins, even
for a bound script. Filling it in is the reliable choice, because it is the one
case where the file receiving your ratings is stated in the source rather than
inherited from how the project happened to be created.

Either way:

1. Delete everything in `Code.gs` — including the default
   `function myFunction() {}` — and paste the whole contents of the `Code.gs`
   next to this file.
2. Save (the disk icon).

## 2b. Run `setup` once, before deploying

1. In the function dropdown next to **Debug**, pick **`setup`**, then **Run**.
2. Google asks for authorization the first time. Accept it. It will warn that
   the app is unverified — that is normal for your own script; choose
   *Advanced → Go to … (unsafe)*.
3. The execution log should print `Connected to: <your spreadsheet name>`, and a
   **Ratings** tab appears in the sheet with its headers.

This step matters: a deployment created while the script was still empty has no
permission to touch Sheets, and will keep failing until you authorize it.

Optionally run **`testAppend`** too — it writes one row labelled
`صف تجريبي من setup — يمكن حذفه` so you can see the whole path work, then
delete that row.

## 3. Deploy it as a Web App

1. **Deploy → New deployment**.
2. Click the gear next to *Select type* and choose **Web app**.
3. Fill in:
   - **Description**: anything, e.g. `qirtas ratings v1`
   - **Execute as**: **Me**
   - **Who has access**: **Anyone**  ← this one matters; *Anyone with a Google
     account* will not work, because teachers are not signing in.
4. **Deploy**, then **Authorize access** and accept the permission prompt.
   Google will warn that the app is unverified — that is expected for your own
   script. Choose *Advanced → Go to … (unsafe)*.
5. Copy the **Web app URL**. It ends in `/exec`.

## 4. Give the URL to the app

Either paste it into `src/lib/config.ts`:

```ts
const HARDCODED_ENDPOINT = 'https://script.google.com/macros/s/AKfycb..../exec'
```

…or, if you would rather keep it out of the source, create a `.env` file in the
project root:

```
VITE_RATING_ENDPOINT=https://script.google.com/macros/s/AKfycb..../exec
```

Rebuild (`npm run build`) and the rating option appears in الإعدادات.

## 5. Check it

Open the `/exec` URL in a browser. You should see:

```json
{"ok":true,"service":"qirtas-ratings"}
```

Then submit a rating from the app and watch a row appear in the **Ratings** tab.

## If the sheet stays empty

**Start here: run `whereAmI` from the editor.** Pick it in the function
dropdown, press **Run**, and read the execution log:

```
Source     : SPREADSHEET_ID
File       : قِرطاس — التقييمات
File id    : 11EhvxLy…
URL        : https://docs.google.com/spreadsheets/d/…
Tab        : Ratings
Ratings    : 7
```

That is the file and tab your ratings are actually going into. Ratings that
"disappeared" are almost always sitting in a different spreadsheet or a
different tab from the one being watched — nothing in this script ever deletes
a row. If the URL is not the file you have open, open the one it prints.

If the count really is `0`, check these in order:

- Open the `/exec` URL in a browser. `تعذر العثور على دالة النص البرمجي: doGet`
  means the deployed version does not contain the code — you saved `Code.gs`
  but did not deploy a **new version** (see the section below). A healthy
  deployment answers `{"ok":true,"service":"qirtas-ratings"}`.
- Run `setup` from the editor. If it throws about `SPREADSHEET_ID`, the script
  is standalone and the id is missing or wrong.
- In **Manage deployments**, confirm **Who has access** is **Anyone**. If it
  says *Anyone with a Google account*, teachers are not signed in and every
  request is rejected.
- Check **Executions** in the left sidebar of the editor — failed `doPost` runs
  appear there with the error.
- Confirm the tab is still named **Ratings**. Renaming it in the spreadsheet
  makes the script create a fresh empty `Ratings` tab beside it and write
  there; `whereAmI` prints the tab it uses.

## If you change `Code.gs` later

Apps Script keeps serving the old code until you redeploy. Use
**Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** so the
URL stays the same. Creating a *new deployment* instead would give you a
different URL, and you would have to update the app again.

## Why the app posts `text/plain`

A `Content-Type: application/json` POST is not a "simple" CORS request, so the
browser sends an `OPTIONS` preflight first — and Apps Script web apps do not
answer `OPTIONS`, so the request dies before it starts. `text/plain` is on the
CORS safelist, so there is no preflight, and `doPost` still receives the raw
JSON string in `e.postData.contents`.

Apps Script also answers `/exec` with a redirect to `googleusercontent.com`;
`fetch` follows it, and the simple-request rules let the CORS check pass on both
hops. This is why the app does **not** need `mode: 'no-cors'` in the normal
case — it only falls back to that if the first attempt fails, since a `no-cors`
response is opaque and cannot confirm anything.
