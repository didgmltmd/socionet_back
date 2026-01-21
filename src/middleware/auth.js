const jwt = require('jsonwebtoken')

const getCookieToken = (req) => {
  const header = req.headers.cookie || ''
  if (!header) {
    return null
  }
  const parts = header.split(';')
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=')
    if (!rawKey) {
      continue
    }
    const key = rawKey.trim()
    if (key !== 'socionet_token') {
      continue
    }
    return decodeURIComponent(rest.join('='))
  }
  return null
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : null
  const cookieToken = getCookieToken(req)
  const token = cookieToken || bearerToken

  if (!token) {
    return res.status(401).json({ message: 'Missing token' })
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    if (payload.status && payload.status !== 'APPROVED') {
      return res.status(403).json({ message: 'Account not approved' })
    }
    req.user = payload
    return next()
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' })
  }
}

module.exports = authMiddleware
