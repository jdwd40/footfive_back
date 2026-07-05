const Wallet = require('../models/WalletModel');

const MAX_DUMMY_TOPUP = 10000;
const DEFAULT_DUMMY_TOPUP = 500;

// Get wallet balance (virtual credits only)
const getWallet = async (req, res) => {
    try {
        const wallet = await Wallet.getByUserId(req.user.userId);
        if (!wallet) {
            return res.status(404).json({ error: 'Wallet not found' });
        }
        res.json({ wallet: wallet.toJSON() });
    } catch (error) {
        console.error('getWallet error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Add dummy funds for testing/gameplay. No real payments exist anywhere.
const addDummyFunds = async (req, res) => {
    try {
        const amount = req.body && req.body.amount !== undefined
            ? Number(req.body.amount)
            : DEFAULT_DUMMY_TOPUP;

        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: 'amount must be a positive number' });
        }

        if (amount > MAX_DUMMY_TOPUP) {
            return res.status(400).json({ error: `Maximum dummy top-up is ${MAX_DUMMY_TOPUP} FC` });
        }

        const cleanAmount = Math.round(amount * 100) / 100;

        const { wallet, transaction } = await Wallet.applyTransaction({
            userId: req.user.userId,
            amount: cleanAmount,
            transactionType: 'dummy_funds',
            description: `Added ${cleanAmount.toFixed(2)} FC dummy funds (virtual test money)`
        });

        res.json({
            message: 'Dummy funds added (virtual credits only)',
            wallet: wallet.toJSON(),
            transaction
        });
    } catch (error) {
        console.error('addDummyFunds error:', error);
        res.status(500).json({ error: error.message });
    }
};

// List recent wallet transactions
const getTransactions = async (req, res) => {
    try {
        const limit = req.query.limit ? Math.min(parseInt(req.query.limit), 100) : 20;
        const transactions = await Wallet.getTransactions(req.user.userId, limit);

        res.json({
            count: transactions.length,
            transactions
        });
    } catch (error) {
        console.error('getTransactions error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { getWallet, addDummyFunds, getTransactions, MAX_DUMMY_TOPUP, DEFAULT_DUMMY_TOPUP };
