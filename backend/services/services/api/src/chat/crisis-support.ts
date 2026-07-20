/**
 * Multilingual crisis / self-harm interception for the chat coach.
 *
 * Why deterministic patterns and not a classifier: this is a safety path. It
 * must add zero latency, cost nothing, and — above all — never depend on a
 * model responding or a network call succeeding. A model-based check may only
 * ever be added as a SECOND net on top of this one, failing open to the
 * pattern result.
 *
 * Two independent decisions live here:
 *
 *  1. DETECTION runs every locale's patterns against every message, whatever
 *     locale the client claims. Users code-switch, and a Swahili speaker with
 *     the app in English must still be caught. Over-triggering is the correct
 *     failure mode: a false positive shows a support message, a false negative
 *     is the failure that matters.
 *  2. REPLY LANGUAGE comes only from the locale the client tells us (see
 *     `resolveLocale`), never from guessing at the message's language.
 */

/** The nine locales Edutu ships. There is deliberately no `de`. */
export const SUPPORTED_LOCALES = [
  "en",
  "fr",
  "ar",
  "sw",
  "ha",
  "hi",
  "es",
  "zh",
  "pt",
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Baked-in default crisis contact number. This MUST always be available so the
 * safety path can render even when the admin-configured value (in
 * admin_settings) is unreachable. See selfHarmSupportText's fallback.
 */
export const DEFAULT_CRISIS_CONTACT = "+2348169400427";

/**
 * Placeholder replaced with the (admin-configurable) crisis contact number.
 * findahelpline.com is a fixed professional directory that resolves to staffed
 * crisis lines by country — it is NOT admin-editable, so it stays verbatim.
 */
const CONTACT_PLACEHOLDER = /\{\{contact\}\}/g;

/**
 * Per-locale support templates. Each carries a `{{contact}}` token, filled at
 * render time with the configured (or default) contact number, plus a fixed
 * findahelpline.com line. Only the short lead-in labels are translated; the
 * URL and the `{{contact}}` token are held verbatim across every locale.
 */
const SELF_HARM_SUPPORT_TEMPLATE_BY_LOCALE: Record<SupportedLocale, string> = {
  en: "I'm really sorry you're going through this — you don't have to face it alone.\n- Please reach out to someone you trust or a local crisis helpline right now.\n- If you're in immediate danger, contact a crisis helpline now: findahelpline.com\n- You can also reach the Edutu team: {{contact}}\n- I'm here whenever you want help with school, opportunities, or your next step.",
  fr: "Je suis vraiment désolé que tu traverses cela — tu n'as pas à l'affronter seul(e).\n- Contacte dès maintenant une personne de confiance ou une ligne d'écoute d'urgence près de chez toi.\n- Si tu es en danger immédiat, contacte une ligne d'écoute maintenant : findahelpline.com\n- Tu peux aussi joindre l'équipe Edutu : {{contact}}\n- Je reste là dès que tu veux de l'aide pour tes études, des opportunités ou ta prochaine étape.",
  ar: "يؤسفني حقًا ما تمر به — لست مضطرًا لمواجهة هذا وحدك.\n- تواصل الآن مع شخص تثق به أو مع خط دعم نفسي في بلدك.\n- إذا كنت في خطر فوري، تواصل الآن مع خط دعم للأزمات: findahelpline.com\n- يمكنك أيضًا التواصل مع فريق Edutu: {{contact}}\n- وأنا هنا في أي وقت تحتاج فيه مساعدة في الدراسة أو الفرص أو خطوتك القادمة.",
  sw: "Pole sana kwa hali unayopitia — huhitaji kukabiliana na hili peke yako.\n- Tafadhali zungumza sasa hivi na mtu unayemwamini au piga simu kwenye huduma ya msaada wa dharura iliyo karibu nawe.\n- Ukiwa hatarini sasa hivi, wasiliana na huduma ya msaada wa dharura: findahelpline.com\n- Unaweza pia kuwasiliana na timu ya Edutu: {{contact}}\n- Nipo hapa wakati wowote utakapohitaji msaada wa masomo, fursa au hatua yako inayofuata.",
  ha: "Ina matukar baƙin ciki da abin da kake ciki — ba sai ka fuskanci wannan kai kaɗai ba.\n- Da fatan za ka yi magana yanzu da wanda ka amince da shi ko ka kira layin taimako na gaggawa da ke kusa da kai.\n- Idan kana cikin haɗari yanzu, tuntuɓi layin taimako na gaggawa: findahelpline.com\n- Za ka kuma iya tuntuɓar ƙungiyar Edutu: {{contact}}\n- Ina nan duk lokacin da kake buƙatar taimako kan karatu, dama ko mataki na gaba.",
  hi: "मुझे बहुत दुख है कि आप इस दौर से गुज़र रहे हैं — आपको इसका सामना अकेले नहीं करना है।\n- कृपया अभी किसी भरोसेमंद व्यक्ति से बात करें या अपने क्षेत्र की क्राइसिस हेल्पलाइन पर कॉल करें।\n- अगर आप तुरंत खतरे में हैं, तो अभी क्राइसिस हेल्पलाइन से संपर्क करें: findahelpline.com\n- आप Edutu टीम से भी संपर्क कर सकते हैं: {{contact}}\n- पढ़ाई, अवसरों या अगले कदम में मदद चाहिए हो तो मैं यहीं हूँ।",
  es: "Siento mucho que estés pasando por esto: no tienes que enfrentarlo solo.\n- Por favor, habla ahora mismo con alguien de confianza o llama a una línea de ayuda en crisis de tu país.\n- Si estás en peligro inmediato, contacta ahora una línea de ayuda en crisis: findahelpline.com\n- También puedes contactar al equipo de Edutu: {{contact}}\n- Aquí estaré cuando quieras ayuda con tus estudios, oportunidades o tu siguiente paso.",
  zh: "很抱歉你正在经历这些——你不必独自面对。\n- 请现在就联系你信任的人，或拨打你所在地区的心理危机求助热线。\n- 如果你现在有危险，请立即联系危机求助热线：findahelpline.com\n- 你也可以联系 Edutu 团队：{{contact}}\n- 无论何时你想聊学业、机会或下一步，我都在这里。",
  pt: "Sinto muito que você esteja passando por isso — você não precisa enfrentar isso sozinho.\n- Por favor, procure agora alguém em quem você confia ou uma linha de apoio em crise da sua região.\n- Se você está em perigo imediato, contate agora uma linha de apoio em crise: findahelpline.com\n- Você também pode falar com a equipe da Edutu: {{contact}}\n- Estarei aqui sempre que quiser ajuda com estudos, oportunidades ou o seu próximo passo.",
};

/**
 * English support copy with the default contact baked in. This is what the
 * crisis path returns for an English client when settings are default/absent,
 * so the "English behaviour is identical" tests assert on this exact string.
 * (Its wording gained two safety lines — a helpline directory and the Edutu
 * contact — when the admin-configurable contact was introduced.)
 */
export const SELF_HARM_SUPPORT = fillCrisisContact(
  SELF_HARM_SUPPORT_TEMPLATE_BY_LOCALE.en,
  DEFAULT_CRISIS_CONTACT,
);

/**
 * The English patterns, unchanged from the original inline regex. Kept as its
 * own export so the "English behaviour is identical" test can assert on the
 * exact literal.
 */
export const ENGLISH_SELF_HARM_PATTERN =
  /\b(kill(ing)? myself|end my (own )?life|commit suicide|suicidal|self[- ]harm|hurt(ing)? myself|want to die)\b/;

/**
 * Additional English phrasings. Purely additive to the pattern above — nothing
 * that used to match can stop matching.
 */
const ENGLISH_EXTRA_PATTERNS: RegExp[] = [
  /\b(take|taking) my own life\b/,
  /\b(don'?t|do not|dont) want to (live|be alive|be here anymore)\b/,
  /\b(no (reason|point) (to|in) liv|nothing to live for)/,
  /\b(better off dead|end it all|kms)\b/,
  /\b(cut(ting)? myself|harm myself|harming myself)\b/,
];

/**
 * Latin-script patterns are matched against a de-accented, lower-cased copy of
 * the message, so "je veux mourir" and "je veux mourır"-style accent noise both
 * land. Written unaccented on purpose.
 */
const LATIN_PATTERNS: Array<{ locale: SupportedLocale; patterns: RegExp[] }> = [
  {
    locale: "fr",
    patterns: [
      /\b(me suicider|suicidaire|je vais me suicider|suicide)\b/,
      /\b(je veux|j'?ai envie de|envie de|je vais)\s+(mourir|crever)\b/,
      /\bmettre fin (a|à) (mes jours|ma vie)\b/,
      /\ben finir avec (la vie|tout)\b/,
      /\bme (tuer|faire du mal|faire mal)\b/,
      /\b(je ne veux plus|plus envie de|j'?en peux plus de) vivre\b/,
      /\bje veux (disparaitre|mourir)\b/,
    ],
  },
  {
    locale: "es",
    patterns: [
      /\bsuicid(arme|arse|io|a)\b/,
      /\bquiero morir(me)?\b/,
      /\b(quitarme|acabar con) (la|mi) vida\b/,
      /\bterminar con mi vida\b/,
      /\bmatarme\b/,
      /\bhacerme dano\b/,
      /\b(no|ya no) quiero (seguir )?(viviendo|vivir)\b/,
      /\bno quiero seguir aqui\b/,
    ],
  },
  {
    locale: "pt",
    patterns: [
      /\bsuicid(io|ar|ar-me|arme|a)\b/,
      /\bme matar\b/,
      /\bquero morrer\b/,
      /\b(tirar|acabar com) a minha vida\b/,
      /\bacabar com tudo\b/,
      /\bme (machucar|cortar)\b/,
      /\b(nao quero mais viver|nao aguento mais viver|nao quero viver)\b/,
    ],
  },
  {
    locale: "sw",
    patterns: [
      /\b(kujiua|najiua|nitajiua|nataka kujiua|amua kujiua)\b/,
      /\bnataka kufa\b/,
      /\b(sitaki|sipendi) kuishi\b/,
      /\bkujidhuru\b/,
      /\bnimechoka na maisha\b/,
      /\bmaisha yamenishinda\b/,
      /\bnijiue\b/,
    ],
  },
  {
    locale: "ha",
    patterns: [
      /\bkashe kaina\b/,
      /\bin kashe kaina\b/,
      /\bkisan kai\b/,
      /\bcutar da kaina\b/,
      /\b(ina son|zan) (in )?mutu\b/,
      /\bina son mutuwa\b/,
      /\bba na son rayuwa\b/,
      /\bna gaji da rayuwa\b/,
    ],
  },
  {
    // Romanised Hindi — very common in chat even from Devanagari-first users.
    locale: "hi",
    patterns: [
      /\b(atmahatya|aatmahatya|khudkushi|khudkhushi)\b/,
      /\bmar(na)? (chahta|chahti|chahata)\b/,
      /\bmar jana chahta\b/,
      /\b(jeena|jina) nahi chahta\b/,
      /\bapni jaan (le|dena|de)\b/,
      /\bkhud ko (maar|nuksan)\b/,
      /\bjeene ka mann nahi\b/,
    ],
  },
];

/**
 * Non-Latin scripts. `\b` is ASCII-only in JS, so it never fires between Arabic,
 * Devanagari or Han characters — these are deliberately unanchored substring
 * patterns. Arabic is matched against an alef/ya-normalised, tashkeel-stripped
 * copy of the message.
 */
const SCRIPT_PATTERNS: Array<{
  locale: SupportedLocale;
  patterns: RegExp[];
}> = [
  {
    locale: "ar",
    patterns: [
      /انتحار/,
      /انتحر/,
      /اقتل نفسي/,
      /قتل نفسي/,
      /ؤذي نفسي/,
      /اذي نفسي/,
      /(اريد|ابي|ابغي|بدي|نفسي|عايز|عاوز)\s*(ان\s*)?(اموت|اموت)/,
      /(لا|ما)\s*(اريد|ابي|ابغي|بدي|عايز|عاوز)\s*(ان\s*)?(اعيش|عيش|اكمل)/,
      /(انهي|انهاء|اقضي علي)\s*حياتي/,
      /تعبت من الحياه/,
      /مليت من الحياه/,
      /مش عايز اعيش/,
    ],
  },
  {
    locale: "hi",
    patterns: [
      /आत्महत्या/,
      /खुदकुशी/,
      /मरना चाह/,
      /मर जाना चाह/,
      /मर जाऊं/,
      /(जीना|जीने) (नहीं|नही) चाह/,
      /जीने का मन नहीं/,
      /खुद को (मार|नुकसान)/,
      /अपनी जान ले/,
    ],
  },
  {
    locale: "zh",
    patterns: [
      /自杀|自殺/,
      /自残|自殘/,
      /想死/,
      /不想活/,
      /活不下去/,
      /结束(自己的)?生命|結束(自己的)?生命/,
      /伤害自己|傷害自己/,
      /了结自己|了結自己/,
      /不想活了/,
    ],
  },
];

/** Lower-case + strip Latin combining accents. Leaves other scripts alone. */
function normalizeLatin(message: string) {
  return message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Strip Arabic tashkeel and fold alef/ya/ta-marbuta variants. */
function normalizeArabic(message: string) {
  return message
    .replace(/[\u064b-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

/**
 * True when the message carries self-harm / crisis intent in ANY of the nine
 * locales. Deliberately locale-agnostic: the claimed UI locale never narrows
 * which patterns run.
 */
export function detectSelfHarmIntent(message: string): boolean {
  const lower = message.toLowerCase();

  // English first, byte-for-byte the original check.
  if (ENGLISH_SELF_HARM_PATTERN.test(lower)) return true;
  if (ENGLISH_EXTRA_PATTERNS.some((pattern) => pattern.test(lower))) {
    return true;
  }

  const latin = normalizeLatin(message);
  for (const group of LATIN_PATTERNS) {
    if (group.patterns.some((pattern) => pattern.test(latin))) return true;
  }

  const arabic = normalizeArabic(message);
  for (const group of SCRIPT_PATTERNS) {
    const haystack = group.locale === "ar" ? arabic : message;
    if (group.patterns.some((pattern) => pattern.test(haystack))) return true;
  }

  return false;
}

/**
 * Normalises whatever the client sent ("fr-CA", "zh-Hans-CN", an
 * Accept-Language list) to one of the nine shipped locales. Anything unknown or
 * missing falls back to English — the language this path has always answered in.
 */
export function resolveLocale(input?: string | null): SupportedLocale {
  if (!input) return "en";
  for (const part of input.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (!tag) continue;
    const primary = tag.split(/[-_]/)[0] as SupportedLocale;
    if ((SUPPORTED_LOCALES as readonly string[]).includes(primary)) {
      return primary;
    }
  }
  return "en";
}

/**
 * Interpolate the `{{contact}}` token with a contact number, falling back to the
 * baked-in default whenever the supplied value is missing or blank. Kept as a
 * function declaration so it can be referenced above where SELF_HARM_SUPPORT is
 * derived (hoisting).
 */
function fillCrisisContact(
  template: string,
  contactPhone?: string | null,
): string {
  const phone =
    typeof contactPhone === "string" && contactPhone.trim()
      ? contactPhone.trim()
      : DEFAULT_CRISIS_CONTACT;
  return template.replace(CONTACT_PLACEHOLDER, phone);
}

/**
 * Crisis support copy in the user's language; English for anything unknown. The
 * optional contact number is admin-configurable; an absent/blank value degrades
 * to the baked-in DEFAULT_CRISIS_CONTACT so the safety message always renders.
 */
export function selfHarmSupportText(
  locale?: string | null,
  contactPhone?: string | null,
): string {
  return fillCrisisContact(
    SELF_HARM_SUPPORT_TEMPLATE_BY_LOCALE[resolveLocale(locale)],
    contactPhone,
  );
}
