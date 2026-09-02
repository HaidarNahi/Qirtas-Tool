/**
 * The offline half of the obscenity filter.
 *
 * قِرطاس is built to work without a network, so this list has to carry the
 * feature on its own; the model's findings are merged in on top when it answers.
 * That makes matching, not vocabulary, the hard part — nobody types "شرموطة"
 * into a paper by accident, but plenty of people type "شرمووطه" or "sh!t", and
 * a filter that only knows the dictionary spelling catches neither.
 *
 * So a word is matched by its skeleton: tashkeel and tatweel dropped, hamza and
 * ة/ه and ى/ي unified, the Persian letters Iraqis type for چ and گ mapped onto
 * the Arabic ones, Arabizi digits mapped back to the letters they stand for
 * (3→ع, 7→ح, 5→خ), leetspeak mapped back on the Latin side, stretched-out runs
 * collapsed, dots and dashes between letters thrown away, and the clitics Arabic
 * glues on the front (ال، و، ف، ب، ك، ل) and the endings it glues on the back
 * (ك، كم، ها، هم، ين، ات) peeled off. Two spellings that reduce to the same
 * skeleton are the same word.
 *
 * Coverage is only half the job. The other half is not crying wolf: this is a
 * tool for exam papers, and a red frame around كلب in a biology question, or
 * around شاذ in an Arabic grammar question, is what gets the whole feature
 * switched off and left off. So ordinary words that are only insults when
 * pointed at someone live in `AIMED_ONLY` and are flagged only when the sentence
 * actually points them at someone, and words that carry a second, innocent
 * meaning in a school subject — جنس، بول، شاذ، كافر، نجس، فاشل — are left out
 * altogether. The model still catches those in context; the offline list does
 * not guess.
 *
 * A flagged word is framed in the editor, never removed on its own. The sheet
 * keeps exactly what was typed unless the teacher taps the warning, and the PDF
 * is untouched either way.
 */

/**
 * Obscene, vulgar, or a slur in any context. Flagged wherever they appear.
 *
 * Written in ordinary spelling; the fold turns each into its skeleton once at
 * startup, so there is no need to also list "شرموطه" beside "شرموطة".
 */
