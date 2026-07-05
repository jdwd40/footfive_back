const jwt = require('jsonwebtoken');

// Dev fallback keeps local setup simple; set JWT_SECRET in .env.production.
const JWT_SECRET = process.env.JWT_SECRET || 'footfive-dev-jwt-secret';
const TOKEN_EXPIRY = '7d';

function signToken(user) {
    return jwt.sign(
        { userId: user.userId, username: user.username },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
    );
}

/**
 * Auth middleware for protected betting/wallet routes.
 * Expects: Authorization: Bearer <token>
 */
function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = { userId: payload.userId, username: payload.username };
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = { requireAuth, signToken, JWT_SECRET };
