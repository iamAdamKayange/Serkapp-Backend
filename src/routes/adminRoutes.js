const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

const router = express.Router();

// Apply auth middleware to all admin routes
router.use(authMiddleware);

// Dashboard stats
router.get('/dashboard/stats', adminMiddleware, adminController.getDashboardStats);

// KPI data
router.get('/dashboard/kpi', adminMiddleware, adminController.getKPIData);

// Recent activity
router.get('/activity/recent', adminMiddleware, adminController.getRecentActivity);

// Notifications
router.get('/notifications', adminMiddleware, adminController.getNotifications);

// Users management
router.get('/users', adminMiddleware, adminController.getUsers);

// Houses management
router.get('/houses', adminMiddleware, adminController.getHouses);

// Analytics
router.get('/analytics', adminMiddleware, (req, res) => {
  // Combined analytics endpoint
  res.json({ message: 'Use specific analytics endpoints' });
});

router.get('/analytics/user-growth', adminMiddleware, adminController.getUserGrowth);
router.get('/analytics/revenue', adminMiddleware, adminController.getRevenueTrends);
router.get('/analytics/verifications', adminMiddleware, adminController.getVerificationStats);

// Admin profile
router.get('/profile', adminMiddleware, adminController.getAdminProfile);

// Verification queue
router.get('/verifications/queue', adminMiddleware, adminController.getVerificationQueue);

module.exports = router;
