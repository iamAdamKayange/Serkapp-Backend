const express = require('express');
const { register, login, getMe, updateMe, deleteAccount, requestPasswordReset, resetPassword, changePassword } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validateRegister, validateLogin, validatePasswordReset, validatePasswordChange } = require('../middleware/validation');
const { safeEmailResponse, passwordOperationLimiter } = require('../middleware/security');

const router = express.Router();

router.post('/register', safeEmailResponse, validateRegister, register);
router.post('/login', safeEmailResponse, passwordOperationLimiter, validateLogin, login);
router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, upload.single('avatar'), updateMe);
router.delete('/me', authMiddleware, passwordOperationLimiter, deleteAccount);
router.post('/password-reset/request', passwordOperationLimiter, validatePasswordReset, requestPasswordReset);
router.post('/password-reset/confirm', passwordOperationLimiter, validatePasswordReset, resetPassword);
router.post('/change-password', authMiddleware, passwordOperationLimiter, validatePasswordChange, changePassword);

module.exports = router;
