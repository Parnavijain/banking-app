const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getMyAccounts, openAccount, getFxRates, getAllAccounts,
} = require('../controllers/accountController');

const router = express.Router();

router.get('/accounts',        authenticate, getMyAccounts);
router.post('/accounts',       authenticate, openAccount);
router.get('/fx-rates',        authenticate, getFxRates);

module.exports = router;
