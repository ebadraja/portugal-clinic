export const languages = ['pt', 'en', 'es'] as const;
export type Lang = (typeof languages)[number];

export const defaultLang: Lang = 'pt';

export const languageLabels: Record<Lang, string> = {
  pt: 'PT',
  en: 'EN',
  es: 'ES',
};

/** BCP 47 for <html lang> */
export const htmlLang: Record<Lang, string> = {
  pt: 'pt-PT',
  en: 'en',
  es: 'es',
};

/** Open Graph locale */
export const ogLocale: Record<Lang, string> = {
  pt: 'pt_PT',
  en: 'en_GB',
  es: 'es_ES',
};

/** hreflang values */
export const hreflang: Record<Lang, string> = {
  pt: 'pt-PT',
  en: 'en',
  es: 'es',
};

/** Schema.org inLanguage */
export const schemaLang: Record<Lang, string> = {
  pt: 'pt-PT',
  en: 'en',
  es: 'es',
};
