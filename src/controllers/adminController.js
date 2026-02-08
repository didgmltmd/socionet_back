const prisma = require('../lib/prisma')
const supabase = require('../lib/supabase')
const fs = require('fs')
const crypto = require('crypto')
const path = require('path')
const os = require('os')
const jwt = require('jsonwebtoken')
const { spawn } = require('child_process')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const ffmpegPath = require('ffmpeg-static')
const ffprobePath = require('ffprobe-static').path

const allowedRoles = new Set([
  'BEGINNER',
  'INTERMEDIATE',
  'ADVANCED',
  'INSTRUCTOR',
  'ADMIN',
])

const allowedStatuses = new Set(['PENDING', 'APPROVED', 'REJECTED'])
const storageBucket = process.env.SUPABASE_STORAGE_BUCKET
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET
const encodeJobs = new Map()

const createJobId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'))

const updateEncodeJob = (jobId, patch) => {
  const job = encodeJobs.get(jobId)
  if (!job) return
  encodeJobs.set(jobId, { ...job, ...patch, updatedAt: Date.now() })
}

const scheduleJobCleanup = (jobId, delayMs = 1000 * 60 * 60) => {
  setTimeout(() => encodeJobs.delete(jobId), delayMs).unref?.()
}

const runProcess = (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(stderr || 'Process failed'))
    })
  })

const probeVideo = async (filePath) => {
  if (!ffprobePath) {
    throw new Error('ffprobe is not available')
  }
  const { stdout } = await runProcess(ffprobePath, [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    filePath,
  ])
  const data = JSON.parse(stdout || '{}')
  const stream = Array.isArray(data.streams) ? data.streams[0] : null
  const duration = data.format && data.format.duration ? Number(data.format.duration) : null
  return {
    width: stream?.width || null,
    height: stream?.height || null,
    durationSeconds: duration && Number.isFinite(duration) ? Math.floor(duration) : null,
  }
}

const encodeVideo = async (inputPath, outputPath, targetHeight, durationSeconds, onProgress) => {
  if (!ffmpegPath) {
    throw new Error('ffmpeg is not available')
  }
  await new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i',
      inputPath,
      '-vf',
      `scale=-2:${targetHeight}`,
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '28',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-nostats',
      outputPath,
    ]
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      lines.forEach((line) => {
        const trimmed = line.trim()
        if (!trimmed) return
        if (trimmed.startsWith('out_time_ms=')) {
          const value = Number(trimmed.replace('out_time_ms=', ''))
          if (Number.isFinite(value) && durationSeconds && durationSeconds > 0) {
            const progress = Math.min(
              95,
              Math.round((value / (durationSeconds * 1000000)) * 100),
            )
            if (typeof onProgress === 'function') {
              onProgress(progress)
            }
          }
        }
      })
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr || 'Encoding failed'))
    })
  })
}

const streamToFile = async (body, filePath) => {
  if (!body) {
    throw new Error('No response body')
  }
  const readable = typeof body.pipe === 'function' ? body : Readable.fromWeb(body)
  await pipeline(readable, fs.createWriteStream(filePath))
}

async function listUsers(req, res) {
  const status = req.query.status
  const where = status && allowedStatuses.has(status) ? { status } : {}

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })

  return res.json({ users })
}

async function updateUserStatus(req, res) {
  const { id } = req.params
  const { status, role } = req.body || {}

  if (!status && !role) {
    return res.status(400).json({ message: 'status or role is required' })
  }

  if (status && !allowedStatuses.has(status)) {
    return res.status(400).json({ message: 'Invalid status' })
  }

  if (role && !allowedRoles.has(role)) {
    return res.status(400).json({ message: 'Invalid role' })
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(status ? { status } : {}),
      ...(role ? { role } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
    },
  })

  return res.json({ user })
}

async function deleteUser(req, res) {
  const { id } = req.params

  await prisma.user.delete({ where: { id } })

  return res.status(204).send()
}

async function createVideo(req, res) {
  const { title, description, storagePath, requiredRole, isPublished, durationSeconds } = req.body

  if (!title || !storagePath || !requiredRole) {
    return res.status(400).json({ message: 'title, storagePath, requiredRole are required' })
  }

  if (!allowedRoles.has(requiredRole)) {
    return res.status(400).json({ message: 'Invalid requiredRole' })
  }

  const video = await prisma.video.create({
    data: {
      title,
      description,
      storagePath,
      requiredRole,
      isPublished: Boolean(isPublished),
      durationSeconds: Number.isFinite(Number(durationSeconds))
        ? Math.max(0, Math.floor(Number(durationSeconds)))
        : null,
      uploadedById: req.user.id,
    },
  })

  return res.status(201).json({ video })
}

