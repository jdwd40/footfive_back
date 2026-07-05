const db = require('../db/connection');

/**
 * Wallet - virtual/dummy funds only. There is no real money anywhere
 * in this system; balances are game credits for testing and gameplay.
 */
class Wallet {
    constructor(data) {
        this.walletId = data.wallet_id;
        this.userId = data.user_id;
        this.balance = parseFloat(data.balance);
        this.updatedAt = data.updated_at;
    }

    static async createForUser(userId, startingBalance = 0) {
        const result = await db.query(`
            INSERT INTO user_wallets (user_id, balance)
            VALUES ($1, $2)
            RETURNING *
        `, [userId, startingBalance]);

        return new Wallet(result.rows[0]);
    }

    static async getByUserId(userId) {
        const result = await db.query(`
            SELECT * FROM user_wallets WHERE user_id = $1
        `, [userId]);

        return result.rows.length ? new Wallet(result.rows[0]) : null;
    }

    /**
     * Atomically credit (positive amount) or debit (negative amount) a wallet
     * and record a wallet transaction. Runs inside the caller's transaction
     * when a client is provided, otherwise on the shared pool.
     *
     * Throws if a debit would take the balance below zero
     * (the CHECK constraint also guards this at the DB level).
     */
    static async applyTransaction({ userId, amount, transactionType, betId = null, description = null }, client = db) {
        const walletResult = await client.query(`
            UPDATE user_wallets
            SET balance = balance + $2,
                updated_at = NOW()
            WHERE user_id = $1
            RETURNING *
        `, [userId, amount]);

        if (!walletResult.rows.length) {
            throw new Error(`Wallet for user ${userId} not found`);
        }

        const wallet = new Wallet(walletResult.rows[0]);

        const txResult = await client.query(`
            INSERT INTO wallet_transactions (user_id, amount, balance_after, transaction_type, bet_id, description)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *
        `, [userId, amount, wallet.balance, transactionType, betId, description]);

        return { wallet, transaction: Wallet.formatTransaction(txResult.rows[0]) };
    }

    static async getTransactions(userId, limit = 20) {
        const result = await db.query(`
            SELECT * FROM wallet_transactions
            WHERE user_id = $1
            ORDER BY created_at DESC, transaction_id DESC
            LIMIT $2
        `, [userId, limit]);

        return result.rows.map(row => Wallet.formatTransaction(row));
    }

    static formatTransaction(row) {
        return {
            transactionId: row.transaction_id,
            userId: row.user_id,
            amount: parseFloat(row.amount),
            balanceAfter: parseFloat(row.balance_after),
            transactionType: row.transaction_type,
            betId: row.bet_id,
            description: row.description,
            createdAt: row.created_at
        };
    }

    toJSON() {
        return {
            userId: this.userId,
            balance: this.balance,
            currency: 'FC', // FootFive Credits - virtual only
            isVirtual: true,
            updatedAt: this.updatedAt
        };
    }
}

module.exports = Wallet;
