import { A4_HEIGHT_MM, A4_WIDTH_MM } from './paginate'

/**
 * Builds the PDF in the page itself so the download starts straight away, with
 * no print dialog in the way.
 *
 * Each A4 page is rasterised through an SVG <foreignObject>, which means the
 * browser's own layout engine draws it — Arabic shaping, list markers and font
 * fallbacks all come out exactly as they look on screen. Hand-rolled PDF text
 * drawing cannot shape Arabic, and a print dialog is what we were asked to
 * avoid, so raster is the honest trade: the text is an image, not selectable.
 */

/** ~230 dpi at A4: sharp on paper without producing an unmailable file. */
const RENDER_SCALE = 2.4
const PAGE_TIMEOUT_MS = 25000
const FONT_TIMEOUT_MS = 12000

/** Only these ship as webfonts; Arial and Times resolve from the system. */
const EMBEDDED_FAMILIES = /ibm plex sans arabic|inter/i
const EMBEDDED_WEIGHTS = new Set(['400', '700', 'normal', 'bold'])

export interface PdfProgress {
  page: number
  total: number
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ])
}

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'force-cache' })
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

let cachedFontCss: string | null = null

/**
 * The SVG we render into is its own document, so it cannot reach the app's
 * webfonts — they have to travel inline. html-to-image would happily inline
 * every @font-face on the page (37 of them, in every weight and subset), which
 * takes long enough to look like a hang, so we pick out only what the sheet can
 * actually use.
 */
async function buildFontEmbedCss(): Promise<string> {
  if (cachedFontCss !== null) return cachedFontCss

  const faces: { family: string; style: string; weight: string; range: string; url: string }[] = []
  const seen = new Set<string>()

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin stylesheet
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const family = rule.style.getPropertyValue('font-family').replace(/["']/g, '').trim()
      const weight = rule.style.getPropertyValue('font-weight').trim() || '400'
      if (!EMBEDDED_FAMILIES.test(family) || !EMBEDDED_WEIGHTS.has(weight)) continue

      const src = rule.style.getPropertyValue('src')
      const match = src.match(/url\(["']?([^"')]+\.woff2)["']?\)/i)
      if (!match) continue

      const url = new URL(match[1], sheet.href ?? document.baseURI).toString()
      if (seen.has(url)) continue
      seen.add(url)

      faces.push({
        family,
        style: rule.style.getPropertyValue('font-style').trim() || 'normal',
        weight,
        range: rule.style.getPropertyValue('unicode-range').trim(),
        url,
      })
    }
  }

  const embedded = await Promise.all(
    faces.map(async (face) => {
      const data = await toDataUrl(face.url)
      if (!data) return ''
      return `@font-face{font-family:'${face.family}';font-style:${face.style};font-weight:${face.weight};font-display:block;${
        face.range ? `unicode-range:${face.range};` : ''
      }src:url(${data}) format('woff2');}`
    }),
  )

  cachedFontCss = embedded.filter(Boolean).join('\n')
  return cachedFontCss
}

/**
 * Loads an image without `HTMLImageElement.decode()`. html-to-image's own
 * canvas path calls decode() on an SVG data URL, which never settles in some
 * Chrome builds and leaves the export hanging forever.
 */
function loadImage(src: string, timeoutMs: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timer = setTimeout(() => reject(new Error('image load timed out')), timeoutMs)
    image.onload = () => {
      clearTimeout(timer)
      resolve(image)
    }
    image.onerror = () => {
      clearTimeout(timer)
      reject(new Error('image failed to load'))
    }
    image.src = src
  })
}

export async function downloadSheetPdf(
  pages: HTMLElement[],
  fileName: string,
  onProgress?: (progress: PdfProgress) => void,
): Promise<void> {
  if (pages.length === 0) throw new Error('no pages to export')

  const [{ toSvg }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')])

  // A missing font is a cosmetic problem; a hang is not. Fall back rather than wait.
  let fontEmbedCSS = ''
  try {
    fontEmbedCSS = await withTimeout(buildFontEmbedCss(), FONT_TIMEOUT_MS, 'font embedding')
  } catch {
    fontEmbedCSS = ''
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })

  for (let index = 0; index < pages.length; index++) {
    onProgress?.({ page: index + 1, total: pages.length })
    const page = pages[index]
    const width = page.offsetWidth
    const height = page.offsetHeight

    const svgUrl = await withTimeout(
      toSvg(page, {
        width,
        height,
        backgroundColor: '#ffffff',
        fontEmbedCSS,
        skipFonts: fontEmbedCSS.length === 0,
        style: {
          // The preview is transform-scaled; capture the page at 1:1.
          transform: 'none',
          transformOrigin: 'top left',
          margin: '0',
          boxShadow: 'none',
          borderRadius: '0',
          width: `${width}px`,
          height: `${height}px`,
        },
      }),
      PAGE_TIMEOUT_MS,
      'page render',
    )

    const image = await loadImage(svgUrl, PAGE_TIMEOUT_MS)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * RENDER_SCALE)
    canvas.height = Math.round(height * RENDER_SCALE)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('canvas unavailable')
    // Browsers rasterise an SVG source at the destination size, so drawing the
    // page larger than its CSS box yields genuinely sharper text, not a blur-up.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    if (index > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(
      canvas.toDataURL('image/jpeg', 0.94),
      'JPEG',
      0,
      0,
      A4_WIDTH_MM,
      A4_HEIGHT_MM,
      undefined,
      'FAST',
    )

    // Yield so the progress indicator can actually paint between pages.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  saveBlob(pdf.output('blob'), fileName)
}

/**
 * iOS Safari ignores `download` on some blob URLs unless the anchor is in the
 * document, and revoking too early cancels the save.
 */
function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    link.remove()
    URL.revokeObjectURL(url)
  }, 4000)
}

export function sheetFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|\n\r]+/g, ' ').trim().slice(0, 60)
  const stamp = new Date().toISOString().slice(0, 10)
  return `${cleaned || 'ورقة-اختبار'}-${stamp}.pdf`
}
