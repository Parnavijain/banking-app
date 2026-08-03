const express = require('express');
const {
  register, login, me,
  listSessions, revokeSession, logoutAll,
} = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticate, me);

router.get('/sessions',              authenticate, listSessions);
router.delete('/sessions/:jti',      authenticate, revokeSession);
router.post('/logout-all',           authenticate, logoutAll);

module.exports = router;
