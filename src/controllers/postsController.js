const prisma = require('../lib/prisma')

const allowedCategories = new Set(['NOTICE', 'ACTIVITY'])

async function listPosts(req, res) {
  const { category, limit } = req.query
  const where = {
    isPublished: true,
    ...(category && allowedCategories.has(category) ? { category } : {}),
  }

  const take = limit ? Math.min(Number(limit) || 0, 50) : undefined

  const posts = await prisma.post.findMany({
    where,
    orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
    take: take || undefined,
  })

  return res.json({ posts })
}

async function getPost(req, res) {
  const { id } = req.params
  const skipIncrement = req.query.increment === 'false'
  const post = await prisma.post.findFirst({
    where: {
      id,
      isPublished: true,
    },
  })

  if (!post) {
    return res.status(404).json({ message: 'Not found' })
  }

  if (skipIncrement) {
    return res.json({ post })
  }

  const updated = await prisma.post.update({
    where: { id: post.id },
    data: {
      views: { increment: 1 },
    },
  })

  return res.json({ post: updated })
}

module.exports = {
  listPosts,
  getPost,
}
