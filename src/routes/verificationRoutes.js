const express = require('express');
const multer = require('multer');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const router = express.Router();

const verificationController = require('../controllers/verificationController');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ==================== IDENTITY VERIFICATION ====================

// Landlord: Submit identity verification (with file uploads)
router.post('/identity', authMiddleware, upload.fields([
  { name: 'idPhoto', maxCount: 1 },
  { name: 'selfie', maxCount: 1 }
]), verificationController.submitIdentityVerification);

// Landlord: Get identity verification status
router.get('/identity/status', authMiddleware, verificationController.getIdentityVerificationStatus);

// Admin: Get all pending identity verifications
router.get('/identity/pending', adminMiddleware, verificationController.getPendingIdentityVerifications);

// Admin: Review identity verification
router.put('/identity/:verificationId/review', adminMiddleware, verificationController.reviewIdentityVerification);

// ==================== PROPERTY VERIFICATION ====================

// Landlord: Submit property verification (with file uploads)
router.post('/property', authMiddleware, upload.fields([
  { name: 'propertyDocument', maxCount: 1 },
  { name: 'propertyPhotos', maxCount: 10 }
]), verificationController.submitPropertyVerification);

// Landlord: Get property verification status
router.get('/property/status', authMiddleware, verificationController.getPropertyVerificationStatus);

// Admin: Get all pending property verifications
router.get('/property/pending', adminMiddleware, verificationController.getPendingPropertyVerifications);

// Admin: Review property verification
router.put('/property/:verificationId/review', adminMiddleware, verificationController.reviewPropertyVerification);

// ==================== COMBINED VERIFICATION STATUS ====================

// Landlord: Get overall verification status
router.get('/status', authMiddleware, verificationController.getVerificationStatus);

module.exports = router;