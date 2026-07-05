const db = require('../db/connection');

class User {
    constructor(data) {
        this.userId = data.user_id;
        this.username = data.username;
        this.passwordHash = data.password_hash;
        this.createdAt = data.created_at;
    }

    // Create a new user (password must already be hashed)
    static async create({ username, passwordHash }) {
        const result = await db.query(`
            INSERT INTO users (username, password_hash)
            VALUES ($1, $2)
            RETURNING *
        `, [username, passwordHash]);

        return new User(result.rows[0]);
    }

    static async getByUsername(username) {
        const result = await db.query(`
            SELECT * FROM users WHERE username = $1
        `, [username]);

        return result.rows.length ? new User(result.rows[0]) : null;
    }

    static async getById(userId) {
        const result = await db.query(`
            SELECT * FROM users WHERE user_id = $1
        `, [userId]);

        return result.rows.length ? new User(result.rows[0]) : null;
    }

    // Public-safe shape (never expose password_hash)
    toJSON() {
        return {
            userId: this.userId,
            username: this.username,
            createdAt: this.createdAt
        };
    }
}

module.exports = User;
