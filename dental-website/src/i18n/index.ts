export type { Lang } from './config';
export {
  languages,
  defaultLang,
  languageLabels,
  htmlLang,
  ogLocale,
  hreflang,
  schemaLang,
} from './config';
export {
  getLangFromUrl,
  getRouteFromUrl,
  localizePath,
  absoluteUrl,
  getAlternateUrls,
  switchLangPath,
  isLang,
} from './utils';
export { useTranslations, ui } from './ui';
export { getPrivacySections, getTermsSections } from './legal';