async function uploadVideo(req, res) {
  const { title, description, requiredRole, isPublished } = req.body || {}

  if (!storageBucket) {
    return res.status(500).json({ message: 'Storage bucket not configured' })
  }

  if (!req.file) {
    return res.status(400).json({ message: 'file is required' })
  }

  if (!title || !requiredRole) {
    return res.status(400).json({ message: 'title and requiredRole are required' })
  }

  if (!allowedRoles.has(requiredRole)) {
    return res.status(400).json({ message: 'Invalid requiredRole' })
  }

  if (!req.file.mimetype.startsWith('video/')) {
    return res.status(400).json({ message: 'Invalid file type' })
  }

  const inputPath = req.file.path
  let uploadedPath = null

  try {
    const metadata = await probeVideo(inputPath)
    const safeName = req.file.originalname
      ? path.basename(req.file.originalname).replace(/[^a-zA-Z0-9._-]/g, '-')
      : `video-${Date.now()}${path.extname(req.file.originalname || '') || '.mp4'}`
    const ext = path.extname(safeName) || '.mp4'
    const storagePath = `videos/${Date.now()}-${safeName.replace(/\.\w+$/, '')}${ext}`

    const { data, error } = await supabase.storage
      .from(storageBucket)
      .createSignedUploadUrl(storagePath)

    if (error) {
      throw new Error(error.message)
    }

    const stream = fs.createReadStream(inputPath)
    const body = Readable.toWeb ? Readable.toWeb(stream) : stream
    const response = await fetch(data.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': req.file.mimetype || 'video/mp4' },
      body,
      duplex: 'half',
    })

    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Failed to upload video')
    }

    uploadedPath = data.path

    const video = await prisma.video.create({
      data: {
        title,
        description: description || null,
        storagePath: uploadedPath,
        requiredRole,
        isPublished: String(isPublished).toLowerCase() === 'true',
        durationSeconds: metadata.durationSeconds,
        uploadedById: req.user.id,
      },
    })

    return res.status(201).json({ video })
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Upload failed' })
  } finally {
    await Promise.allSettled([fs.promises.unlink(inputPath)])
  }
}

async function listVideos(req, res) {
  const videos = await prisma.video.findMany({
    orderBy: { createdAt: 'desc' },
  })

  return res.json({ videos })
}

async function deleteVideo(req, res) {
  const { id } = req.params

  await prisma.video.delete({ where: { id } })

  return res.status(204).send()
}

async function updateVideo(req, res) {
  const { id } = req.params
  const { title, description, requiredRole, isPublished, durationSeconds } = req.body || {}

  if (
    !title &&
    description === undefined &&
    !requiredRole &&
    typeof isPublished !== 'boolean' &&
    durationSeconds === undefined
  ) {
    return res.status(400).json({ message: 'No fields to update' })
  }

  if (requiredRole && !allowedRoles.has(requiredRole)) {
    return res.status(400).json({ message: 'Invalid requiredRole' })
  }

  const video = await prisma.video.update({
    where: { id },
    data: {
      ...(title ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(requiredRole ? { requiredRole } : {}),
      ...(typeof isPublished === 'boolean' ? { isPublished } : {}),
      ...(durationSeconds !== undefined
        ? {
            durationSeconds: Number.isFinite(Number(durationSeconds))
              ? Math.max(0, Math.floor(Number(durationSeconds)))
              : null,
          }
        : {}),
    },
  })

  return res.json({ video })
}

async function createUploadUrl(req, res) {
  const { filePath } = req.body

  if (!storageBucket) {
    return res.status(500).json({ message: 'Storage bucket not configured' })
  }

  if (!filePath) {
    return res.status(400).json({ message: 'filePath is required' })
  }

  if (!filePath.startsWith('videos/')) {
    return res.status(400).json({ message: 'Invalid filePath' })
  }

  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUploadUrl(filePath)

  if (error) {
    return res.status(500).json({ message: error.message })
  }

  return res.json({
    uploadUrl: data.signedUrl,
    path: data.path,
  })
}

async function createTusToken(req, res) {
  if (!supabaseJwtSecret) {
    return res.status(500).json({ message: 'SUPABASE_JWT_SECRET is required' })
  }

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    app_role: 'ADMIN',
    sub: req.user?.id,
    email: req.user?.email,
    iat: now,
    iss: 'supabase',
  }

  const token = jwt.sign(payload, supabaseJwtSecret, { expiresIn: '6h' })
  return res.json({ token })
}

