const bcrypt = require('bcryptjs');
const User = require('../models/UserModel');
const Wallet = require('../models/WalletModel');
const { signToken } = require('../middleware/auth');

const STARTING_BALANCE = 1000; // Virtual FootFive Credits for new accounts

// Register a new user (virtual betting account - dummy funds only)
const register = async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ error: 'username and password required' });
        }

        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            return res.status(400).json({ error: 'Username must be 3-20 characters (letters, numbers, underscores)' });
        }

        if (typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = await User.getByUsername(username);
        if (existing) {
            return res.status(409).json({ error: 'Username already taken' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ username, passwordHash });

        await Wallet.createForUser(user.userId, 0);
        const { wallet } = await Wallet.applyTransaction({
            userId: user.userId,
            amount: STARTING_BALANCE,
            transactionType: 'dummy_funds',
            description: 'Welcome starting balance (virtual credits)'
        });

        res.status(201).json({
            message: 'Account created',
            token: signToken(user),
            user: user.toJSON(),
            wallet: wallet.toJSON()
        });
    } catch (error) {
        console.error('register error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Login
const login = async (req, res) => {
    try {
        const { username, password } = req.body || {};

        if (!username || !password) {
            return res.status(400).json({ error: 'username and password required' });
        }

        const user = await User.getByUsername(username);
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const wallet = await Wallet.getByUserId(user.userId);

        res.json({
            message: 'Logged in',
            token: signToken(user),
            user: user.toJSON(),
            wallet: wallet ? wallet.toJSON() : null
        });
    } catch (error) {
        console.error('login error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Current user profile (protected)
const profile = async (req, res) => {
    try {
        const user = await User.getById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const wallet = await Wallet.getByUserId(user.userId);

        res.json({
            user: user.toJSON(),
            wallet: wallet ? wallet.toJSON() : null
        });
    } catch (error) {
        console.error('profile error:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = { register, login, profile, STARTING_BALANCE };