const OBSCENE = [
  // ── English ──────────────────────────────────────────────────────────────
  'fuck', 'fucker', 'fucking', 'motherfucker', 'fuk', 'fck', 'stfu', 'wtf',
  'shit', 'shite', 'bullshit', 'shitty', 'crap', 'piss', 'pissed',
  'bitch', 'bastard', 'asshole', 'arsehole', 'ass', 'arse', 'jackass', 'dumbass',
  'dick', 'dickhead', 'cock', 'prick', 'cunt', 'twat', 'pussy', 'boobs', 'tits',
  'whore', 'slut', 'skank', 'wanker', 'wank', 'jerkoff', 'blowjob',
  'porn', 'porno', 'pornhub', 'xxx', 'sexy', 'horny', 'nude', 'cum', 'orgasm',
  'masturbate', 'rape', 'rapist', 'pedo', 'pedophile', 'incest',
  'nigga', 'nigger', 'faggot', 'fag', 'tranny', 'retard', 'retarded',
  'douche', 'douchebag', 'bollocks', 'bugger', 'moron', 'idiot', 'imbecile',
  'damn', 'goddamn', 'freaking', 'frigging', 'stupid', 'dumb', 'loser',
  'pervert', 'perverted', 'slag', 'tosser', 'nonce',

  // ── Arabic — sexual and genital ──────────────────────────────────────────
  'كس', 'كسم', 'كسمك', 'كسك', 'كسها', 'كسختك', 'طيز', 'طيزك', 'طياز',
  'زب', 'زبر', 'زبي', 'زبك', 'عير', 'عيري',
  'نيك', 'ينيك', 'تنيك', 'ننيك', 'نياكة', 'منيوك', 'منيوكة', 'منيوچ',
  'شرموط', 'شرموطة', 'شراميط', 'قحبة', 'قحاب', 'عاهرة', 'عواهر', 'داعرة',
  'زاني', 'زانية', 'سافل', 'سافلة', 'ديوث', 'دياثة',
  'عرص', 'عروص', 'معرص', 'معرصة', 'قواد', 'قوادة',
  'خول', 'خوال', 'لوطي', 'لواط', 'ملوط', 'مخنث', 'مخنثة',
  'دعارة', 'بغاء', 'مومس', 'اباحي', 'اباحية', 'خلاعة', 'خليع',
  'خرا', 'خرة', 'خاري', 'تخرا', 'يخرا', 'خريت',

  // ── Arabic — insults and abuse ───────────────────────────────────────────
  'يلعن', 'العن', 'انعل', 'نعال', 'تفو', 'خرب بيتك', 'يحرق ابوك',
  'يلعن دينك', 'يلعن ابوك', 'يلعن امك', 'دين ابوك', 'دين امك', 'الله ياخذك',
  'ابن الكلب', 'ابن كلب', 'بنت الكلب', 'ابن الحرام', 'بنت الحرام',
  'ولد الحرام', 'اولاد الحرام', 'ابن الزنا', 'نغل', 'ابن حرام',
  'حقير', 'حقيرة', 'وضيع', 'وضيعة', 'دنيء', 'نذل', 'نذلة', 'اندال',
  'خسيس', 'خسيسة', 'لئيم', 'لئيمة', 'حثالة', 'رعاع', 'سفلة', 'صايع', 'صايعة',
  'غبي', 'غبية', 'اغبياء', 'بليد', 'بليدة', 'احمق', 'حمقاء', 'معتوه', 'معتوهة',
  'اهبل', 'هبلة', 'اهبال', 'مغفل', 'مغفلة', 'تافه', 'تافهة', 'خايب', 'خايبة',
  'اخرس', 'اخرسي', 'انقلع', 'انقلعي', 'خسي', 'اطلع بره', 'يا ويلك',

  // ── Iraqi dialect, which the model is weakest on ─────────────────────────
  'كلاوچي', 'خربان', 'دلخ', 'دلوخ', 'مچعبر', 'هايف', 'هايفة', 'زق', 'زقة',
  'يزق', 'لوش', 'مسطول', 'مسطولة', 'خرفان', 'يا حيوان',

  // ── Arabizi. Digits are deliberately absent: the Latin fold reads 3 as e,
  //    so "3ars" would land on "ears" and flag an ordinary English word. ─────
  'kos', 'kus', 'kess', 'teez', 'tiz', 'zeb', 'zib', 'neek', 'manyak',
  'sharmoot', 'sharmoota', 'sharmota', 'gahba', 'kahba', 'aars', 'khara',
  'khawal', 'zamel', 'ayre', 'yelaan', 'ibn kalb', 'kis omak',
]

/**
 * Ordinary words that are obscene only when aimed at someone.
 *
 * كلب and حمار and خنزير belong in every biology paper written here, and مجنون
 * is half of Arabic literature. They are flagged only when the sentence points
 * them at a person — يا كلب، انت حمار، حمارك — and never on their own.
 */
const AIMED_ONLY = [
  'كلب', 'كلبة', 'كلاب', 'حمار', 'حمارة', 'حمير', 'خنزير', 'خنزيرة', 'خنازير',
  'بقرة', 'ثور', 'جحش', 'قرد', 'قردة', 'فار', 'صرصر', 'دودة', 'ذبابة',
  'تيس', 'عنز', 'بغل', 'ديك', 'دجاجة', 'خروف', 'غنم', 'بهيمة', 'بهايم',
  'حيوان', 'حيوانة', 'وحش', 'مسخ',
  'مجنون', 'مجنونة', 'ابله', 'بلهاء', 'سفيه', 'سفيهة', 'جبان', 'جبانة',
  'وسخ', 'وسخة', 'قذر', 'قذرة', 'كذاب', 'كذابة', 'فاشل', 'فاشلة',
]

/** Words that turn the one after them into an insult: "يا كلب"، "انت حمار". */
const AIMED_MARKERS = [
  'يا', 'ايها', 'ايتها', 'انت', 'انتي', 'انته', 'انتا', 'انتم', 'انتو', 'انتن',
  'هذا', 'هذه', 'هاي', 'هاذا', 'مثل', 'زي', 'كانك', 'شلون', 'شكد', 'تره',
]

/** The clitics Arabic glues onto the front of a word. */
const PREFIXES = [
  '', 'ال', 'و', 'ف', 'ب', 'ك', 'ل', 'وال', 'فال', 'بال', 'كال', 'لل', 'ولل',
  'فلل', 'وب', 'ول', 'فب', 'فل', 'وك', 'فك', 'س', 'وس', 'يا',
]

