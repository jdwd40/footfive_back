const express = require('express');
const router = express.Router();

const jCupRoutes = require('./jCupRoutes');
const teamRoutes = require('./teamRoutes');
const playerRoutes = require('./playerRoutes');
const diagnosticRoutes = require('./diagnosticRoutes');
const fixtureRoutes = require('./fixtureRoutes');
const liveRoutes = require('./liveRoutes');
const adminRoutes = require('./adminRoutes');

router.get('/', (req, res) => {
    res.send({ "msg:": "ok" });
});

router.use('/jcup', jCupRoutes);

router.use('/teams', teamRoutes);

router.use('/players', playerRoutes);

router.use('/diagnostic', diagnosticRoutes);

router.use('/fixtures', fixtureRoutes);

router.use('/live', liveRoutes);

router.use('/admin', adminRoutes);

module.exports = router;