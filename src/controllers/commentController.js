const pool = require('../config/db');

// ============================================================
// GET COMMENTS FOR A VIDEO
// ============================================================
exports.getVideoComments = async (req, res, next) => {
  const { videoId } = req.params;
  const userId = req.user?.id || null;

  try {
    // Get all comments for this video (including replies)
    const query = `
      SELECT 
        c.id,
        c.content,
        c.parent_id,
        c.likes_count,
        c.created_at,
        c.updated_at,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.phone,
        CASE WHEN cl.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM video_comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_id = $2
      WHERE c.video_id = $1 AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query, [videoId, userId]);

    // Get replies for each comment
    const commentsWithReplies = [];
    for (const comment of result.rows) {
      const repliesQuery = `
        SELECT 
          r.id,
          r.content,
          r.parent_id,
          r.likes_count,
          r.created_at,
          r.updated_at,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.phone,
          CASE WHEN cl.user_id IS NOT NULL THEN true ELSE false END as is_liked
        FROM video_comments r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN comment_likes cl ON cl.comment_id = r.id AND cl.user_id = $2
        WHERE r.parent_id = $1
        ORDER BY r.created_at ASC
      `;
      const repliesResult = await pool.query(repliesQuery, [comment.id, userId]);
      
      commentsWithReplies.push({
        ...comment,
        replies: repliesResult.rows,
        user: {
          id: comment.user_id,
          firstName: comment.first_name,
          lastName: comment.last_name,
          phone: comment.phone,
        },
      });
    }

    res.json(commentsWithReplies);
  } catch (err) {
    console.error('getVideoComments error:', err);
    next(err);
  }
};

// ============================================================
// CREATE COMMENT OR REPLY
// ============================================================
exports.createComment = async (req, res, next) => {
  const { videoId, houseId, content, parentId } = req.body;
  const userId = req.user.id;

  if (!videoId || !houseId || !content) {
    return res.status(400).json({ error: 'Video ID, House ID na content zinahitajika' });
  }

  try {
    // Check if video exists
    const videoCheck = await pool.query(
      'SELECT id FROM house_videos WHERE id = $1',
      [videoId]
    );
    if (videoCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Video haikupatikana' });
    }

    // If parentId is provided, check if parent comment exists
    if (parentId) {
      const parentCheck = await pool.query(
        'SELECT id FROM video_comments WHERE id = $1',
        [parentId]
      );
      if (parentCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Comment ya msingi haikupatikana' });
      }
    }

    const result = await pool.query(
      `INSERT INTO video_comments (video_id, house_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, content, parent_id, created_at`,
      [videoId, houseId, userId, content, parentId || null]
    );

    const newComment = result.rows[0];

    // Get user info
    const userResult = await pool.query(
      'SELECT id, first_name, last_name, phone FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    res.status(201).json({
      ...newComment,
      user: {
        id: user.id,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
      },
      likes_count: 0,
      is_liked: false,
      replies: [],
    });
  } catch (err) {
    console.error('createComment error:', err);
    next(err);
  }
};

// ============================================================
// DELETE COMMENT (ONLY OWNER OR ADMIN)
// ============================================================
exports.deleteComment = async (req, res, next) => {
  const { commentId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Check if comment exists and user owns it or is admin
    const commentCheck = await pool.query(
      'SELECT user_id FROM video_comments WHERE id = $1',
      [commentId]
    );
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment haikupatikana' });
    }

    if (commentCheck.rows[0].user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Huna ruhusa ya kufuta comment hii' });
    }

    await pool.query('DELETE FROM video_comments WHERE id = $1', [commentId]);
    res.json({ message: 'Comment imefutwa kikamilifu' });
  } catch (err) {
    console.error('deleteComment error:', err);
    next(err);
  }
};

// ============================================================
// TOGGLE LIKE ON COMMENT
// ============================================================
exports.toggleCommentLike = async (req, res, next) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  try {
    // Check if comment exists
    const commentCheck = await pool.query(
      'SELECT id FROM video_comments WHERE id = $1',
      [commentId]
    );
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment haikupatikana' });
    }

    // Check if user already liked this comment
    const likeCheck = await pool.query(
      'SELECT id FROM comment_likes WHERE comment_id = $1 AND user_id = $2',
      [commentId, userId]
    );

    if (likeCheck.rows.length > 0) {
      // Unlike: Remove like
      await pool.query(
        'DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2',
        [commentId, userId]
      );
      await pool.query(
        'UPDATE video_comments SET likes_count = likes_count - 1 WHERE id = $1',
        [commentId]
      );
      res.json({ liked: false, likes_count: -1 });
    } else {
      // Like: Add like
      await pool.query(
        'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)',
        [commentId, userId]
      );
      await pool.query(
        'UPDATE video_comments SET likes_count = likes_count + 1 WHERE id = $1',
        [commentId]
      );
      res.json({ liked: true, likes_count: 1 });
    }
  } catch (err) {
    console.error('toggleCommentLike error:', err);
    next(err);
  }
};

// ============================================================
// TOGGLE LIKE ON VIDEO
// ============================================================
exports.toggleVideoLike = async (req, res, next) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  try {
    // Check if video exists
    const videoCheck = await pool.query(
      'SELECT id FROM house_videos WHERE id = $1',
      [videoId]
    );
    if (videoCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Video haikupatikana' });
    }

    // Check if user already liked this video
    const likeCheck = await pool.query(
      'SELECT id FROM video_likes WHERE video_id = $1 AND user_id = $2',
      [videoId, userId]
    );

    if (likeCheck.rows.length > 0) {
      await pool.query(
        'DELETE FROM video_likes WHERE video_id = $1 AND user_id = $2',
        [videoId, userId]
      );
      res.json({ liked: false });
    } else {
      await pool.query(
        'INSERT INTO video_likes (video_id, user_id) VALUES ($1, $2)',
        [videoId, userId]
      );
      res.json({ liked: true });
    }
  } catch (err) {
    console.error('toggleVideoLike error:', err);
    next(err);
  }
};

// ============================================================
// GET VIDEO LIKE STATUS AND COUNT
// ============================================================
exports.getVideoLikeStatus = async (req, res, next) => {
  const { videoId } = req.params;
  const userId = req.user?.id || null;

  try {
    // Get total likes count
    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM video_likes WHERE video_id = $1',
      [videoId]
    );
    const likesCount = parseInt(countResult.rows[0].count);

    let isLiked = false;
    if (userId) {
      const likeCheck = await pool.query(
        'SELECT id FROM video_likes WHERE video_id = $1 AND user_id = $2',
        [videoId, userId]
      );
      isLiked = likeCheck.rows.length > 0;
    }

    res.json({ likes_count: likesCount, is_liked: isLiked });
  } catch (err) {
    console.error('getVideoLikeStatus error:', err);
    next(err);
  }
};

// ============================================================
// GET ALL COMMENTS FOR A HOUSE
// ============================================================
exports.getHouseComments = async (req, res, next) => {
  const { houseId } = req.params;
  const userId = req.user?.id || null;

  try {
    const query = `
      SELECT 
        c.id,
        c.content,
        c.parent_id,
        c.likes_count,
        c.created_at,
        c.updated_at,
        u.id as user_id,
        u.first_name,
        u.last_name,
        u.phone,
        CASE WHEN cl.user_id IS NOT NULL THEN true ELSE false END as is_liked
      FROM video_comments c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN comment_likes cl ON cl.comment_id = c.id AND cl.user_id = $2
      WHERE c.house_id = $1 AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
    `;
    const result = await pool.query(query, [houseId, userId]);

    const commentsWithReplies = [];
    for (const comment of result.rows) {
      const repliesQuery = `
        SELECT 
          r.id,
          r.content,
          r.parent_id,
          r.likes_count,
          r.created_at,
          r.updated_at,
          u.id as user_id,
          u.first_name,
          u.last_name,
          u.phone,
          CASE WHEN cl.user_id IS NOT NULL THEN true ELSE false END as is_liked
        FROM video_comments r
        JOIN users u ON r.user_id = u.id
        LEFT JOIN comment_likes cl ON cl.comment_id = r.id AND cl.user_id = $2
        WHERE r.parent_id = $1
        ORDER BY r.created_at ASC
      `;
      const repliesResult = await pool.query(repliesQuery, [comment.id, userId]);
      
      commentsWithReplies.push({
        ...comment,
        replies: repliesResult.rows,
        user: {
          id: comment.user_id,
          firstName: comment.first_name,
          lastName: comment.last_name,
          phone: comment.phone,
        },
      });
    }

    res.json(commentsWithReplies);
  } catch (err) {
    console.error('getHouseComments error:', err);
    next(err);
  }
};