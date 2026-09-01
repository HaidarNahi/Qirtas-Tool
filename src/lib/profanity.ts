/**
 * The offline half of the obscenity filter.
 *
 * The model catches far more than this list does, including things spelled
 * creatively — but it needs a network, and قِرطاس is built to work without one.
 * So the obvious cases are caught locally and instantly, and the model's
 * findings are merged in on top when it answers.
 *
 * The point is not censorship: a flagged word is only blurred in the editor, so
 * a teacher who pastes half a chat log into a question notices before it goes
 * out on a hundred printed papers. Nothing is ever removed, the sheet keeps
 * exactly what was typed, and the PDF is untouched.
 */

const ENGLISH = [
  'fuck', 'fucking', 'fucked', 'fucker', 'shit', 'shitty', 'bullshit', 'bitch',
  'bastard', 'asshole', 'arsehole', 'dick', 'cunt', 'whore', 'slut', 'wanker',
  'prick', 'twat', 'douche', 'motherfucker', 'nigga', 'nigger', 'faggot', 'retard',
  'damn', 'goddamn', 'crap', 'piss', 'pissed', 'bollocks',
]

const ARABIC = [
  'كس', 'طيز', 'زب', 'خرا', 'خرة', 'شرموط', 'شرموطة', 'قحبة', 'عاهرة',
  'منيوك', 'منيوكة', 'خول', 'لوطي', 'زاني', 'زانية', 'وسخة',
  'حمار', 'حماره', 'كلب', 'كلبة', 'غبي', 'غبية', 'أحمق', 'حقير', 'خنزير',
  'يلعن', 'العن', 'تفو', 'عرص', 'ديوث', 'نيك', 'ينيك',
]

/** Clitics Arabic glues onto the front of a word; the word underneath is the same word. */
const ARABIC_PREFIXES = ['', 'ال', 'و', 'ف', 'ب', 'ل', 'ك', 'وال', 'فال', 'بال', 'كال', 'لل']

const WORD_CHAR = /[\p{L}\p{M}\p{N}_]/u
/** Arabic short vowels and the decorative stretch character. */
const TASHKEEL = /[ً-ْـٰ]/g

const VARIANTS = new Set<string>()
for (const word of ENGLISH) VARIANTS.add(word)
for (const word of ARABIC) {
  for (const prefix of ARABIC_PREFIXES) VARIANTS.add(prefix + word)
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(TASHKEEL, '')
    // Hamza and ya/alef-maqsura are written both ways in practice.
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
}

/**
 * Whole-word hits only. Substring matching turns "classic" into a slur and
 * "الحمارة" — a perfectly ordinary word in a biology paper — into an incident.
 */
export function findProfanity(text: string): string[] {
  const hits = new Set<string>()
  // Splitting keeps each token's position so the original spelling is returned.
  const tokens = text.split(/([^\p{L}\p{M}\p{N}_]+)/u)
  for (const token of tokens) {
    if (!token || !WORD_CHAR.test(token[0])) continue
    if (VARIANTS.has(normalise(token))) hits.add(token)
  }
  return [...hits]
}
