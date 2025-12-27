const db = require('../db/connection');
const format = require('pg-format');

class MatchEvent {
    constructor(data) {
        this.eventId = data.event_id;
        this.fixtureId = data.fixture_id;
        this.minute = data.minute;
        this.second = data.second;
        this.addedTime = data.added_time;
        this.eventType = data.event_type;
        this.teamId = data.team_id;
        this.teamName = data.team_name || null;
        this.playerId = data.player_id;
        this.playerName = data.player_name || null;
        this.assistPlayerId = data.assist_player_id;
        this.assistPlayerName = data.assist_player_name || null;
        this.description = data.description;
        this.xg = data.xg ? parseFloat(data.xg) : null;
        this.outcome = data.outcome;
        this.bundleId = data.bundle_id;
        this.bundleStep = data.bundle_step;
        this.metadata = data.metadata;
        this.createdAt = data.created_at;
    }

    // Create a single event
    static async create(eventData) {
        const result = await db.query(`
            INSERT INTO match_events
            (fixture_id, minute, second, added_time, event_type, team_id,
             player_id, assist_player_id, description, xg, outcome,
             bundle_id, bundle_step, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
        `, [
            eventData.fixtureId,
            eventData.minute,
            eventData.second || 0,
            eventData.addedTime || null,
            eventData.eventType,
            eventData.teamId || null,
            eventData.playerId || null,
            eventData.assistPlayerId || null,
            eventData.description || null,
            eventData.xg || null,
            eventData.outcome || null,
            eventData.bundleId || null,
            eventData.bundleStep || null,
            JSON.stringify(eventData.metadata || {})
        ]);

        return new MatchEvent(result.rows[0]);
    }

    // Bulk insert events (for real-time simulation batches)
    static async createBatch(events) {
        if (!events.length) return [];

        const values = events.map(e => [
            e.fixtureId,
            e.minute,
            e.second || 0,
            e.addedTime || null,
            e.eventType,
            e.teamId || null,
            e.playerId || null,
            e.assistPlayerId || null,
            e.description || null,
            e.xg || null,
            e.outcome || null,
            e.bundleId || null,
            e.bundleStep || null,
            JSON.stringify(e.metadata || {})
        ]);

        const result = await db.query(format(`
            INSERT INTO match_events
            (fixture_id, minute, second, added_time, event_type, team_id,
             player_id, assist_player_id, description, xg, outcome,
             bundle_id, bundle_step, metadata)
            VALUES %L
            RETURNING *
        `, values));

        return result.rows.map(row => new MatchEvent(row));
    }

    // Get all events for a fixture
    static async getByFixtureId(fixtureId, { includePlayerNames = false } = {}) {
        let query;

        if (includePlayerNames) {
            query = `
                SELECT e.*,
                       t.name AS team_name,
                       p.name AS player_name,
                       ap.name AS assist_player_name
                FROM match_events e
                LEFT JOIN teams t ON e.team_id = t.team_id
                LEFT JOIN players p ON e.player_id = p.player_id
                LEFT JOIN players ap ON e.assist_player_id = ap.player_id
                WHERE e.fixture_id = $1
                ORDER BY e.minute, e.second, e.event_id
            `;
        } else {
            query = `
                SELECT * FROM match_events
                WHERE fixture_id = $1
                ORDER BY minute, second, event_id
            `;
        }

        const result = await db.query(query, [fixtureId]);
        return result.rows.map(row => new MatchEvent(row));
    }

    // Get events by type
    static async getByType(fixtureId, eventType) {
        const result = await db.query(`
            SELECT e.*, t.name AS team_name, p.name AS player_name
            FROM match_events e
            LEFT JOIN teams t ON e.team_id = t.team_id
            LEFT JOIN players p ON e.player_id = p.player_id
            WHERE e.fixture_id = $1 AND e.event_type = $2
            ORDER BY e.minute, e.second
        `, [fixtureId, eventType]);

        return result.rows.map(row => new MatchEvent(row));
    }

    // Get goals for a fixture
    static async getGoals(fixtureId) {
        return this.getByType(fixtureId, 'goal');
    }

    // Get cards for a fixture
    static async getCards(fixtureId) {
        const result = await db.query(`
            SELECT e.*, t.name AS team_name, p.name AS player_name
            FROM match_events e
            LEFT JOIN teams t ON e.team_id = t.team_id
            LEFT JOIN players p ON e.player_id = p.player_id
            WHERE e.fixture_id = $1
              AND e.event_type IN ('yellow_card', 'red_card')
            ORDER BY e.minute, e.second
        `, [fixtureId]);

        return result.rows.map(row => new MatchEvent(row));
    }

    // Get events by bundle
    static async getByBundleId(bundleId) {
        const result = await db.query(`
            SELECT * FROM match_events
            WHERE bundle_id = $1
            ORDER BY bundle_step
        `, [bundleId]);

        return result.rows.map(row => new MatchEvent(row));
    }

    // Get events after a certain point (for live streaming)
    static async getAfter(fixtureId, afterEventId) {
        const result = await db.query(`
            SELECT * FROM match_events
            WHERE fixture_id = $1 AND event_id > $2
            ORDER BY minute, second, event_id
        `, [fixtureId, afterEventId]);

        return result.rows.map(row => new MatchEvent(row));
    }

    // Count events by type for a fixture
    static async countByType(fixtureId) {
        const result = await db.query(`
            SELECT event_type, COUNT(*) as count
            FROM match_events
            WHERE fixture_id = $1
            GROUP BY event_type
        `, [fixtureId]);

        return result.rows.reduce((acc, row) => {
            acc[row.event_type] = parseInt(row.count);
            return acc;
        }, {});
    }

    // Delete all events for a fixture
    static async deleteByFixtureId(fixtureId) {
        const result = await db.query(`
            DELETE FROM match_events WHERE fixture_id = $1 RETURNING event_id
        `, [fixtureId]);

        return result.rows.length;
    }

    // Format for API response
    toJSON() {
        return {
            eventId: this.eventId,
            minute: this.minute,
            second: this.second,
            addedTime: this.addedTime,
            displayTime: this.addedTime
                ? `${this.minute}+${this.addedTime}'`
                : `${this.minute}'`,
            type: this.eventType,
            team: this.teamName || this.teamId,
            player: this.playerName || this.playerId,
            assist: this.assistPlayerName || this.assistPlayerId,
            description: this.description,
            xg: this.xg,
            outcome: this.outcome,
            bundleId: this.bundleId,
            bundleStep: this.bundleStep,
            metadata: this.metadata
        };
    }
}

module.exports = MatchEvent;
