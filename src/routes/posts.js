const express = require('express')
const postsController = require('../controllers/postsController')

const router = express.Router()

router.get('/', postsController.listPosts)
router.get('/:id', postsController.getPost)

module.exports = router
