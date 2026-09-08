const { sendSecurityEmail, SecurityEvents } = require('./emailService');
const pool = require('../config/db');

// Failed login tracking per IP and email
const failedLoginAttempts = new Map();
const FAILED_LOGIN_THRESHOLD = 5;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const ACCOUNT_LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Account lockout tracking
const accountLockouts = new Map();

// Track failed login attempts
const trackFailedLogin = async (email, ip, userId = null) => {
  const key = email.toLowerCase();
  const now = Date.now();
  
  // Get existing attempts
  let attempts = failedLoginAttempts.get(key) || { 
    attempts: [], 
    firstAttempt: now 
  };
  
  // Clean up old attempts outside the window
  attempts.attempts = attempts.attempts.filter(timestamp => 
    (now - timestamp) < FAILED_LOGIN_WINDOW_MS
  );
  
  // Add current attempt
  attempts.attempts.push(now);
  attempts.lastAttempt = now;
  attempts.ip = ip;
  
  failedLoginAttempts.set(key, attempts);
  
  const attemptCount = attempts.attempts.length;
  
  // Check if threshold reached
  if (attemptCount >= FAILED_LOGIN_THRESHOLD) {
    // Trigger suspicious activity email
    if (userId) {
      const userResult = await pool.query(
        'SELECT first_name, last_name FROM users WHERE id = $1::uuid',
        [userId]
      );
      
      if (userResult.rows.length > 0) {
        const userName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name || ''}`.trim();
        
        await sendSecurityEmail(email, SecurityEvents.SUSPICIOUS_LOGIN_ACTIVITY, {
          userName: userName,
          activityDetails: {
            attempts: attemptCount,
            firstAttempt: new Date(attempts.firstAttempt).toISOString(),
            lastAttempt: new Date(attempts.lastAttempt).toISOString(),
            ip: ip
          },
          threshold: FAILED_LOGIN_THRESHOLD
        });
      }
    }
    
    // Lock account temporarily
    const lockUntil = now + ACCOUNT_LOCKOUT_DURATION_MS;
    accountLockouts.set(key, lockUntil);
    
    return { 
      locked: true, 
      lockUntil: new Date(lockUntil).toISOString(),
      attemptCount 
    };
  }
  
  return { 
    locked: false, 
    attemptCount,
    nextThreshold: FAILED_LOGIN_THRESHOLD - attemptCount
  };
};

// Check if account is locked
const isAccountLocked = (email) => {
  const key = email.toLowerCase();
  const lockUntil = accountLockouts.get(key);
  
  if (!lockUntil) return { locked: false };
  
  const now = Date.now();
  if (now < lockUntil) {
    return { 
      locked: true, 
      lockUntil: new Date(lockUntil).toISOString(),
      remainingMinutes: Math.ceil((lockUntil - now) / 60000)
    };
  }
  
  // Lock expired, remove it
  accountLockouts.delete(key);
  return { locked: false };
};

// Clear failed login attempts (after successful login)
const clearFailedLoginAttempts = (email) => {
  const key = email.toLowerCase();
  failedLoginAttempts.delete(key);
};

// Track account ban
const trackAccountBan = async (userId, email, reason = null) => {
  try {
    const userResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const userName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name || ''}`.trim();
      
      await sendSecurityEmail(email, SecurityEvents.ACCOUNT_BANNED, {
        userName: userName,
        banTime: new Date().toISOString(),
        reason: reason
      });
    }
  } catch (error) {
    // Don't fail auth flow if email sending fails
  }
};

// Track password change
const trackPasswordChange = async (userId, email, deviceInfo = null) => {
  try {
    const userResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const userName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name || ''}`.trim();
      
      await sendSecurityEmail(email, SecurityEvents.PASSWORD_CHANGED, {
        userName: userName,
        changeTime: new Date().toISOString(),
        deviceInfo: deviceInfo
      });
    }
  } catch (error) {
    // Don't fail auth flow if email sending fails
  }
};

// Track password reset request
const trackPasswordResetRequest = async (userId, email) => {
  try {
    const userResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const userName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name || ''}`.trim();
      
      await sendSecurityEmail(email, SecurityEvents.PASSWORD_RESET_REQUESTED, {
        userName: userName,
        resetTime: new Date().toISOString()
      });
    }
  } catch (error) {
    // Don't fail auth flow if email sending fails
  }
};

// Track password reset completion
const trackPasswordResetComplete = async (userId, email) => {
  try {
    const userResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const userName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name || ''}`.trim();
      
      await sendSecurityEmail(email, SecurityEvents.PASSWORD_RESET_COMPLETED, {
        userName: userName,
        resetTime: new Date().toISOString()
      });
    }
  } catch (error) {
    // Don't fail auth flow if email sending fails
  }
};

// Track account lockout
const trackAccountLockout = async (userId, email, lockUntil) => {
  try {
    const userResult = await pool.query(
      'SELECT first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length > 0) {
      const userName = `${userResult.rows[0].first_name} ${userResult.rows[0].last_name || ''}`.trim();
      
      await sendSecurityEmail(email, SecurityEvents.ACCOUNT_LOCKED, {
        userName: userName,
        lockTime: new Date().toISOString(),
        unlockTime: new Date(lockUntil).toISOString()
      });
    }
  } catch (error) {
    // Don't fail auth flow if email sending fails
  }
};

// Get security status for a user (for admin monitoring)
const getSecurityStatus = async (email) => {
  const key = email.toLowerCase();
  const failedAttempts = failedLoginAttempts.get(key);
  const lockout = accountLockouts.get(key);
  
  return {
    failedAttempts: failedAttempts ? failedAttempts.attempts.length : 0,
    isLocked: lockout ? Date.now() < lockout : false,
    lockUntil: lockout ? new Date(lockout).toISOString() : null,
    lastFailedAttempt: failedAttempts ? new Date(failedAttempts.lastAttempt).toISOString() : null
  };
};

module.exports = {
  trackFailedLogin,
  isAccountLocked,
  clearFailedLoginAttempts,
  trackAccountBan,
  trackPasswordChange,
  trackPasswordResetRequest,
  trackPasswordResetComplete,
  trackAccountLockout,
  getSecurityStatus,
  FAILED_LOGIN_THRESHOLD,
  ACCOUNT_LOCKOUT_DURATION_MS
};