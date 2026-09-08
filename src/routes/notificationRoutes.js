const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const {
  deleteNotification,
  getAlertPreference,
  getNotifications,
  getSavedHouseStatus,
  markNotificationAsRead,
  removeSavedHouse,
  saveAlertPreference,
  saveHouse,
} = require('../controllers/notificationController');

const router = express.Router();

// All notification routes should be protected
router.get('/', authMiddleware, getNotifications);
router.get('/preferences', authMiddleware, getAlertPreference);
router.put('/preferences', authMiddleware, saveAlertPreference);
router.get('/saved-houses/:houseId', authMiddleware, getSavedHouseStatus);
router.post('/saved-houses', authMiddleware, saveHouse);
router.delete('/saved-houses/:houseId', authMiddleware, removeSavedHouse);
router.delete('/:notificationId', authMiddleware, deleteNotification);
router.put('/:notificationId/read', authMiddleware, markNotificationAsRead);

module.exports = router;
