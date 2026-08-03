const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createStatement, listStatements, downloadStatement,
} = require('../controllers/statementController');

const router = express.Router();
router.get('/statements',                 authenticate, listStatements);
router.post('/statements',                authenticate, createStatement);
router.get('/statements/:id/download',    authenticate, downloadStatement);

module.exports = router;
