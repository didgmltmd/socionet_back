require('dotenv').config()
const express = require('express')
const cors = require('cors')

const authRoutes = require('./routes/auth')
const adminRoutes = require('./routes/admin')
const videoRoutes = require('./routes/videos')
const postRoutes = require('./routes/posts')

const app = express()

app.set('trust proxy', 1)

const defaultOrigins = ['http://localhost:5173']
const originList = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map((value) => value.trim()).filter(Boolean)
  : defaultOrigins

app.use(
  cors({
    origin: originList,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    optionsSuccessStatus: 204,
  }),
)
app.use(express.json({ limit: '5mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/auth', authRoutes)
app.use('/admin', adminRoutes)
app.use('/videos', videoRoutes)
app.use('/posts', postRoutes)

module.exports = app
