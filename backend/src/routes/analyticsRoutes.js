const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getSummary } = require('../controllers/analyticsController');

const router = express.Router();

router.get('/analytics/summary', authenticate, getSummary);

module.exports = router;
