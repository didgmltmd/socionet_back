require('dotenv').config()
const express = require('express')
const cors = require('cors')

const authRoutes = require('./routes/auth')
const adminRoutes = require('./routes/admin')
const videoRoutes = require('./routes/videos')
const postRoutes = require('./routes/posts')

const app = express()

app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
)
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/auth', authRoutes)
app.use('/admin', adminRoutes)
app.use('/videos', videoRoutes)
app.use('/posts', postRoutes)

module.exports = app
