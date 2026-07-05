const express = require('express');
const router = express.Router();
const { getWallet, addDummyFunds, getTransactions } = require('../controllers/walletController');
const { requireAuth } = require('../middleware/auth');

// All wallet routes require auth. Virtual/dummy funds only.
router.get('/', requireAuth, getWallet);                    // GET /api/wallet
router.post('/add-funds', requireAuth, addDummyFunds);      // POST /api/wallet/add-funds
router.get('/transactions', requireAuth, getTransactions);  // GET /api/wallet/transactions?limit=

module.exports = router;
