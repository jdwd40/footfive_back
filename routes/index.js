const express = require('express');
const router = express.Router();
const jCupRoutes = require('./jCupRoutes');

router.get('/', (req, res) => {
    res.send({ "msg:": "ok" });
});

router.use('/jcup', jCupRoutes);

module.exports = router;