#!/bin/bash

# Test database setup script for FootFive app
# Run this script to create the test database

echo "Setting up FootFive test database..."

# Create test database with credentials
PGPASSWORD=K1ller1921 psql -U jd -h localhost -c "CREATE DATABASE footfive_test;" 2>/dev/null || echo "Database footfive_test already exists"

# Grant permissions (if needed)
PGPASSWORD=K1ller1921 psql -U jd -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE footfive_test TO jd;" 2>/dev/null

echo "Test database setup complete!"
echo ""
echo "Test Database Details:"
echo "- Database: footfive_test"
echo "- User: jd"
echo "- Host: localhost"
echo "- Port: 5432"
echo ""
echo "Environment file: .env.test"
echo ""
echo "To run tests with this database:"
echo "  NODE_ENV=test npm test"
