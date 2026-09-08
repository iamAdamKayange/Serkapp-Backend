const express = require('express');
const { register, login, getMe, updateMe, deleteAccount } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validateRegister, validateLogin } = require('../middleware/validation');
const { safeEmailResponse, passwordOperationLimiter } = require('../middleware/security');

const router = express.Router();

router.post('/register', safeEmailResponse, validateRegister, register);
router.post('/login', safeEmailResponse, passwordOperationLimiter, validateLogin, login);
router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, upload.single('avatar'), updateMe);
router.delete('/me', authMiddleware, passwordOperationLimiter, deleteAccount);

module.exports = router;
