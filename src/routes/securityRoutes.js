const express = require('express');
const router = express.Router();
const securityController = require('../controllers/securityController');
const { adminMiddleware } = require('../middleware/auth');

// Security overview statistics
router.get('/overview', adminMiddleware, securityController.getSecurityOverview);

// Suspicious accounts
router.get('/suspicious', adminMiddleware, securityController.getSuspiciousAccounts);

// Recent security events
router.get('/events/recent', adminMiddleware, securityController.getRecentSecurityEvents);

// User security events
router.get('/events/user/:userId', adminMiddleware, securityController.getUserSecurityEvents);

// Account security details
router.get('/account/:userId', adminMiddleware, securityController.getAccountSecurity);

// Lock account
router.post('/lock/:userId', adminMiddleware, securityController.lockAccount);

// Unlock account
router.post('/unlock/:userId', adminMiddleware, securityController.unlockAccount);

// Update risk level
router.put('/risk-level/:userId', adminMiddleware, securityController.updateRiskLevel);

module.exports = router;