/**
 * The endings it glues on the back. Peeled off rather than enumerated, because
 * every stem would otherwise need a dozen entries of its own.
 */
const SUFFIXES = [
  '', 'ك', 'كم', 'كن', 'كي', 'كما', 'ها', 'هم', 'هن', 'هما', 'ه', 'ي', 'نا',
  'ين', 'ون', 'ات', 'ان', 'تين', 'تك', 'تها', 'تهم', 'تنا', 'تي', 'تكم',
]

/**
 * Below this a peeled stem is a coincidence rather than a match: strip ال and
 * ون off enough ordinary words and one of them eventually lands on زب — which
 * is exactly how "زبون" gets flagged in a business paper.
 */
const MIN_STEM = 3

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u
/** Arabic short vowels, sukun, the superscript alef, and the stretch mark. */
const TASHKEEL = /[ً-ْٰـ]/g
/** Zero-width joiners and direction marks that ride along on pasted chat text. */
const INVISIBLE = /[​-‏‪-‮⁠﻿]/g
const ARABIC_LETTER = /[؀-ۿݐ-ݿ]/

/** Digits and symbols standing in for Arabic letters — Arabizi. */
const ARABIC_SUBSTITUTIONS: Record<string, string> = {
  '2': 'ء', '3': 'ع', '4': 'ذ', '5': 'خ', '6': 'ط', '7': 'ح', '8': 'غ', '9': 'ص',
}

/** The same trick on the Latin side, where 3 means e rather than ع. */
const LATIN_SUBSTITUTIONS: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'i', '+': 't',
}

/**
 * One spelling per word.
 *
 * Which substitution table applies depends on the script, because the same
 * digit means different things in each: 3 is ع in "3ars" and e in "l33t".
 */
