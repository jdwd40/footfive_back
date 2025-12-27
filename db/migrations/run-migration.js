const fs = require('fs');
const path = require('path');
const db = require('../connection');

async function runMigration(migrationFile) {
    const filePath = path.join(__dirname, migrationFile);

    if (!fs.existsSync(filePath)) {
        console.error(`Migration file not found: ${filePath}`);
        process.exit(1);
    }

    const sql = fs.readFileSync(filePath, 'utf8');

    console.log(`Running migration: ${migrationFile}`);
    console.log('---');

    try {
        await db.query(sql);
        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error.message);
        if (error.detail) console.error('Detail:', error.detail);
        if (error.hint) console.error('Hint:', error.hint);
        process.exit(1);
    } finally {
        await db.end();
    }
}

// Run specific migration or default to 001
const migrationFile = process.argv[2] || '001_match_system.sql';
runMigration(migrationFile);
