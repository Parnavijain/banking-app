const express = require('express');
const { authenticate } = require('../middleware/auth');
const { createTransfer, listTransfers } = require('../controllers/transferController');

const router = express.Router();

router.post('/transfers', authenticate, createTransfer);
router.get('/transfers', authenticate, listTransfers);

module.exports = router;
