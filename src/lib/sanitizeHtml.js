const sanitizeHtml = (input = '') => {
  if (!input || typeof input !== 'string') {
    return ''
  }

  const allowedTags = new Set([
    'p',
    'br',
    'h2',
    'h3',
    'span',
    'font',
    'blockquote',
    'ul',
    'ol',
    'li',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'colgroup',
    'col',
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
    font: new Set(['color', 'size', 'face']),
    table: new Set(['border', 'cellpadding', 'cellspacing', 'width', 'height', 'bgcolor', 'align']),
    thead: new Set(['align', 'valign']),
    tbody: new Set(['align', 'valign']),
    tr: new Set(['align', 'valign', 'bgcolor']),
    th: new Set(['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'bgcolor']),
    td: new Set(['colspan', 'rowspan', 'width', 'height', 'align', 'valign', 'bgcolor']),
    colgroup: new Set(['span', 'width']),
    col: new Set(['span', 'width']),
  }

  const allowedStyleProps = new Set([
    'color',
    'background',
    'background-color',
    'text-align',
    'font-weight',
    'font-size',
    'line-height',
    'font-family',
    'border',
    'border-color',
    'border-width',
    'border-style',
  ])

  const sanitizeStyle = (value) => {
    if (!value) {
      return ''
    }
    const safeRules = []
    const parts = value.split(';')
    parts.forEach((part) => {
      const [rawProp, ...rawValueParts] = part.split(':')
      if (!rawProp || rawValueParts.length === 0) {
        return
      }
      const prop = rawProp.trim().toLowerCase()
      if (!allowedStyleProps.has(prop)) {
        return
      }
      const rawValue = rawValueParts.join(':').trim()
      if (!rawValue) {
        return
      }
      const valueLower = rawValue.toLowerCase()
      if (
        !/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(valueLower) &&
        !/^rgba?\([\d\s.,%]+\)$/i.test(valueLower) &&
        !/^hsla?\([\d\s.,%]+\)$/i.test(valueLower) &&
        !/^[a-z]+$/i.test(valueLower) &&
        !/^(left|right|center|justify)$/i.test(valueLower) &&
        !(prop === 'font-weight' && /^(normal|bold|[1-9]00)$/i.test(valueLower)) &&
        !(prop === 'font-size' && /^(\d+(\.\d+)?)(px|rem|em|%|pt)$/.test(valueLower)) &&
        !(prop === 'line-height' && /^(\d+(\.\d+)?)(px|rem|em|%|pt)?$/.test(valueLower)) &&
        !(prop === 'font-family' && !/[<>]/.test(rawValue)) &&
        !(prop.startsWith('border') &&
          /^(\d+(\.\d+)?)(px|pt)?\s+(solid|dashed|dotted|double|none)\s+[#a-z0-9(),.\s%-]+$/i.test(rawValue)) &&
        !(prop === 'border-width' && /^(\d+(\.\d+)?)(px|pt)$/.test(valueLower)) &&
        !(prop === 'border-style' && /^(solid|dashed|dotted|double|none)$/i.test(valueLower)) &&
        !(prop === 'border-color' && /^[#a-z0-9(),.\s%-]+$/i.test(rawValue)) &&
        !(prop === 'background' && /^[#a-z0-9(),.\s%-]+$/i.test(rawValue))
      ) {
        return
      }
      safeRules.push(`${prop}: ${valueLower}`)
    })
    return safeRules.join('; ')
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
      if (attrName.startsWith('data-')) {
        continue
      }

      if (attrName === 'style') {
        const safeStyle = sanitizeStyle(attrValue)
        if (safeStyle) {
          attrs.push(`style="${escapeHtml(safeStyle)}"`)
        }
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
