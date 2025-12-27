const express = require('express');
const router = express.Router();

const jCupRoutes = require('./jCupRoutes');
const teamRoutes = require('./teamRoutes');
const playerRoutes = require('./playerRoutes');
const diagnosticRoutes = require('./diagnosticRoutes');
const fixtureRoutes = require('./fixtureRoutes');

router.get('/', (req, res) => {
    res.send({ "msg:": "ok" });
});

router.use('/jcup', jCupRoutes);

router.use('/teams', teamRoutes);

router.use('/players', playerRoutes);

router.use('/diagnostic', diagnosticRoutes);

router.use('/fixtures', fixtureRoutes);

module.exports = router;