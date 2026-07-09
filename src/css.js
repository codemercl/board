// Parses a CSS declaration string ("color:red;padding:4px") into a React style
// object. Lets us copy the design's inline styles verbatim while staying 1:1.
// Handles vendor prefixes: "-webkit-line-clamp" -> "WebkitLineClamp".
export function css(str) {
  const out = {}
  if (!str) return out
  for (const part of str.split(';')) {
    const i = part.indexOf(':')
    if (i === -1) continue
    const key = part.slice(0, i).trim()
    const val = part.slice(i + 1).trim()
    if (!key || !val) continue
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    out[camel] = val
  }
  return out
}
