const express = require('express');
const router = express.Router();

const jCupRoutes = require('./jCupRoutes');
const teamRoutes = require('./teamRoutes');
const playerRoutes = require('./playerRoutes');

router.get('/', (req, res) => {
    res.send({ "msg:": "ok" });
});

router.use('/jcup', jCupRoutes);

router.use('/teams', teamRoutes);

router.use('/players', playerRoutes);

module.exports = router;