const pool = require('../config/db');

// Audit log event types
const AuditEventTypes = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_AUTO_UNLOCKED: 'ACCOUNT_AUTO_UNLOCKED',
  ACCOUNT_ADMIN_LOCKED: 'ACCOUNT_ADMIN_LOCKED',
  ACCOUNT_ADMIN_UNLOCKED: 'ACCOUNT_ADMIN_UNLOCKED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  EMAIL_VERIFIED: 'EMAIL_VERIFIED',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'UNAUTHORIZED_ACCESS_ATTEMPT',
  ACCOUNT_BANNED: 'ACCOUNT_BANNED',
  ACCOUNT_UNBANNED: 'ACCOUNT_UNBANNED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
  SECURITY_ALERT: 'SECURITY_ALERT'
};

// Risk levels
const RiskLevels = {
  NORMAL: 'NORMAL',
  SUSPICIOUS: 'SUSPICIOUS',
  HIGH_RISK: 'HIGH_RISK'
};

// Lock reasons
const LockReasons = {
  FAILED_LOGIN: 'FAILED_LOGIN',
  ADMIN: 'ADMIN',
  SECURITY: 'SECURITY'
};

// Ensure audit log table exists
const ensureAuditLogTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(50) NOT NULL,
        risk_level VARCHAR(20) DEFAULT 'NORMAL',
        ip_address INET,
        user_agent TEXT,
        endpoint VARCHAR(255),
        request_id VARCHAR(100),
        details JSONB,
        metadata JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create indexes separately
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_user_id ON security_audit_log(user_id)`);
    } catch (e) { console.error('Index creation failed:', e.message); }
    
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_event_type ON security_audit_log(event_type)`);
    } catch (e) { console.error('Index creation failed:', e.message); }
    
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON security_audit_log(created_at)`);
    } catch (e) { console.error('Index creation failed:', e.message); }
    
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_risk_level ON security_audit_log(risk_level)`);
    } catch (e) { console.error('Index creation failed:', e.message); }
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to create audit log table:', error.message);
    }
  }
};

// Ensure account security table exists
const ensureAccountSecurityTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS account_security (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        is_locked BOOLEAN DEFAULT false,
        lock_reason VARCHAR(50),
        locked_at TIMESTAMP WITH TIME ZONE,
        locked_until TIMESTAMP WITH TIME ZONE,
        locked_by UUID REFERENCES users(id) ON DELETE SET NULL,
        failed_login_count INTEGER DEFAULT 0,
        last_failed_login_at TIMESTAMP WITH TIME ZONE,
        last_successful_login_at TIMESTAMP WITH TIME ZONE,
        risk_level VARCHAR(20) DEFAULT 'NORMAL',
        security_notes TEXT,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to create account security table:', error.message);
    }
  }
};

// Initialize tables
const initializeSecurityTables = async () => {
  try {
    await ensureAuditLogTable();
  } catch (error) {
    console.error('Audit log table initialization failed:', error.message);
  }
  
  try {
    await ensureAccountSecurityTable();
  } catch (error) {
    console.error('Account security table initialization failed:', error.message);
  }
};

