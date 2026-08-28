const express = require('express');
const { register, login, getMe, updateMe } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validateRegister, validateLogin } = require('../middleware/validation');

const router = express.Router();

router.post('/register', validateRegister, register);
router.post('/login', validateLogin, login);
router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, upload.single('avatar'), updateMe);

module.exports = router;
