const express = require('express');
const router = express.Router();

const jCupRoutes = require('./jCupRoutes');
const teamRoutes = require('./teamRoutes');

router.get('/', (req, res) => {
    res.send({ "msg:": "ok" });
});

router.use('/jcup', jCupRoutes);

router.use('/teams', teamRoutes);

module.exports = router;