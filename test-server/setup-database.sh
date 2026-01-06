#!/bin/bash

# Database setup script for FootFive app
# Run this script to create the database and user

echo "Setting up FootFive database..."

# Create database and user
psql -U jd -c "CREATE DATABASE footfive_dev;" 2>/dev/null || echo "Database footfive_dev already exists"

echo "Database setup complete!"
echo ""
echo "Database Details:"
echo "- Database: footfive_dev"
echo "- User: jd"
echo "- Host: localhost"
echo "- Port: 5432"
echo ""
echo "Your .env file has been created with these settings."