// Log security event
const logSecurityEvent = async (eventData) => {
  try {
    const {
      userId,
      actorId,
      eventType,
      riskLevel = RiskLevels.NORMAL,
      ipAddress,
      userAgent,
      endpoint,
      requestId,
      details = {},
      metadata = {}
    } = eventData;

    await pool.query(
      `INSERT INTO security_audit_log 
       (user_id, actor_id, event_type, risk_level, ip_address, user_agent, endpoint, request_id, details, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId || null,
        actorId || null,
        eventType,
        riskLevel,
        ipAddress || null,
        userAgent || null,
        endpoint || null,
        requestId || null,
        JSON.stringify(details),
        JSON.stringify(metadata)
      ]
    );
  } catch (error) {
    // Don't fail operations if audit logging fails
    if (process.env.NODE_ENV !== 'production') {
      console.error('Failed to log security event:', error.message);
    }
  }
};

// Get security events for a user
const getUserSecurityEvents = async (userId, limit = 50, offset = 0) => {
  try {
    const result = await pool.query(
      `SELECT * FROM security_audit_log 
       WHERE user_id = $1::uuid 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  } catch (error) {
    console.error('Failed to get user security events:', error);
    return [];
  }
};

// Get recent security events (for admin dashboard)
const getRecentSecurityEvents = async (limit = 100, riskLevel = null) => {
  try {
    let query = `
      SELECT 
        sal.*,
        u.email,
        u.first_name,
        u.last_name
      FROM security_audit_log sal
      LEFT JOIN users u ON sal.user_id = u.id
    `;
    const params = [];
    let paramCount = 0;

    if (riskLevel) {
      paramCount++;
      query += ` WHERE sal.risk_level = $${paramCount}`;
      params.push(riskLevel);
    }

    query += ` ORDER BY sal.created_at DESC LIMIT $${paramCount + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Failed to get recent security events:', error);
    return [];
  }
};

// Get security statistics
const getSecurityStatistics = async () => {
  try {
    const [statsResult, lockedResult, highRiskResult] = await Promise.all([
      pool.query(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(CASE WHEN event_type = 'LOGIN_FAILED' THEN 1 END) as failed_logins,
          COUNT(CASE WHEN event_type = 'ACCOUNT_LOCKED' THEN 1 END) as account_locks,
          COUNT(CASE WHEN event_type = 'UNAUTHORIZED_ACCESS_ATTEMPT' THEN 1 END) as unauthorized_attempts,
          COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h_events
        FROM security_audit_log
        WHERE created_at > NOW() - INTERVAL '7 days'
      `),
      pool.query(`
        SELECT COUNT(*) as locked_accounts
        FROM account_security
        WHERE is_locked = true
      `),
      pool.query(`
        SELECT COUNT(*) as high_risk_users
        FROM account_security
        WHERE risk_level = 'HIGH_RISK'
      `)
    ]);

    return {
      totalEvents: parseInt(statsResult.rows[0].total_events),
      failedLogins: parseInt(statsResult.rows[0].failed_logins),
      accountLocks: parseInt(statsResult.rows[0].account_locks),
      unauthorizedAttempts: parseInt(statsResult.rows[0].unauthorized_attempts),
      last24hEvents: parseInt(statsResult.rows[0].last_24h_events),
      lockedAccounts: parseInt(lockedResult.rows[0].locked_accounts),
      highRiskUsers: parseInt(highRiskResult.rows[0].high_risk_users)
    };
  } catch (error) {
    console.error('Failed to get security statistics:', error);
    return {
      totalEvents: 0,
      failedLogins: 0,
      accountLocks: 0,
      unauthorizedAttempts: 0,
      last24hEvents: 0,
      lockedAccounts: 0,
      highRiskUsers: 0
    };
  }
};

// Get suspicious accounts
const getSuspiciousAccounts = async (limit = 50) => {
  try {
    const result = await pool.query(`
      SELECT 
        as_sec.*,
        u.email,
        u.first_name,
        u.last_name,
        u.role,
        u.created_at
      FROM account_security as_sec
      JOIN users u ON as_sec.user_id = u.id
      WHERE as_sec.risk_level IN ('SUSPICIOUS', 'HIGH_RISK')
         OR as_sec.failed_login_count >= 3
         OR as_sec.is_locked = true
      ORDER BY 
        CASE as_sec.risk_level
          WHEN 'HIGH_RISK' THEN 1
          WHEN 'SUSPICIOUS' THEN 2
          ELSE 3
        END,
        as_sec.failed_login_count DESC,
        as_sec.updated_at DESC
      LIMIT $1
    `, [limit]);

    return result.rows;
  } catch (error) {
    console.error('Failed to get suspicious accounts:', error);
    return [];
  }
};

