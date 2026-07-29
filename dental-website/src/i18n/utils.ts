import { defaultLang, languages, type Lang } from './config';
import { site } from '../data/site';

export function isLang(value: string): value is Lang {
  return (languages as readonly string[]).includes(value);
}

/** Detect locale from a pathname. No Accept-Language redirect — URL only. */
export function getLangFromUrl(url: URL): Lang {
  const [, maybe] = url.pathname.split('/');
  if (maybe && isLang(maybe) && maybe !== defaultLang) return maybe;
  return defaultLang;
}

/** Strip locale prefix and trailing slash for route matching. */
export function getRouteFromUrl(url: URL): string {
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] && isLang(parts[0]) && parts[0] !== defaultLang) {
    parts.shift();
  }
  return parts.length ? `/${parts.join('/')}` : '/';
}

/** Build a localised path. Portuguese has no prefix. */
export function localizePath(lang: Lang, path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === defaultLang) return clean === '' ? '/' : clean;
  if (clean === '/') return `/${lang}/`;
  return `/${lang}${clean}`;
}

/** Absolute canonical URL for a lang + path. */
export function absoluteUrl(lang: Lang, path = '/'): string {
  const local = localizePath(lang, path);
  if (local === '/') return site.url;
  return `${site.url}${local}`.replace(/\/$/, local.endsWith('/') ? '/' : '');
}

/** hreflang alternates for the current route (same path across locales). */
export function getAlternateUrls(path: string): { lang: Lang; href: string }[] {
  return languages.map((lang) => ({
    lang,
    href: absoluteUrl(lang, path),
  }));
}

/** Switch language while preserving path (and call-site can append hash). */
export function switchLangPath(currentUrl: URL, target: Lang): string {
  const route = getRouteFromUrl(currentUrl);
  return localizePath(target, route);
}
