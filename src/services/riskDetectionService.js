const { RiskLevels } = require('./auditLogService');
const pool = require('../config/db');

// Risk detection thresholds
const RISK_THRESHOLDS = {
  FAILED_LOGIN_THRESHOLD: 5,
  FAILED_LOGIN_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  UNAUTHORIZED_THRESHOLD: 10,
  UNAUTHORIZED_WINDOW_MS: 30 * 60 * 1000, // 30 minutes
  PASSWORD_RESET_THRESHOLD: 3,
  PASSWORD_RESET_WINDOW_MS: 60 * 60 * 1000, // 1 hour
  HIGH_FREQUENCY_THRESHOLD: 100,
  HIGH_FREQUENCY_WINDOW_MS: 60 * 60 * 1000 // 1 hour
};

// In-memory tracking for real-time detection
const userActivityTracking = new Map();

// Track user activity for risk detection
const trackUserActivity = (userId, activityType, metadata = {}) => {
  const key = userId;
  const now = Date.now();
  
  let userActivity = userActivityTracking.get(key) || {
    failedLogins: [],
    unauthorizedAttempts: [],
    passwordResets: [],
    totalRequests: [],
    lastActivity: now
  };
  
  // Clean up old activity outside windows
  userActivity.failedLogins = userActivity.failedLogins.filter(
    t => (now - t) < RISK_THRESHOLDS.FAILED_LOGIN_WINDOW_MS
  );
  userActivity.unauthorizedAttempts = userActivity.unauthorizedAttempts.filter(
    t => (now - t) < RISK_THRESHOLDS.UNAUTHORIZED_WINDOW_MS
  );
  userActivity.passwordResets = userActivity.passwordResets.filter(
    t => (now - t) < RISK_THRESHOLDS.PASSWORD_RESET_WINDOW_MS
  );
  userActivity.totalRequests = userActivity.totalRequests.filter(
    t => (now - t) < RISK_THRESHOLDS.HIGH_FREQUENCY_WINDOW_MS
  );
  
  // Add current activity
  switch (activityType) {
    case 'FAILED_LOGIN':
      userActivity.failedLogins.push(now);
      break;
    case 'UNAUTHORIZED':
      userActivity.unauthorizedAttempts.push(now);
      break;
    case 'PASSWORD_RESET':
      userActivity.passwordResets.push(now);
      break;
    case 'REQUEST':
      userActivity.totalRequests.push(now);
      break;
  }
  
  userActivity.lastActivity = now;
  userActivityTracking.set(key, userActivity);
  
  return userActivity;
};

// Assess user risk level
const assessUserRisk = (userId) => {
  const activity = userActivityTracking.get(userId);
  
  if (!activity) {
    return { riskLevel: RiskLevels.NORMAL, reasons: [] };
  }
  
  const reasons = [];
  let riskLevel = RiskLevels.NORMAL;
  
  // Check failed logins
  if (activity.failedLogins.length >= RISK_THRESHOLDS.FAILED_LOGIN_THRESHOLD) {
    riskLevel = RiskLevels.HIGH_RISK;
    reasons.push(`Multiple failed login attempts: ${activity.failedLogins.length}`);
  } else if (activity.failedLogins.length >= 3) {
    riskLevel = RiskLevels.SUSPICIOUS;
    reasons.push(`Failed login attempts: ${activity.failedLogins.length}`);
  }
  
  // Check unauthorized attempts
  if (activity.unauthorizedAttempts.length >= RISK_THRESHOLDS.UNAUTHORIZED_THRESHOLD) {
    riskLevel = RiskLevels.HIGH_RISK;
    reasons.push(`Multiple unauthorized access attempts: ${activity.unauthorizedAttempts.length}`);
  } else if (activity.unauthorizedAttempts.length >= 5) {
    if (riskLevel !== RiskLevels.HIGH_RISK) {
      riskLevel = RiskLevels.SUSPICIOUS;
    }
    reasons.push(`Unauthorized access attempts: ${activity.unauthorizedAttempts.length}`);
  }
  
  // Check password reset abuse
  if (activity.passwordResets.length >= RISK_THRESHOLDS.PASSWORD_RESET_THRESHOLD) {
    riskLevel = RiskLevels.HIGH_RISK;
    reasons.push(`Password reset abuse detected: ${activity.passwordResets.length} requests`);
  }
  
  // Check high frequency requests
  if (activity.totalRequests.length >= RISK_THRESHOLDS.HIGH_FREQUENCY_THRESHOLD) {
    if (riskLevel !== RiskLevels.HIGH_RISK) {
      riskLevel = RiskLevels.SUSPICIOUS;
    }
    reasons.push(`Unusually high request frequency: ${activity.totalRequests.length} requests/hour`);
  }
  
  return { riskLevel, reasons };
};

