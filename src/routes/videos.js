const express = require('express')
const videosController = require('../controllers/videosController')
const auth = require('../middleware/auth')

const router = express.Router()

router.get('/', auth, videosController.listVideos)
router.get('/:id', auth, videosController.getVideo)
router.patch('/:id/progress', auth, videosController.setProgress)

module.exports = router
