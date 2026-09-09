const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const generateToken = require('../utils/generateToken');
const { uploadToSpaces, FOLDER_TYPES, deleteFromSpaces } = require('../services/imageUploadService');
const { 
  trackFailedLogin, 
  isAccountLocked, 
  clearFailedLoginAttempts,
  trackPasswordChange,
  trackPasswordResetRequest,
  trackPasswordResetComplete,
  ACCOUNT_LOCKOUT_DURATION_MS
} = require('../services/securityEventService');
const {
  AuditEventTypes,
  RiskLevels,
  LockReasons,
  initializeSecurityTables,
  logSecurityEvent,
  getAccountSecurity,
  lockAccount,
  unlockAccount,
  updateFailedLoginCount,
  updateRiskLevel,
  isAccountLockedDB
} = require('../services/auditLogService');
const {
  trackUserActivity,
  assessUserRisk,
  detectSuspiciousActivityDB
} = require('../services/riskDetectionService');

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

// @route POST /api/auth/login
exports.login = async (req, res, next) => {
  const { email, password } = req.body;
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const requestId = req.id || Math.random().toString(36).substring(7);
  
  try {
    // Ensure user profile columns (non-blocking)
    try {
      await ensureUserProfileColumns();
    } catch (schemaError) {
      console.error('Profile column check failed:', schemaError.message);
      // Continue anyway - don't fail login
    }
    
    // Initialize security tables if needed (non-blocking)
    try {
      await initializeSecurityTables();
    } catch (schemaError) {
      console.error('Security table initialization failed:', schemaError.message);
      // Continue anyway - don't fail login
    }
    
    const result = await pool.query(
      `SELECT id, email, password_hash, first_name, last_name, phone, role, profile_image_url, is_banned FROM users WHERE email = $1`,
      [email]
    );
    
    if (result.rows.length === 0) {
      // Track failed login for non-existent email (in-memory only)
      await trackFailedLogin(email, ip);
      
      // Log security event (without user_id since user doesn't exist)
      await logSecurityEvent({
        eventType: AuditEventTypes.LOGIN_FAILED,
        riskLevel: RiskLevels.NORMAL,
        ipAddress: ip,
        userAgent: userAgent,
        endpoint: '/api/auth/login',
        requestId: requestId,
        details: { email: email }
      });
      
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    
    // Check database-backed lock status
    const dbLockStatus = await isAccountLockedDB(user.id);
    if (dbLockStatus.locked) {
      await logSecurityEvent({
        userId: user.id,
        eventType: AuditEventTypes.LOGIN_FAILED,
        riskLevel: RiskLevels.HIGH_RISK,
        ipAddress: ip,
        userAgent: userAgent,
        endpoint: '/api/auth/login',
        requestId: requestId,
        details: { 
          reason: 'Account locked',
          lockReason: dbLockStatus.lockReason,
          lockedUntil: dbLockStatus.lockedUntil
        }
      });
      
      return res.status(423).json({ 
        error: 'Account is locked',
        lockReason: dbLockStatus.lockReason,
        lockUntil: dbLockStatus.lockedUntil
      });
    }
    
    // Check in-memory lock status as backup
    const lockStatus = isAccountLocked(email);
    if (lockStatus.locked) {
      await logSecurityEvent({
        userId: user.id,
        eventType: AuditEventTypes.LOGIN_FAILED,
        riskLevel: RiskLevels.HIGH_RISK,
        ipAddress: ip,
        userAgent: userAgent,
        endpoint: '/api/auth/login',
        requestId: requestId,
        details: { reason: 'Account temporarily locked' }
      });
      
      return res.status(423).json({ 
        error: 'Account temporarily locked due to too many failed login attempts',
        lockUntil: lockStatus.lockUntil,
        remainingMinutes: lockStatus.remainingMinutes
      });
    }
    
    // Check if user is banned
    if (user.is_banned) {
      await trackAccountBan(user.id, email, 'Account is banned');
      await logSecurityEvent({
        userId: user.id,
        eventType: AuditEventTypes.LOGIN_FAILED,
        riskLevel: RiskLevels.HIGH_RISK,
        ipAddress: ip,
        userAgent: userAgent,
        endpoint: '/api/auth/login',
        requestId: requestId,
        details: { reason: 'Account is banned' }
      });
      
      return res.status(403).json({ error: 'Account is suspended' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      // Track failed login in-memory
      const securityResult = await trackFailedLogin(email, ip, user.id);
      
      // Track in risk detection service (non-blocking)
      try {
        trackUserActivity(user.id, 'FAILED_LOGIN');
      } catch (activityError) {
        console.error('Activity tracking failed:', activityError.message);
      }
      
      // Update database failed login count (non-blocking)
      try {
        await updateFailedLoginCount(user.id, true);
      } catch (dbError) {
        console.error('Failed login count update failed:', dbError.message);
      }
      
      // Log security event (non-blocking)
      try {
        await logSecurityEvent({
          userId: user.id,
          eventType: AuditEventTypes.LOGIN_FAILED,
          riskLevel: RiskLevels.SUSPICIOUS,
          ipAddress: ip,
          userAgent: userAgent,
          endpoint: '/api/auth/login',
          requestId: requestId,
          details: { 
            attemptCount: securityResult.attemptCount,
            threshold: 5
          }
        });
      } catch (logError) {
        console.error('Security event logging failed:', logError.message);
      }
      
      // Assess risk level (non-blocking)
      try {
        const riskAssessment = assessUserRisk(user.id);
        if (riskAssessment.riskLevel !== RiskLevels.NORMAL) {
          await updateRiskLevel(user.id, riskAssessment.riskLevel);
        }
      } catch (riskError) {
        console.error('Risk assessment failed:', riskError.message);
      }
      
      if (securityResult.locked) {
        // Account is now locked - lock in database (non-blocking)
        try {
          await lockAccount(user.id, LockReasons.FAILED_LOGIN, null, securityResult.lockUntil);
          await trackAccountLockout(user.id, email, securityResult.lockUntil);
          
          await logSecurityEvent({
            userId: user.id,
            eventType: AuditEventTypes.ACCOUNT_LOCKED,
            riskLevel: RiskLevels.HIGH_RISK,
            ipAddress: ip,
            userAgent: userAgent,
            endpoint: '/api/auth/login',
            requestId: requestId,
            details: { 
              reason: LockReasons.FAILED_LOGIN,
              lockUntil: securityResult.lockUntil,
              attemptCount: securityResult.attemptCount
            }
          });
        } catch (lockError) {
          console.error('Account locking failed:', lockError.message);
        }
        
        return res.status(423).json({ 
          error: 'Account temporarily locked due to too many failed login attempts',
          lockUntil: securityResult.lockUntil,
          remainingMinutes: Math.ceil(ACCOUNT_LOCKOUT_DURATION_MS / 60000)
        });
      }
      
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Successful login - clear failed attempts
    clearFailedLoginAttempts(email);
    
    // Update database failed login count (non-blocking)
    try {
      await updateFailedLoginCount(user.id, false);
    } catch (dbError) {
      console.error('Failed login count reset failed:', dbError.message);
    }
    
    // Reset risk level to NORMAL on successful login (non-blocking)
    try {
      await updateRiskLevel(user.id, RiskLevels.NORMAL);
    } catch (riskError) {
      console.error('Risk level reset failed:', riskError.message);
    }
    
    // Update last successful login in database (non-blocking)
    try {
      await pool.query(
        `UPDATE account_security 
         SET last_successful_login_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1::uuid`,
        [user.id]
      );
    } catch (updateError) {
      console.error('Last login update failed:', updateError.message);
    }
    
    // Log successful login (non-blocking)
    try {
      await logSecurityEvent({
        userId: user.id,
        eventType: AuditEventTypes.LOGIN_SUCCESS,
        riskLevel: RiskLevels.NORMAL,
        ipAddress: ip,
        userAgent: userAgent,
        endpoint: '/api/auth/login',
        requestId: requestId,
        details: { email: user.email }
      });
    } catch (logError) {
      console.error('Login success logging failed:', logError.message);
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
    // Ensure user profile columns (non-blocking)
    try {
      await ensureUserProfileColumns();
    } catch (schemaError) {
      console.error('Profile column check failed:', schemaError.message);
    }
    
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
    // Ensure user profile columns (non-blocking)
    try {
      await ensureUserProfileColumns();
    } catch (schemaError) {
      console.error('Profile column check failed:', schemaError.message);
    }
    
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
    next(err);
  } finally {
    client.release();
  }
};

// @route POST /api/auth/password-reset/request
exports.requestPasswordReset = async (req, res, next) => {
  const { email } = req.body;
  
  try {
    await ensureUserProfileColumns();
    
    // Check if user exists
    const result = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      // Don't reveal user existence, but don't send email
      return res.json({ 
        message: 'If an account exists with this email, a password reset link will be sent.' 
      });
    }
    
    const user = result.rows[0];
    
    // Track password reset request
    await trackPasswordResetRequest(user.id, email);
    
    // In a real implementation, you would generate a reset token and send it via email
    // For now, we'll simulate this by acknowledging the request
    
    res.json({ 
      message: 'If an account exists with this email, a password reset link will be sent.' 
    });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/auth/password-reset/confirm
exports.resetPassword = async (req, res, next) => {
  const { email, newPassword, resetToken } = req.body;
  
  try {
    await ensureUserProfileColumns();
    
    // Validate reset token (in real implementation, this would be cryptographically verified)
    if (!resetToken || resetToken.length < 32) {
      return res.status(400).json({ error: 'Invalid reset token' });
    }
    
    // Find user by email
    const result = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE email = $1',
      [email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Validate new password
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters with uppercase, lowercase, and numbers' 
      });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid',
      [passwordHash, user.id]
    );
    
    // Track password reset completion
    await trackPasswordResetComplete(user.id, email);
    
    // Clear all failed login attempts for this user
    clearFailedLoginAttempts(email);
    
    res.json({ 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
  } catch (err) {
    next(err);
  }
};

// @route POST /api/auth/change-password
exports.changePassword = async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.id;
  const deviceInfo = req.headers['user-agent'] || 'Unknown device';
  const ip = req.ip || req.connection.remoteAddress;
  const requestId = req.id || Math.random().toString(36).substring(7);
  
  try {
    await ensureUserProfileColumns();
    
    // Get current user data
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) {
      await logSecurityEvent({
        userId: userId,
        eventType: AuditEventTypes.UNAUTHORIZED_ACCESS_ATTEMPT,
        riskLevel: RiskLevels.SUSPICIOUS,
        ipAddress: ip,
        userAgent: deviceInfo,
        endpoint: '/api/auth/change-password',
        requestId: requestId,
        details: { reason: 'Incorrect current password' }
      });
      
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Validate new password
    const passwordRegex = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        error: 'Password must be at least 8 characters with uppercase, lowercase, and numbers' 
      });
    }
    
    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (isSamePassword) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    
    // Update password
    await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2::uuid',
      [passwordHash, userId]
    );
    
    // Track password change
    await trackPasswordChange(userId, user.email, deviceInfo);
    
    // Log security event
    await logSecurityEvent({
      userId: userId,
      eventType: AuditEventTypes.PASSWORD_CHANGED,
      riskLevel: RiskLevels.NORMAL,
      ipAddress: ip,
      userAgent: deviceInfo,
      endpoint: '/api/auth/change-password',
      requestId: requestId,
      details: { deviceInfo: deviceInfo }
    });
    
    res.json({ 
      message: 'Password changed successfully. You will receive a security notification email.' 
    });
  } catch (err) {
    next(err);
  }
};
