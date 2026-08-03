const express = require('express');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const {
  listUsers, listTransactions,
  proposeAction, listProposals, approveProposal, rejectProposal,
} = require('../controllers/adminController');

const router = express.Router();
router.use(authenticate, requireRole('admin'));

router.get('/admin/users',                     listUsers);
router.get('/admin/transactions',              listTransactions);
router.get('/admin/proposals',                 listProposals);
router.post('/admin/proposals',                proposeAction);
router.post('/admin/proposals/:id/approve',    approveProposal);
router.post('/admin/proposals/:id/reject',     rejectProposal);

module.exports = router;
