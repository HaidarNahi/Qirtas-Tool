# Receiving ratings in a Google Sheet

Ten minutes, once. Until you finish it the rating feature stays hidden in the
app and nothing is ever sent anywhere.

## 1. Make the sheet

1. Go to <https://sheets.new> and give the spreadsheet a name, e.g. *قِرطاس —
   التقييمات*.

## 2. Add the script

1. In that spreadsheet: **Extensions → Apps Script**.
2. Delete whatever is in `Code.gs` and paste the contents of the `Code.gs`
   next to this file.
3. Save (the disk icon).

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
