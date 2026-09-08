const {
  logSecurityEvent,
  getUserSecurityEvents,
  getRecentSecurityEvents,
  getSecurityStatistics,
  getSuspiciousAccounts,
  getAccountSecurity,
  lockAccount,
  unlockAccount,
  AuditEventTypes,
  LockReasons
} = require('../services/auditLogService');
const { detectSuspiciousActivityDB } = require('../services/riskDetectionService');
const { sendSecurityEmail, SecurityEvents } = require('../services/emailService');
const pool = require('../config/db');

// Get security overview statistics
exports.getSecurityOverview = async (req, res, next) => {
  try {
    const stats = await getSecurityStatistics();
    res.json(stats);
  } catch (error) {
    next(error);
  }
};

// Get suspicious accounts
exports.getSuspiciousAccounts = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const accounts = await getSuspiciousAccounts(limit);
    res.json(accounts);
  } catch (error) {
    next(error);
  }
};

// Get user security events
exports.getUserSecurityEvents = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const events = await getUserSecurityEvents(userId, limit, offset);
    res.json(events);
  } catch (error) {
    next(error);
  }
};

// Get recent security events
exports.getRecentSecurityEvents = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const riskLevel = req.query.riskLevel || null;
    
    const events = await getRecentSecurityEvents(limit, riskLevel);
    res.json(events);
  } catch (error) {
    next(error);
  }
};

// Get account security details
exports.getAccountSecurity = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const security = await getAccountSecurity(userId);
    
    if (!security) {
      return res.status(404).json({ error: 'Account security not found' });
    }
    
    // Get user details
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name, role, created_at FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get risk assessment
    const riskAssessment = await detectSuspiciousActivityDB(userId);
    
    res.json({
      user: userResult.rows[0],
      security: security,
      riskAssessment: riskAssessment
    });
  } catch (error) {
    next(error);
  }
};

// Lock account (admin)
exports.lockAccount = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { reason, note } = req.body;
    const adminId = req.user.id;
    const adminIp = req.ip || req.connection.remoteAddress;
    
    // Validate admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get user details
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Lock account (permanent until admin unlocks)
    const locked = await lockAccount(userId, LockReasons.ADMIN, adminId, null);
    
    if (!locked) {
      return res.status(500).json({ error: 'Failed to lock account' });
    }
    
    // Log security event
    await logSecurityEvent({
      userId: userId,
      actorId: adminId,
      eventType: AuditEventTypes.ACCOUNT_ADMIN_LOCKED,
      riskLevel: 'HIGH_RISK',
      ipAddress: adminIp,
      endpoint: '/api/admin/security/lock',
      details: {
        reason: reason || 'Admin action',
        note: note || null
      }
    });
    
    // Send email notification
    await sendSecurityEmail(user.email, SecurityEvents.ACCOUNT_BANNED, {
      userName: `${user.first_name} ${user.last_name || ''}`.trim(),
      banTime: new Date().toISOString(),
      reason: reason || 'Locked by administrator'
    });
    
    res.json({ 
      success: true, 
      message: 'Account locked successfully',
      lockReason: LockReasons.ADMIN
    });
  } catch (error) {
    next(error);
  }
};

// Unlock account (admin)
exports.unlockAccount = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { note } = req.body;
    const adminId = req.user.id;
    const adminIp = req.ip || req.connection.remoteAddress;
    
    // Validate admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get user details
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM users WHERE id = $1::uuid',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Unlock account
    const unlocked = await unlockAccount(userId, adminId);
    
    if (!unlocked) {
      return res.status(500).json({ error: 'Failed to unlock account' });
    }
    
    // Log security event
    await logSecurityEvent({
      userId: userId,
      actorId: adminId,
      eventType: AuditEventTypes.ACCOUNT_ADMIN_UNLOCKED,
      riskLevel: 'NORMAL',
      ipAddress: adminIp,
      endpoint: '/api/admin/security/unlock',
      details: {
        note: note || null
      }
    });
    
    // Send email notification (account unlocked)
    await sendSecurityEmail(user.email, SecurityEvents.ACCOUNT_LOCKED, {
      userName: `${user.first_name} ${user.last_name || ''}`.trim(),
      lockTime: new Date().toISOString(),
      unlockTime: new Date().toISOString()
    });
    
    res.json({ 
      success: true, 
      message: 'Account unlocked successfully' 
    });
  } catch (error) {
    next(error);
  }
};

// Update user risk level (admin)
exports.updateRiskLevel = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { riskLevel, note } = req.body;
    const adminId = req.user.id;
    const adminIp = req.ip || req.connection.remoteAddress;
    
    // Validate admin
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Validate risk level
    const validRiskLevels = ['NORMAL', 'SUSPICIOUS', 'HIGH_RISK'];
    if (!validRiskLevels.includes(riskLevel)) {
      return res.status(400).json({ error: 'Invalid risk level' });
    }
    
    // Update risk level in database
    await pool.query(
      `UPDATE account_security 
       SET risk_level = $2,
           security_notes = $3,
           updated_at = NOW()
       WHERE user_id = $1::uuid`,
      [userId, riskLevel, note || null]
    );
    
    // Log security event
    await logSecurityEvent({
      userId: userId,
      actorId: adminId,
      eventType: AuditEventTypes.SECURITY_ALERT,
      riskLevel: riskLevel,
      ipAddress: adminIp,
      endpoint: '/api/admin/security/risk-level',
      details: {
        previousRiskLevel: null, // Could fetch if needed
        newRiskLevel: riskLevel,
        note: note || null
      }
    });
    
    res.json({ 
      success: true, 
      message: 'Risk level updated successfully' 
    });
  } catch (error) {
    next(error);
  }
};