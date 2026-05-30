const express = require('express');
const { authMiddleware, landlordOnly } = require('../middleware/auth');
const { createAgreement, getMyRequests, getLandlordRequests, updateAgreementStatus } = require('../controllers/agreementController');

const router = express.Router();

router.post('/', authMiddleware, createAgreement);
router.get('/tenant', authMiddleware, getMyRequests);
router.get('/landlord', authMiddleware, landlordOnly, getLandlordRequests);
router.put('/:id/status', authMiddleware, landlordOnly, updateAgreementStatus);

module.exports = router;