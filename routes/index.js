const express = require('express');
const router = express.Router();

const teamRoutes = require('./teamRoutes');
const playerRoutes = require('./playerRoutes');
const diagnosticRoutes = require('./diagnosticRoutes');
const fixtureRoutes = require('./fixtureRoutes');
const liveRoutes = require('./liveRoutes');
const adminRoutes = require('./adminRoutes');
const authRoutes = require('./authRoutes');
const walletRoutes = require('./walletRoutes');
const betRoutes = require('./betRoutes');
const garageRoutes = require('./garageRoutes');

router.get('/', (req, res) => {
    res.send({ msg: 'ok' });
});

router.use('/teams', teamRoutes);

router.use('/players', playerRoutes);

router.use('/diagnostic', diagnosticRoutes);

router.use('/fixtures', fixtureRoutes);

router.use('/live', liveRoutes);

router.use('/admin', adminRoutes);

router.use('/auth', authRoutes);

router.use('/wallet', walletRoutes);

router.use('/betting', betRoutes);

router.use('/garage', garageRoutes);

module.exports = router;