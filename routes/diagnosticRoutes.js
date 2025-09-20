const express = require('express');
const router = express.Router();

const diagnosticController = require('../controllers/diagnosticController');

// Route to get database status and diagnostics
router.get('/db', diagnosticController.getDatabaseStatus);

// Route to manually seed the database
router.post('/seed', diagnosticController.seedDatabase);
router.get('/seed', diagnosticController.seedDatabase); // GET alternative for easier testing

module.exports = router;
