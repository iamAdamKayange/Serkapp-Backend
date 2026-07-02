const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  getVideoComments,
  createComment,
  deleteComment,
  toggleCommentLike,
  toggleVideoLike,
  getVideoLikeStatus,
  getHouseComments,
} = require('../controllers/commentController');

const router = express.Router();

// ==================== PUBLIC ROUTES ====================
router.get('/video/:videoId', getVideoComments);
router.get('/video/:videoId/like-status', getVideoLikeStatus);
router.get('/house/:houseId', getHouseComments);

// ==================== PROTECTED ROUTES ====================
router.post('/', authMiddleware, createComment);
router.delete('/:commentId', authMiddleware, deleteComment);
router.post('/:commentId/like', authMiddleware, toggleCommentLike);
router.post('/video/:videoId/like', authMiddleware, toggleVideoLike);

module.exports = router;