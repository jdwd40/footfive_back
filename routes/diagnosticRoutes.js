const express = require('express');
const router = express.Router();

const diagnosticController = require('../controllers/diagnosticController');

// Route to get database status and diagnostics
router.get('/', diagnosticController.getDatabaseStatus);

// Route to manually seed the database
router.post('/seed', diagnosticController.seedDatabase);

module.exports = router;
