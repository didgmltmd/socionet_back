const express = require('express')
const fs = require('fs')
const os = require('os')
const path = require('path')
const multer = require('multer')
const adminController = require('../controllers/adminController')
const adminPostsController = require('../controllers/adminPostsController')
const auth = require('../middleware/auth')
const requireAdmin = require('../middleware/requireAdmin')

const router = express.Router()
const uploadDir = path.join(os.tmpdir(), 'socionet-uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}
const upload = multer({ dest: uploadDir })

router.get('/users', auth, requireAdmin, adminController.listUsers)
router.patch('/users/:id', auth, requireAdmin, adminController.updateUserStatus)
router.delete('/users/:id', auth, requireAdmin, adminController.deleteUser)
router.get('/videos', auth, requireAdmin, adminController.listVideos)
router.post('/videos', auth, requireAdmin, adminController.createVideo)
router.patch('/videos/:id', auth, requireAdmin, adminController.updateVideo)
router.delete('/videos/:id', auth, requireAdmin, adminController.deleteVideo)
router.post('/videos/upload-url', auth, requireAdmin, adminController.createUploadUrl)
router.post(
  '/videos/upload',
  auth,
  requireAdmin,
  upload.single('file'),
  adminController.uploadVideo,
)

router.get('/posts', auth, requireAdmin, adminPostsController.listPosts)
router.post('/posts', auth, requireAdmin, adminPostsController.createPost)
router.patch('/posts/:id', auth, requireAdmin, adminPostsController.updatePost)
router.delete('/posts/:id', auth, requireAdmin, adminPostsController.deletePost)
router.post('/posts/upload-url', auth, requireAdmin, adminPostsController.createImageUploadUrl)

module.exports = router
