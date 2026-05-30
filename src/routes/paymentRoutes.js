const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { initiatePayment, mpesaCallback, getPaymentStatus } = require('../controllers/paymentController');

const router = express.Router();

router.post('/initiate', authMiddleware, initiatePayment);
router.post('/mpesa-callback', mpesaCallback);  // webhook – no auth needed
router.get('/status/:transactionId', authMiddleware, getPaymentStatus);

module.exports = router;