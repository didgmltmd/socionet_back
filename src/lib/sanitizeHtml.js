const sanitizeHtml = (input = '') => {
  if (!input || typeof input !== 'string') {
    return ''
  }

  const allowedTags = new Set([
    'p',
    'br',
    'h2',
    'h3',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'a',
    'img',
    'strong',
    'em',
    'u',
    'hr',
  ])

  const allowedAttrs = {
    a: new Set(['href', 'target', 'rel']),
    img: new Set(['src', 'alt']),
  }

  const escapeHtml = (value) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')

  const isSafeUrl = (value) => {
    const trimmed = value.trim()
    return (
      /^https?:/i.test(trimmed) ||
      /^mailto:/i.test(trimmed) ||
      /^tel:/i.test(trimmed) ||
      /^\//.test(trimmed)
    )
  }

  let output = input

  output = output.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')

  const tagRegex = /<\/?([a-z0-9-]+)([^>]*)>/gi
  output = output.replace(tagRegex, (match, tagName, rawAttrs) => {
    const name = tagName.toLowerCase()
    if (!allowedTags.has(name)) {
      return ''
    }

    const isClosing = match.startsWith('</')
    if (isClosing) {
      return `</${name}>`
    }

    if (!rawAttrs || !rawAttrs.trim()) {
      return `<${name}>`
    }

    const attrs = []
    const attrRegex = /([a-z0-9:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/gi
    let attrMatch
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase()
      const attrValue = attrMatch[2] || attrMatch[3] || attrMatch[4] || ''

      if (attrName.startsWith('on')) {
        continue
      }
      if (attrName === 'style' || attrName.startsWith('data-')) {
        continue
      }

      const allowedForTag = allowedAttrs[name]
      if (!allowedForTag || !allowedForTag.has(attrName)) {
        continue
      }

      if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(attrValue)) {
        continue
      }

      if (attrName === 'target' && attrValue !== '_blank') {
        continue
      }

      const safeValue = escapeHtml(attrValue)
      attrs.push(`${attrName}="${safeValue}"`)
    }

    if (!attrs.length) {
      return `<${name}>`
    }

    return `<${name} ${attrs.join(' ')}>`
  })

  return output
}

module.exports = sanitizeHtml
