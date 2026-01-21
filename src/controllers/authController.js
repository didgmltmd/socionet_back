const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const prisma = require('../lib/prisma')

const allowedRoles = new Set([
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'INSTRUCTOR',
])

async function register(req, res) {
  const { email, password, name, role, phone } = req.body

  if (!email || !password || !role) {
    return res.status(400).json({ message: 'Email, password, and role are required' })
  }

  if (!allowedRoles.has(role)) {
    return res.status(400).json({ message: 'Invalid role' })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return res.status(409).json({ message: 'Email already in use' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      email,
      name,
      phone,
      passwordHash,
      role,
      status: 'PENDING',
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
  })

  return res.status(201).json({
    message: 'Registration submitted for approval',
    user,
  })
}

async function login(req, res) {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' })
  }

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  if (user.status !== 'APPROVED') {
    return res.status(403).json({ message: 'Account not approved' })
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, status: user.status },
    process.env.JWT_SECRET,
    { expiresIn: '7d' },
  )

  const secure = process.env.NODE_ENV === 'production'
  const sameSite = secure ? 'none' : 'lax'
  res.cookie('socionet_token', token, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
    },
  })
}

async function logout(req, res) {
  const secure = process.env.NODE_ENV === 'production'
  const sameSite = secure ? 'none' : 'lax'
  res.cookie('socionet_token', '', {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: 0,
  })
  return res.status(204).send()
}

async function me(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
    },
  })

  return res.json({ user })
}

module.exports = {
  register,
  login,
  logout,
  me,
}
