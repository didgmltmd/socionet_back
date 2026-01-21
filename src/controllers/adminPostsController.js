const prisma = require('../lib/prisma')
const supabase = require('../lib/supabase')
const sanitizeHtml = require('../lib/sanitizeHtml')

const allowedCategories = new Set(['NOTICE', 'ACTIVITY'])
const postsBucket = process.env.SUPABASE_POSTS_BUCKET || process.env.SUPABASE_STORAGE_BUCKET

async function listPosts(_req, res) {
  const posts = await prisma.post.findMany({
    orderBy: { publishedAt: 'desc' },
  })

  return res.json({ posts })
}

async function createPost(req, res) {
  const { title, content, category, isPinned } = req.body || {}
  const sanitizedContent = content !== undefined ? sanitizeHtml(content) : undefined

  if (!title || !category) {
    return res.status(400).json({ message: 'title and category are required' })
  }

  if (!allowedCategories.has(category)) {
    return res.status(400).json({ message: 'Invalid category' })
  }

  const post = await prisma.post.create({
    data: {
      title,
      content: sanitizedContent,
      category,
      isPublished: true,
      isPinned: Boolean(isPinned),
    },
  })

  return res.status(201).json({ post })
}

async function updatePost(req, res) {
  const { id } = req.params
  const { title, content, category, isPinned } = req.body || {}
  const sanitizedContent = content !== undefined ? sanitizeHtml(content) : undefined

  if (
    title === undefined &&
    content === undefined &&
    category === undefined &&
    isPinned === undefined
  ) {
    return res.status(400).json({ message: 'No fields to update' })
  }

  if (category && !allowedCategories.has(category)) {
    return res.status(400).json({ message: 'Invalid category' })
  }

  const post = await prisma.post.update({
    where: { id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(content !== undefined ? { content: sanitizedContent } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(isPinned !== undefined ? { isPinned: Boolean(isPinned) } : {}),
      isPublished: true,
    },
  })

  return res.json({ post })
}

async function deletePost(req, res) {
  const { id } = req.params

  await prisma.post.delete({ where: { id } })

  return res.status(204).send()
}

async function createImageUploadUrl(req, res) {
  const { filePath } = req.body || {}

  if (!postsBucket) {
    return res.status(500).json({ message: 'Storage bucket not configured' })
  }

  if (!filePath) {
    return res.status(400).json({ message: 'filePath is required' })
  }

  const { data, error } = await supabase.storage
    .from(postsBucket)
    .createSignedUploadUrl(filePath)

  if (error) {
    return res.status(500).json({ message: error.message })
  }

  const { data: publicData } = supabase.storage
    .from(postsBucket)
    .getPublicUrl(filePath)

  return res.json({
    uploadUrl: data.signedUrl,
    path: data.path,
    publicUrl: publicData.publicUrl,
  })
}

module.exports = {
  listPosts,
  createPost,
  updatePost,
  deletePost,
  createImageUploadUrl,
}
