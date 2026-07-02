const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Import all controllers
const commentController = require('../controllers/commentController');

// ==================== PUBLIC ROUTES ====================
router.get('/video/:videoId', commentController.getVideoComments);
router.get('/video/:videoId/like-status', commentController.getVideoLikeStatus);
router.get('/house/:houseId', commentController.getHouseComments);

// ==================== PROTECTED ROUTES ====================
router.post('/', authMiddleware, commentController.createComment);
router.delete('/:commentId', authMiddleware, commentController.deleteComment);
router.post('/:commentId/like', authMiddleware, commentController.toggleCommentLike);
router.post('/video/:videoId/like', authMiddleware, commentController.toggleVideoLike);

module.exports = router;