// Detect suspicious activity from database
const detectSuspiciousActivityDB = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN event_type = 'LOGIN_FAILED' THEN 1 END) as failed_logins,
        COUNT(CASE WHEN event_type = 'UNAUTHORIZED_ACCESS_ATTEMPT' THEN 1 END) as unauthorized_attempts,
        COUNT(CASE WHEN event_type = 'PASSWORD_RESET_REQUESTED' THEN 1 END) as password_resets,
        MAX(CASE WHEN event_type = 'LOGIN_FAILED' THEN created_at END) as last_failed_login
       FROM security_audit_log
       WHERE user_id = $1::uuid
         AND created_at > NOW() - INTERVAL '24 hours'`,
      [userId]
    );
    
    const stats = result.rows[0];
    const reasons = [];
    let riskLevel = RiskLevels.NORMAL;
    
    if (stats.failed_logins >= RISK_THRESHOLDS.FAILED_LOGIN_THRESHOLD) {
      riskLevel = RiskLevels.HIGH_RISK;
      reasons.push(`Multiple failed logins in 24h: ${stats.failed_logins}`);
    } else if (stats.failed_logins >= 3) {
      riskLevel = RiskLevels.SUSPICIOUS;
      reasons.push(`Failed logins in 24h: ${stats.failed_logins}`);
    }
    
    if (stats.unauthorized_attempts >= RISK_THRESHOLDS.UNAUTHORIZED_THRESHOLD) {
      riskLevel = RiskLevels.HIGH_RISK;
      reasons.push(`Unauthorized attempts in 24h: ${stats.unauthorized_attempts}`);
    } else if (stats.unauthorized_attempts >= 5) {
      if (riskLevel !== RiskLevels.HIGH_RISK) {
        riskLevel = RiskLevels.SUSPICIOUS;
      }
      reasons.push(`Unauthorized attempts in 24h: ${stats.unauthorized_attempts}`);
    }
    
    if (stats.password_resets >= RISK_THRESHOLDS.PASSWORD_RESET_THRESHOLD) {
      riskLevel = RiskLevels.HIGH_RISK;
      reasons.push(`Password reset abuse: ${stats.password_resets} requests`);
    }
    
    return {
      riskLevel,
      reasons,
      stats: {
        totalEvents: parseInt(stats.total_events),
        failedLogins: parseInt(stats.failed_logins),
        unauthorizedAttempts: parseInt(stats.unauthorized_attempts),
        passwordResets: parseInt(stats.password_resets),
        lastFailedLogin: stats.last_failed_login
      }
    };
  } catch (error) {
    console.error('Failed to detect suspicious activity:', error);
    return { riskLevel: RiskLevels.NORMAL, reasons: [], stats: null };
  }
};

// Get cross-user suspicious patterns (e.g., same IP, multiple accounts)
const detectCrossUserSuspiciousPatterns = async (ipAddress, limit = 10) => {
  try {
    const result = await pool.query(
      `SELECT 
        user_id,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(*) as total_events,
        COUNT(CASE WHEN event_type = 'LOGIN_FAILED' THEN 1 END) as failed_logins,
        COUNT(CASE WHEN event_type = 'UNAUTHORIZED_ACCESS_ATTEMPT' THEN 1 END) as unauthorized_attempts
       FROM security_audit_log
       WHERE ip_address = $1::inet
         AND created_at > NOW() - INTERVAL '24 hours'
       GROUP BY user_id
       ORDER BY total_events DESC
       LIMIT $2`,
      [ipAddress, limit]
    );
    
    return result.rows;
  } catch (error) {
    console.error('Failed to detect cross-user patterns:', error);
    return [];
  }
};

// Clean up old tracking data (call periodically)
const cleanupOldTrackingData = () => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [key, activity] of userActivityTracking.entries()) {
    if (now - activity.lastActivity > maxAge) {
      userActivityTracking.delete(key);
    }
  }
};

// Initialize periodic cleanup
setInterval(cleanupOldTrackingData, 60 * 60 * 1000); // Every hour

module.exports = {
  trackUserActivity,
  assessUserRisk,
  detectSuspiciousActivityDB,
  detectCrossUserSuspiciousPatterns,
  cleanupOldTrackingData,
  RISK_THRESHOLDS
};