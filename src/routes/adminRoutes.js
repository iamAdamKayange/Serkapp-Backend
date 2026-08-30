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
router.post('/users/:userId/ban', adminMiddleware, adminController.banUser);
router.post('/users/:userId/unban', adminMiddleware, adminController.unbanUser);

// Houses management
router.get('/houses', adminMiddleware, adminController.getHouses);
router.get('/houses/:houseId', adminMiddleware, adminController.getHouseDetails);

// Verification queue
router.get('/verifications/queue', adminMiddleware, adminController.getVerificationQueue);
router.post('/verifications/:verificationId/approve', adminMiddleware, adminController.approveVerification);
router.post('/verifications/:verificationId/reject', adminMiddleware, adminController.rejectVerification);

module.exports = router;
