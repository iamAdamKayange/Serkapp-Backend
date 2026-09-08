const express = require('express');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const router = express.Router();

const verificationController = require('../controllers/verificationController');

// ==================== IDENTITY VERIFICATION ====================

// Landlord: Submit identity verification (with file uploads)
router.post('/identity', authMiddleware, upload.fields([
  { name: 'idPhoto', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'idDocument', maxCount: 1 } // PDF/DOC support
], 3), verificationController.submitIdentityVerification);

// Landlord: Get identity verification status
router.get('/identity/status', authMiddleware, verificationController.getIdentityVerificationStatus);

// Landlord: Cancel identity verification
router.post('/identity/cancel', authMiddleware, verificationController.cancelIdentityVerification);

// Admin: Get all pending identity verifications
router.get('/identity/pending', adminMiddleware, verificationController.getPendingIdentityVerifications);

// Admin: Review identity verification
router.put('/identity/:verificationId/review', adminMiddleware, verificationController.reviewIdentityVerification);

// ==================== PROPERTY VERIFICATION ====================

// Landlord: Submit property verification (with file uploads)
router.post('/property', authMiddleware, upload.fields([
  { name: 'propertyDocument', maxCount: 1 },
  { name: 'propertyPhotos', maxCount: 10 }
], 11), verificationController.submitPropertyVerification);

// Landlord: Get property verification status
router.get('/property/status', authMiddleware, verificationController.getPropertyVerificationStatus);

// Landlord: Cancel property verification
router.post('/property/cancel', authMiddleware, verificationController.cancelPropertyVerification);

// Landlord: Cancel all active verification requests
router.post('/cancel', authMiddleware, verificationController.cancelAllVerificationRequests);

// Admin: Get all pending property verifications
router.get('/property/pending', adminMiddleware, verificationController.getPendingPropertyVerifications);

// Admin: Review property verification
router.put('/property/:verificationId/review', adminMiddleware, verificationController.reviewPropertyVerification);

// ==================== COMBINED VERIFICATION ====================

// Landlord: Submit complete verification (identity + property as single application)
router.post('/complete', authMiddleware, upload.fields([
  { name: 'idPhoto', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
  { name: 'idDocument', maxCount: 1 },
  { name: 'propertyDocument', maxCount: 1 },
  { name: 'propertyPhotos', maxCount: 10 }
], 14), verificationController.submitCompleteVerification);

// ==================== COMBINED VERIFICATION STATUS ====================

// Landlord: Get overall verification status
router.get('/status', authMiddleware, verificationController.getVerificationStatus);

module.exports = router;