async function encodeUploadedVideo(req, res) {
  const { title, description, requiredRole, isPublished, storagePath } = req.body || {}

  if (!storageBucket) {
    return res.status(500).json({ message: 'Storage bucket not configured' })
  }

  if (!title || !requiredRole || !storagePath) {
    return res
      .status(400)
      .json({ message: 'title, requiredRole, storagePath are required' })
  }

  if (!allowedRoles.has(requiredRole)) {
    return res.status(400).json({ message: 'Invalid requiredRole' })
  }

  if (!storagePath.startsWith('videos/')) {
    return res.status(400).json({ message: 'Invalid storagePath' })
  }

  const jobId = createJobId()
  encodeJobs.set(jobId, {
    id: jobId,
    status: 'queued',
    progress: 0,
    message: '대기중',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  })

  res.status(202).json({ jobId })

  setImmediate(async () => {
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'socionet-encode-'))
    const inputExt = path.extname(storagePath) || '.mp4'
    const inputPath = path.join(tempDir, `source-${Date.now()}${inputExt}`)
    const outputPath = path.join(tempDir, `encoded-${Date.now()}.mp4`)

    updateEncodeJob(jobId, { status: 'processing', progress: 5, message: '다운로드 중' })
    try {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(storageBucket)
        .createSignedUrl(storagePath, 60 * 60)

      if (signedError) {
        throw new Error(signedError.message)
      }

      if (!signedData?.signedUrl) {
        throw new Error('Failed to create signed url')
      }

      const downloadResponse = await fetch(signedData.signedUrl)
      if (!downloadResponse.ok) {
        const message = await downloadResponse.text()
        throw new Error(message || 'Failed to download video')
      }
      await streamToFile(downloadResponse.body, inputPath)

      updateEncodeJob(jobId, { status: 'encoding', progress: 30, message: '인코딩 중' })
      const metadata = await probeVideo(inputPath)
      const sourceHeight = metadata.height || 0
      const targetHeight = sourceHeight >= 720 ? 720 : 480

      await encodeVideo(inputPath, outputPath, targetHeight, metadata.durationSeconds, (progress) => {
        updateEncodeJob(jobId, { status: 'encoding', progress, message: '인코딩 중' })
      })

      updateEncodeJob(jobId, { status: 'uploading', progress: 90, message: '업로드 중' })
      const encodedMeta = await probeVideo(outputPath)
      const baseName = path.basename(storagePath).replace(/\.[^.]+$/, '')
      const encodedPath = `videos/encoded-${Date.now()}-${baseName}.mp4`

      const { data: uploadData, error: uploadUrlError } = await supabase.storage
        .from(storageBucket)
        .createSignedUploadUrl(encodedPath)

      if (uploadUrlError) {
        throw new Error(uploadUrlError.message)
      }

      const uploadStream = fs.createReadStream(outputPath)
      const uploadBody = Readable.toWeb ? Readable.toWeb(uploadStream) : uploadStream
      const uploadResponse = await fetch(uploadData.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4' },
        body: uploadBody,
        duplex: 'half',
      })

      if (!uploadResponse.ok) {
        const message = await uploadResponse.text()
        throw new Error(message || 'Failed to upload encoded video')
      }

      await supabase.storage.from(storageBucket).remove([storagePath])

      const video = await prisma.video.create({
        data: {
          title,
          description: description || null,
          storagePath: encodedPath,
          requiredRole,
          isPublished: String(isPublished).toLowerCase() === 'true',
          durationSeconds: encodedMeta.durationSeconds,
          uploadedById: req.user.id,
        },
      })

      updateEncodeJob(jobId, {
        status: 'done',
        progress: 100,
        message: '완료',
        videoId: video.id,
      })
      scheduleJobCleanup(jobId)
    } catch (error) {
      updateEncodeJob(jobId, {
        status: 'error',
        message: error.message || 'Encoding failed',
      })
      scheduleJobCleanup(jobId)
    } finally {
      await Promise.allSettled([
        fs.promises.unlink(inputPath),
        fs.promises.unlink(outputPath),
        fs.promises.rm(tempDir, { recursive: true, force: true }),
      ])
    }
  })
}

async function getEncodeStatus(req, res) {
  const { id } = req.params
  const job = encodeJobs.get(id)
  if (!job) {
    return res.status(404).json({ message: 'Job not found' })
  }
  res.set('Cache-Control', 'no-store')
  res.set('Pragma', 'no-cache')
  return res.json({ job })
}

module.exports = {
  listUsers,
  updateUserStatus,
  deleteUser,
  createVideo,
  listVideos,
  deleteVideo,
  updateVideo,
  createUploadUrl,
  encodeUploadedVideo,
  getEncodeStatus,
  uploadVideo,
  createTusToken,
}