function fold(token: string): string {
  const text = token.toLowerCase().replace(INVISIBLE, '').replace(TASHKEEL, '')
  const table = ARABIC_LETTER.test(text) ? ARABIC_SUBSTITUTIONS : LATIN_SUBSTITUTIONS

  return (
    [...text]
      .map((char) => table[char] ?? char)
      .join('')
      // Hamza carriers, ta marbuta and alef maqsura are written both ways in
      // practice, and the difference never separates two real words here.
      .replace(/[أإآٱءئؤ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      // The letters Iraqis borrow from Persian for sounds Arabic has no letter
      // for: چلب for كلب, گلب for قلب.
      .replace(/[چڃ]/g, 'ج')
      .replace(/[گڭ]/g, 'ك')
      .replace(/پ/g, 'ب')
      .replace(/[ڤﭬ]/g, 'ف')
      // "شرمووووطة" and "fuuuuck" are the same word held down on the keyboard.
      // A run collapses to two rather than one, because two can be real —
      // English "letter", a shadda written out — and `variants` then tries the
      // pair both ways.
      .replace(/(.)\1{2,}/g, '$1$1')
      // Anything left that is not a letter or digit was padding: f.u.c.k.
      .replace(/[^\p{L}\p{N}]/gu, '')
  )
}

/** Symbols that stand in for a letter — sometimes for one, sometimes for none. */
const STAND_INS = /[@$!|+*]/g
/** Three or more of the same character in a row: a key held down, not a word. */
const STRETCHED = /(.)\1{2,}/

/**
 * The spellings a token could be.
 *
 * Generated from the text being checked, never from the list. Doing it the
 * other way round puts "as" in the set as a reading of "ass", and every English
 * sentence lights up.
 *
 * Two of them are needed beyond the plain fold:
 *
 *  - A stretched word folds to a doubled letter ("شرمووووطة" → "شرمووطه"), so
 *    the pair is also tried as one. Only for a token that really was stretched:
 *    collapsing every double turns "اللعن" into "العن" and flags an ordinary
 *    word in a religion paper.
 *  - A stand-in symbol replaces a letter in "sh!t" but stands for nothing in
 *    "f@ck", which is "fck" with a decoration. Both readings are cheap.
 */
function variants(token: string): string[] {
  const out = new Set<string>()
  const folded = fold(token)
  out.add(folded)
  if (STRETCHED.test(token)) out.add(folded.replace(/(.)\1/g, '$1'))
  if (STAND_INS.test(token)) out.add(fold(token.replace(STAND_INS, '')))
  return [...out]
}

/** Every stem a folded word could be hiding under a prefix and a suffix. */
function stems(folded: string): string[] {
  const out = new Set<string>([folded])
  for (const prefix of PREFIXES) {
    if (prefix && !folded.startsWith(prefix)) continue
    const body = folded.slice(prefix.length)
    for (const suffix of SUFFIXES) {
      if (suffix && !body.endsWith(suffix)) continue
      const stem = body.slice(0, body.length - suffix.length)
      if (stem.length >= MIN_STEM) out.add(stem)
    }
  }
  return [...out]
}

const single = (list: string[]) => list.filter((word) => !word.includes(' '))

const OBSCENE_SET = new Set(single(OBSCENE).map(fold))
const AIMED_SET = new Set(single(AIMED_ONLY).map(fold))
const MARKER_SET = new Set(AIMED_MARKERS.map(fold))

/** Multi-word entries are matched across the gap, so they are held separately. */
const PHRASES = OBSCENE.filter((word) => word.includes(' ')).map((word) =>
  word.split(/\s+/).map(fold),
)

function listed(token: string, set: Set<string>): boolean {
  for (const variant of variants(token)) {
    if (set.has(variant)) return true
    for (const stem of stems(variant)) if (set.has(stem)) return true
  }
  return false
}

/** "انت" and "يا" also arrive with a clitic on the front, as "وانت". */
function isMarker(folded: string): boolean {
  if (MARKER_SET.has(folded)) return true
  for (const prefix of ['و', 'ف', 'ل']) {
    if (folded.startsWith(prefix) && MARKER_SET.has(folded.slice(prefix.length))) return true
  }
  return false
}

/**
 * A second-person ending is an aim all by itself: "كلبك" is not a dog. Only the
 * pronouns that address someone count — "كلبها" is her dog, and stays a dog.
 */
const AIMED_SUFFIXES = ['ك', 'كم', 'كن', 'كي', 'كما']

function carriesAim(folded: string): boolean {
  for (const suffix of AIMED_SUFFIXES) {
    if (!folded.endsWith(suffix)) continue
    const stem = folded.slice(0, folded.length - suffix.length)
    if (stem.length >= MIN_STEM && AIMED_SET.has(stem)) return true
  }
  return false
}

/**
 * Tokens are cut on whitespace and on the punctuation that ends a word, but
 * dots, dashes and the symbols that stand in for letters stay inside the token
 * so "f.u.c.k" and "sh!t" survive to be folded. Edge punctuation is then
 * trimmed off, so the word handed back is the one really in the text — which is
 * what findWord has to locate to draw the frame.
 */
const SPLIT = /[^\p{L}\p{M}\p{N}_@$!|+*.'‘’-]+/u
const EDGE = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu

interface Token {
  raw: string
  folded: string
}

/**
 * Whole-word hits only, returned with their original spelling.
 *
 * Substring matching is what turns "classic" into a slur and "الحمارة" — an
 * ordinary word in a biology paper — into an incident. A token either folds
 * onto a listed word or it does not.
 */
export function findProfanity(text: string): string[] {
  const found = new Set<string>()
  const words: Token[] = []

  for (const piece of text.split(SPLIT)) {
    const raw = piece.replace(EDGE, '')
    if (!raw || !WORD_CHAR.test(raw)) continue
    words.push({ raw, folded: fold(raw) })
  }

  for (let index = 0; index < words.length; index++) {
    const { raw, folded } = words[index]
    if (!folded) continue

    if (listed(raw, OBSCENE_SET)) {
      found.add(raw)
      continue
    }

    // An aimed-only word needs an address in front of it, or a second-person
    // ending on it. Without either it is just a word about an animal.
    if (listed(raw, AIMED_SET)) {
      const before = index > 0 ? words[index - 1].folded : ''
      if (carriesAim(folded) || (before && isMarker(before))) found.add(raw)
    }
  }

  // Phrases last: "ابن الكلب" is an obscenity even though neither half is.
  for (const phrase of PHRASES) {
    for (let index = 0; index + phrase.length <= words.length; index++) {
      if (phrase.every((part, offset) => words[index + offset].folded === part)) {
        for (let offset = 0; offset < phrase.length; offset++) found.add(words[index + offset].raw)
      }
    }
  }

  return [...found]
}
