const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const generateToken = require('../utils/generateToken');
const { uploadToSpaces, FOLDER_TYPES, deleteFromSpaces } = require('../services/imageUploadService');

const ensureUserProfileColumns = async () => {
  await pool.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_image_url TEXT
  `);
};

// @route POST /api/auth/register
exports.register = async (req, res, next) => {
  const { email, password, firstName, lastName, phone, role } = req.body;
  try {
    await ensureUserProfileColumns();
    // Check if user exists
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Validate role
    const validRoles = ['normal', 'landlord', 'admin'];
    const userRole = validRoles.includes(role) ? role : 'normal';
    
    // Insert user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, phone, role, profile_image_url`,
      [email, passwordHash, firstName, lastName, phone, userRole]
    );
    const user = result.rows[0];
    const token = generateToken(user);
    
    // If registering as landlord, create initial verification records
    if (userRole === 'landlord') {
      await pool.query(
        `INSERT INTO landlord_identity_verification (user_id, full_name, status, created_at)
         VALUES ($1::uuid, $2, 'pending', NOW())`,
        [user.id, `${firstName} ${lastName}`]
      );
      
      await pool.query(
        `INSERT INTO landlord_property_verification (user_id, status, created_at)
         VALUES ($1::uuid, 'pending', NOW())`,
        [user.id]
      );
    }
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        phone: user.phone,
        role: user.role,
        profileImageUrl: user.profile_image_url,
      },
      token,
    });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/auth/login
exports.login = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    await ensureUserProfileColumns();
    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, phone, role, profile_image_url FROM users WHERE email = $1`,
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = generateToken(user);
    res.json({
      message: 'Login successful',
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      role: user.role,
      profileImageUrl: user.profile_image_url,
      token,
    });
  } catch (err) {
    next(err);
  }
};

// @route GET /api/auth/me (protected)
exports.getMe = async (req, res, next) => {
  try {
    await ensureUserProfileColumns();
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, phone, role, profile_image_url, created_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
};

// @route PUT /api/auth/me (protected)
exports.updateMe = async (req, res, next) => {
  const { firstName, lastName, phone } = req.body;
  const avatar = req.file;

  try {
    await ensureUserProfileColumns();
    let profileImageUrl = req.body.profileImageUrl || null;
    if (avatar) {
      const uploaded = await uploadToSpaces(
        avatar.buffer,
        avatar.originalname || 'avatar.jpg',
        avatar.mimetype || 'image/jpeg',
        FOLDER_TYPES.PROFILE_PICTURES
      );
      profileImageUrl = uploaded.url;
    }

    const result = await pool.query(
      `
        UPDATE users
        SET
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          phone = COALESCE($3, phone),
          profile_image_url = COALESCE($4, profile_image_url),
          updated_at = NOW()
        WHERE id = $5::uuid
        RETURNING id, email, first_name, last_name, phone, role, profile_image_url, created_at, updated_at
      `,
      [
        firstName?.trim() || null,
        lastName?.trim() || null,
        phone?.trim() || null,
        profileImageUrl,
        req.user.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

exports.updateMeAvatar = async (req, res, next) => {
  const avatar = req.file;

  if (!avatar) {
    return res.status(400).json({ error: 'Profile image is required' });
  }

  try {
    await ensureUserProfileColumns();
    const uploaded = await uploadToSpaces(
      avatar.buffer,
      avatar.originalname || 'avatar.jpg',
      avatar.mimetype || 'image/jpeg',
      FOLDER_TYPES.PROFILE_PICTURES
    );

    const result = await pool.query(
      `
        UPDATE users
        SET profile_image_url = $1, updated_at = NOW()
        WHERE id = $2::uuid
        RETURNING id, email, first_name, last_name, phone, role, profile_image_url, created_at, updated_at
      `,
      [uploaded.url, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'Profile image updated successfully',
      user: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
};

// @route DELETE /api/auth/me (protected) - Delete Account
exports.deleteAccount = async (req, res, next) => {
  const userId = req.user.id;
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Get user info before deletion
    const userResult = await client.query(
      'SELECT role, profile_image_url FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Role-specific cleanup
    if (user.role === 'landlord') {
      // Delete landlord's houses and their media
      const housesResult = await client.query(
        'SELECT id FROM houses WHERE landlord_id = $1',
        [userId]
      );
      
      for (const house of housesResult.rows) {
        // Delete house images and videos from storage
        const imagesResult = await client.query(
          'SELECT image_url FROM house_images WHERE house_id = $1',
          [house.id]
        );
        for (const image of imagesResult.rows) {
          await deleteFromSpaces(image.image_url);
        }
        
        const videosResult = await client.query(
          'SELECT video_url, thumbnail_url FROM house_videos WHERE house_id = $1',
          [house.id]
        );
        for (const video of videosResult.rows) {
          await deleteFromSpaces(video.video_url);
          if (video.thumbnail_url) {
            await deleteFromSpaces(video.thumbnail_url);
          }
        }
        
        const thumbnailsResult = await client.query(
          'SELECT thumbnail_url FROM house_video_thumbnails WHERE house_id = $1',
          [house.id]
        );
        for (const thumbnail of thumbnailsResult.rows) {
          await deleteFromSpaces(thumbnail.thumbnail_url);
        }
        
        // Delete house records
        await client.query('DELETE FROM house_images WHERE house_id = $1', [house.id]);
        await client.query('DELETE FROM house_videos WHERE house_id = $1', [house.id]);
        await client.query('DELETE FROM house_video_thumbnails WHERE house_id = $1', [house.id]);
        await client.query('DELETE FROM houses WHERE id = $1', [house.id]);
      }
      
      // Delete verification records
      await client.query('DELETE FROM landlord_identity_verification WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM landlord_property_verification WHERE user_id = $1', [userId]);
    }
    
    // Common cleanup for all roles
    // Delete profile image from storage
    if (user.profile_image_url) {
      await deleteFromSpaces(user.profile_image_url);
    }
    
    // Delete user-related data
    await client.query('DELETE FROM app_device_tokens WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM app_notifications WHERE target_user_id = $1', [userId]);
    await client.query('DELETE FROM app_saved_houses WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM app_notification_dismissals WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM app_alert_preferences WHERE user_id = $1', [userId]);
    
    // Delete comments and likes
    await client.query('DELETE FROM comment_likes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM video_likes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM video_comments WHERE user_id = $1', [userId]);
    
    // Delete rental agreements and payments
    await client.query('DELETE FROM payments WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM rental_agreements WHERE tenant_id = $1', [userId]);
    
    // Finally delete the user
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    
    await client.query('COMMIT');
    
    res.json({
      message: 'Account deleted successfully',
      deletedUserId: userId,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete account error:', err);
    next(err);
  } finally {
    client.release();
  }
};