// Get account security info
const getAccountSecurity = async (userId) => {
  try {
    const result = await pool.query(
      'SELECT * FROM account_security WHERE user_id = $1::uuid',
      [userId]
    );

    if (result.rows.length === 0) {
      // Create default security record
      await pool.query(
        `INSERT INTO account_security (user_id) VALUES ($1::uuid)`,
        [userId]
      );
      return {
        user_id: userId,
        is_locked: false,
        lock_reason: null,
        locked_at: null,
        locked_until: null,
        locked_by: null,
        failed_login_count: 0,
        last_failed_login_at: null,
        last_successful_login_at: null,
        risk_level: 'NORMAL',
        security_notes: null,
        updated_at: new Date()
      };
    }

    return result.rows[0];
  } catch (error) {
    console.error('Failed to get account security:', error);
    return null;
  }
};

// Lock account (admin or automatic)
const lockAccount = async (userId, lockReason, lockedBy = null, lockUntil = null) => {
  try {
    await pool.query(
      `UPDATE account_security 
       SET is_locked = true,
           lock_reason = $2,
           locked_at = NOW(),
           locked_until = $3,
           locked_by = $4,
           updated_at = NOW()
       WHERE user_id = $1::uuid`,
      [userId, lockReason, lockUntil, lockedBy]
    );

    return true;
  } catch (error) {
    console.error('Failed to lock account:', error);
    return false;
  }
};

// Unlock account (admin or automatic)
const unlockAccount = async (userId, unlockedBy = null) => {
  try {
    await pool.query(
      `UPDATE account_security 
       SET is_locked = false,
           lock_reason = null,
           locked_at = null,
           locked_until = null,
           locked_by = null,
           failed_login_count = 0,
           updated_at = NOW()
       WHERE user_id = $1::uuid`,
      [userId]
    );

    return true;
  } catch (error) {
    console.error('Failed to unlock account:', error);
    return false;
  }
};

// Update failed login count
const updateFailedLoginCount = async (userId, increment = true) => {
  try {
    if (increment) {
      await pool.query(
        `UPDATE account_security 
         SET failed_login_count = failed_login_count + 1,
             last_failed_login_at = NOW(),
             updated_at = NOW()
         WHERE user_id = $1::uuid`,
        [userId]
      );
    } else {
      await pool.query(
        `UPDATE account_security 
         SET failed_login_count = 0,
             updated_at = NOW()
         WHERE user_id = $1::uuid`,
        [userId]
      );
    }
  } catch (error) {
    // Don't fail auth flow if this fails
  }
};

// Update risk level
const updateRiskLevel = async (userId, riskLevel) => {
  try {
    await pool.query(
      `UPDATE account_security 
       SET risk_level = $2,
           updated_at = NOW()
       WHERE user_id = $1::uuid`,
      [userId, riskLevel]
    );
  } catch (error) {
    console.error('Failed to update risk level:', error);
  }
};

// Check if account is locked (database-backed)
const isAccountLockedDB = async (userId) => {
  try {
    const result = await pool.query(
      `SELECT is_locked, locked_until, lock_reason 
       FROM account_security 
       WHERE user_id = $1::uuid`,
      [userId]
    );

    if (result.rows.length === 0) {
      return { locked: false };
    }

    const security = result.rows[0];

    if (!security.is_locked) {
      return { locked: false };
    }

    // Check if temporary lock has expired
    if (security.locked_until && new Date(security.locked_until) < new Date()) {
      // Auto-unlock
      await unlockAccount(userId);
      return { locked: false, autoUnlocked: true };
    }

    return {
      locked: true,
      lockReason: security.lock_reason,
      lockedUntil: security.locked_until
    };
  } catch (error) {
    console.error('Failed to check account lock status:', error);
    return { locked: false };
  }
};

module.exports = {
  AuditEventTypes,
  RiskLevels,
  LockReasons,
  initializeSecurityTables,
  logSecurityEvent,
  getUserSecurityEvents,
  getRecentSecurityEvents,
  getSecurityStatistics,
  getSuspiciousAccounts,
  getAccountSecurity,
  lockAccount,
  unlockAccount,
  updateFailedLoginCount,
  updateRiskLevel,
  isAccountLockedDB
};