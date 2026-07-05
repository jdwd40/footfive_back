const express = require('express');
const router = express.Router();
const { register, login, profile } = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

router.post('/register', register);       // POST /api/auth/register
router.post('/login', login);             // POST /api/auth/login
router.get('/profile', requireAuth, profile); // GET /api/auth/profile

module.exports = router;
