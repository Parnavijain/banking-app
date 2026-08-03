const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  createSchedule, listSchedules, cancelSchedule,
} = require('../controllers/scheduleController');

const router = express.Router();
router.get('/scheduled-payments',      authenticate, listSchedules);
router.post('/scheduled-payments',     authenticate, createSchedule);
router.delete('/scheduled-payments/:id', authenticate, cancelSchedule);

module.exports = router;
