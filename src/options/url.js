// Turns what someone typed into a home or slot URL. A bare domain such as
// "drupal.org" or "drupal.org/project/claro" gets https://, since nearly
// every site uses it. Anything with a scheme ("http://", "about:") is kept.
// Throws a TypeError when the result is not a valid URL.
const HAS_SCHEME = /^([a-z][a-z\d+.-]*:\/\/|about:|data:)/i;

export function normalizeUrl(value) {
  const text = value.trim();
  // Some URL parsers accept spaces in a host; a typed URL never has them.
  if (/\s/.test(text)) throw new TypeError(`"${text}" contains a space`);
  return new URL(HAS_SCHEME.test(text) ? text : `https://${text}`).href;
}
