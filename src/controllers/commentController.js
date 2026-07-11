const pool = require('../config/db');
const { emitToAll } = require('../services/socketService');

// ============================================================
// GET COMMENTS FOR A VIDEO
// ============================================================
exports.getVideoComments = async (req, res, next) => {
  const { videoId } = req.params;
  const userId = req.user?.id || null;

  try {
    // Try to find video by ID first, then by URL
    let videoQuery = `
      SELECT id FROM house_videos WHERE id = $1
    `;
    let videoResult = await pool.query(videoQuery, [videoId]);
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url = $1
      `;
      videoResult = await pool.query(videoQuery, [videoId]);
    }
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url LIKE $1
      `;
      videoResult = await pool.query(videoQuery, [`%${videoId}%`]);
    }

    if (videoResult.rows.length === 0) {
      return res.json([]);
    }

    const actualVideoId = videoResult.rows[0].id;

    // Get all comments for this video
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
    const result = await pool.query(query, [actualVideoId, userId]);

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
    console.error('❌ getVideoComments error:', err);
    res.json([]);
  }
};

// ============================================================
// GET HOUSE COMMENTS
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
    console.error('❌ getHouseComments error:', err);
    res.json([]);
  }
};

// ============================================================
// CREATE COMMENT
// ============================================================
exports.createComment = async (req, res, next) => {
  const { videoId, houseId, content, parentId } = req.body;
  const userId = req.user.id;

  if (!videoId || !houseId || !content) {
    return res.status(400).json({ error: 'Video ID, House ID na content zinahitajika' });
  }

  try {
    // Try to find video by ID first, then by URL
    let videoQuery = `
      SELECT id FROM house_videos WHERE id = $1
    `;
    let videoResult = await pool.query(videoQuery, [videoId]);
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url = $1
      `;
      videoResult = await pool.query(videoQuery, [videoId]);
    }
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url LIKE $1
      `;
      videoResult = await pool.query(videoQuery, [`%${videoId}%`]);
    }

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Video haikupatikana' });
    }

    const actualVideoId = videoResult.rows[0].id;

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
      [actualVideoId, houseId, userId, content, parentId || null]
    );

    const newComment = result.rows[0];

    const userResult = await pool.query(
      'SELECT id, first_name, last_name, phone FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    const response = {
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
    };

    emitToAll('comment:created', {
      videoId,
      actualVideoId,
      houseId,
      commentId: newComment.id,
      parentId: parentId || null,
    });

    res.status(201).json(response);
  } catch (err) {
    console.error('❌ createComment error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// DELETE COMMENT
// ============================================================
exports.deleteComment = async (req, res, next) => {
  const { commentId } = req.params;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const commentCheck = await pool.query(
      'SELECT user_id, video_id, house_id, parent_id FROM video_comments WHERE id = $1',
      [commentId]
    );
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment haikupatikana' });
    }

    if (commentCheck.rows[0].user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Huna ruhusa ya kufuta comment hii' });
    }

    const deletedComment = commentCheck.rows[0];
    await pool.query('DELETE FROM video_comments WHERE id = $1', [commentId]);
    emitToAll('comment:deleted', {
      commentId,
      videoId: deletedComment.video_id,
      houseId: deletedComment.house_id,
      parentId: deletedComment.parent_id,
    });
    res.json({ message: 'Comment imefutwa kikamilifu' });
  } catch (err) {
    console.error('❌ deleteComment error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// TOGGLE COMMENT LIKE
// ============================================================
exports.toggleCommentLike = async (req, res, next) => {
  const { commentId } = req.params;
  const userId = req.user.id;

  try {
    const commentCheck = await pool.query(
      'SELECT id, video_id, house_id FROM video_comments WHERE id = $1',
      [commentId]
    );
    if (commentCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Comment haikupatikana' });
    }

    const likeCheck = await pool.query(
      'SELECT id FROM comment_likes WHERE comment_id = $1 AND user_id = $2',
      [commentId, userId]
    );

    if (likeCheck.rows.length > 0) {
      await pool.query(
        'DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2',
        [commentId, userId]
      );
      await pool.query(
        'UPDATE video_comments SET likes_count = likes_count - 1 WHERE id = $1',
        [commentId]
      );
      
      const countResult = await pool.query(
        'SELECT likes_count FROM video_comments WHERE id = $1',
        [commentId]
      );
      
      const response = { 
        liked: false, 
        likes_count: parseInt(countResult.rows[0].likes_count) 
      };
      emitToAll('comment:liked', {
        commentId,
        videoId: commentCheck.rows[0].video_id,
        houseId: commentCheck.rows[0].house_id,
        ...response,
      });
      res.json(response);
    } else {
      await pool.query(
        'INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2)',
        [commentId, userId]
      );
      await pool.query(
        'UPDATE video_comments SET likes_count = likes_count + 1 WHERE id = $1',
        [commentId]
      );
      
      const countResult = await pool.query(
        'SELECT likes_count FROM video_comments WHERE id = $1',
        [commentId]
      );
      
      const response = { 
        liked: true, 
        likes_count: parseInt(countResult.rows[0].likes_count) 
      };
      emitToAll('comment:liked', {
        commentId,
        videoId: commentCheck.rows[0].video_id,
        houseId: commentCheck.rows[0].house_id,
        ...response,
      });
      res.json(response);
    }
  } catch (err) {
    console.error('❌ toggleCommentLike error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// TOGGLE VIDEO LIKE
// ============================================================
exports.toggleVideoLike = async (req, res, next) => {
  const { videoId } = req.params;
  const userId = req.user.id;

  try {
    // Try to find video by ID first, then by URL
    let videoQuery = `
      SELECT id FROM house_videos WHERE id = $1
    `;
    let videoResult = await pool.query(videoQuery, [videoId]);
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url = $1
      `;
      videoResult = await pool.query(videoQuery, [videoId]);
    }
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url LIKE $1
      `;
      videoResult = await pool.query(videoQuery, [`%${videoId}%`]);
    }

    if (videoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const actualVideoId = videoResult.rows[0].id;

    const likeCheck = await pool.query(
      'SELECT id FROM video_likes WHERE video_id = $1 AND user_id = $2',
      [actualVideoId, userId]
    );

    if (likeCheck.rows.length > 0) {
      await pool.query(
        'DELETE FROM video_likes WHERE video_id = $1 AND user_id = $2',
        [actualVideoId, userId]
      );
      
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM video_likes WHERE video_id = $1',
        [actualVideoId]
      );
      
      const response = { 
        liked: false, 
        likes_count: parseInt(countResult.rows[0].count) 
      };
      emitToAll('video:liked', {
        videoId,
        actualVideoId,
        ...response,
      });
      res.json(response);
    } else {
      await pool.query(
        'INSERT INTO video_likes (video_id, user_id) VALUES ($1, $2)',
        [actualVideoId, userId]
      );
      
      const countResult = await pool.query(
        'SELECT COUNT(*) as count FROM video_likes WHERE video_id = $1',
        [actualVideoId]
      );
      
      const response = { 
        liked: true, 
        likes_count: parseInt(countResult.rows[0].count) 
      };
      emitToAll('video:liked', {
        videoId,
        actualVideoId,
        ...response,
      });
      res.json(response);
    }
  } catch (err) {
    console.error('❌ toggleVideoLike error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ============================================================
// GET VIDEO LIKE STATUS
// ============================================================
exports.getVideoLikeStatus = async (req, res, next) => {
  const { videoId } = req.params;
  const userId = req.user?.id || null;

  try {
    // Try to find video by ID first, then by URL
    let videoQuery = `
      SELECT id FROM house_videos WHERE id = $1
    `;
    let videoResult = await pool.query(videoQuery, [videoId]);
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url = $1
      `;
      videoResult = await pool.query(videoQuery, [videoId]);
    }
    
    if (videoResult.rows.length === 0) {
      videoQuery = `
        SELECT id FROM house_videos WHERE video_url LIKE $1
      `;
      videoResult = await pool.query(videoQuery, [`%${videoId}%`]);
    }

    if (videoResult.rows.length === 0) {
      return res.json({ likes_count: 0, is_liked: false });
    }

    const actualVideoId = videoResult.rows[0].id;

    const countResult = await pool.query(
      'SELECT COUNT(*) as count FROM video_likes WHERE video_id = $1',
      [actualVideoId]
    );
    const likesCount = parseInt(countResult.rows[0].count);

    let isLiked = false;
    if (userId) {
      const likeCheck = await pool.query(
        'SELECT id FROM video_likes WHERE video_id = $1 AND user_id = $2',
        [actualVideoId, userId]
      );
      isLiked = likeCheck.rows.length > 0;
    }

    res.json({ likes_count: likesCount, is_liked: isLiked });
  } catch (err) {
    console.error('❌ getVideoLikeStatus error:', err);
    res.json({ likes_count: 0, is_liked: false });
  }
};
