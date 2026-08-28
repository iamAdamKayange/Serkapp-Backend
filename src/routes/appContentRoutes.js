const express = require('express');
const { getAppContent } = require('../controllers/appContentController');

const router = express.Router();

router.get('/app-settings', getAppContent);

module.exports = router;
