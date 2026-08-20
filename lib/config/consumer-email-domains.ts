/**
 * Consumer mailbox providers. A company "domain" that is one of these proves
 * nothing about employment — anyone can register a gmail.com address — so
 * verification never accepts one as a business domain, and recruiter
 * onboarding does not prefill from one.
 *
 * Editable without touching code; extend freely.
 */
export const CONSUMER_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "yandex.ru",
  "qq.com",
  "163.com",
  "126.com",
  "naver.com",
  "hanmail.net",
  "daum.net",
  "rediffmail.com",
  "wp.pl",
  "o2.pl",
  "onet.pl",
  "interia.pl",
  "web.de",
  "t-online.de",
  "orange.fr",
  "free.fr",
  "libero.it",
  "seznam.cz",
  "hotmail.co.uk",
  "yahoo.co.uk",
  "btinternet.com",
  "sbcglobal.net",
  "comcast.net",
  "verizon.net",
  "att.net",
  "cox.net",
  "shaw.ca",
  "rogers.com",
  "bigpond.com",
  "optusnet.com.au",
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
]);

export const isConsumerEmailDomain = (domain: string): boolean =>
  CONSUMER_EMAIL_DOMAINS.has(domain.trim().toLowerCase());

/**
 * Public suffixes nobody can own. Claiming one as a "company domain" would
 * otherwise satisfy the subdomain rule from any mailbox under it — e.g.
 * claiming "co.uk" and signing in as jane@yahoo.co.uk. A short list of the
 * common multi-label suffixes plus every single-label TLD (rejected by rule).
 */
const PUBLIC_SUFFIXES: ReadonlySet<string> = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au", "id.au",
  "co.nz", "net.nz", "org.nz", "govt.nz",
  "co.za", "org.za", "web.za", "net.za",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "co.kr", "or.kr", "ne.kr",
  "co.in", "net.in", "org.in", "gen.in", "firm.in", "ind.in",
  "com.br", "net.br", "org.br", "gov.br",
  "com.mx", "com.ar", "com.co", "com.pe", "com.ve",
  "com.cn", "net.cn", "org.cn", "gov.cn",
  "com.hk", "com.sg", "com.my", "com.ph", "com.vn", "com.tw",
  "com.tr", "com.ua", "com.pl", "com.ru", "com.eg", "com.sa", "com.pk",
  "com.ng", "com.gh", "co.ke", "co.il", "co.id", "co.th",
  "com.es", "com.pt", "com.it", "com.de", "com.fr", "com.gr",
  "gov.in", "nic.in", "edu.in", "res.in",
  "on.ca", "qc.ca", "ab.ca", "bc.ca",
]);

/**
 * True when `domain` is something nobody can own as a company: a bare TLD
 * ("com") or a known public suffix ("co.uk"). Verification must never accept
 * one as proof of a business domain.
 */
export const isPublicSuffix = (domain: string): boolean => {
  const d = domain.trim().toLowerCase().replace(/\.+$/, "");
  if (d === "") return true;
  if (!d.includes(".")) return true; // a bare TLD
  return PUBLIC_SUFFIXES.has(d);
};
