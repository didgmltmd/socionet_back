const prisma = require('../lib/prisma')
const supabase = require('../lib/supabase')

const storageBucket = process.env.SUPABASE_STORAGE_BUCKET

async function listVideos(req, res) {
  const { role } = req.user

  const where = role === 'ADMIN'
    ? {}
    : { isPublished: true, requiredRole: role }

  const videos = await prisma.video.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  const progress = await prisma.videoProgress.findMany({
    where: {
      userId: req.user.id,
      videoId: { in: videos.map((video) => video.id) },
    },
    select: {
      videoId: true,
      completed: true,
    },
  })

  const progressById = new Map(progress.map((item) => [item.videoId, item.completed]))

  return res.json({
    videos: videos.map((video) => ({
      ...video,
      completed: progressById.get(video.id) || false,
    })),
  })
}

async function getVideo(req, res) {
  const { role } = req.user
  const { id } = req.params

  const video = await prisma.video.findUnique({ where: { id } })
  if (!video) {
    return res.status(404).json({ message: 'Not found' })
  }

  const canView = role === 'ADMIN' || (video.isPublished && video.requiredRole === role)
  if (!canView) {
    return res.status(403).json({ message: 'Forbidden' })
  }

  const progress = await prisma.videoProgress.findUnique({
    where: {
      userId_videoId: {
        userId: req.user.id,
        videoId: id,
      },
    },
    select: {
      completed: true,
    },
  })

  if (!storageBucket) {
    return res.json({
      video: {
        ...video,
        completed: progress?.completed || false,
      },
    })
  }

  const { data, error } = await supabase.storage
    .from(storageBucket)
    .createSignedUrl(video.storagePath, 60 * 60)

  if (error) {
    return res.status(500).json({ message: error.message })
  }

  return res.json({
    video: {
      ...video,
      signedUrl: data.signedUrl,
      completed: progress?.completed || false,
    },
  })
}

async function setProgress(req, res) {
  const { id } = req.params
  const { completed } = req.body || {}

  if (typeof completed !== 'boolean') {
    return res.status(400).json({ message: 'completed is required' })
  }

  const progress = await prisma.videoProgress.upsert({
    where: {
      userId_videoId: {
        userId: req.user.id,
        videoId: id,
      },
    },
    update: {
      completed,
      completedAt: completed ? new Date() : null,
    },
    create: {
      userId: req.user.id,
      videoId: id,
      completed,
      completedAt: completed ? new Date() : null,
    },
    select: {
      videoId: true,
      completed: true,
    },
  })

  return res.json({ progress })
}

module.exports = {
  listVideos,
  getVideo,
  setProgress,
}
