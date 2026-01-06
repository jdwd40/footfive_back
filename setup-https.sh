#!/bin/bash
# HTTPS Setup Script for jwd1.xyz

set -e

echo "=== Setting up HTTPS for jwd1.xyz ==="

# Create nginx config
echo "Creating nginx configuration..."
sudo tee /etc/nginx/sites-available/jwd1.xyz << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name jwd1.xyz www.jwd1.xyz;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect HTTP to HTTPS (after cert is obtained)
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name jwd1.xyz www.jwd1.xyz;

    # SSL certificates (will be created by certbot)
    ssl_certificate /etc/letsencrypt/live/jwd1.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jwd1.xyz/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

    # Proxy to Node.js API on port 9001
    location / {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }
}
EOF

# Enable the site
echo "Enabling site..."
sudo ln -sf /etc/nginx/sites-available/jwd1.xyz /etc/nginx/sites-enabled/jwd1.xyz

# Remove default site if it conflicts
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx config (will fail until cert exists, that's ok)
echo "Testing nginx config..."
sudo nginx -t 2>&1 || echo "Config test failed (expected - cert doesn't exist yet)"

# Temporarily allow HTTP for cert generation
echo "Creating temporary HTTP-only config for cert generation..."
sudo tee /etc/nginx/sites-available/jwd1.xyz-temp << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name jwd1.xyz www.jwd1.xyz;
    root /var/www/html;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 200 'Setting up SSL...';
        add_header Content-Type text/plain;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/jwd1.xyz-temp /etc/nginx/sites-enabled/jwd1.xyz
sudo nginx -t && sudo systemctl reload nginx

# Obtain SSL certificate
echo "Obtaining SSL certificate from Let's Encrypt..."
sudo certbot certonly --webroot -w /var/www/html -d jwd1.xyz -d www.jwd1.xyz --non-interactive --agree-tos --email admin@jwd1.xyz

# Restore full config with SSL
echo "Activating SSL configuration..."
sudo ln -sf /etc/nginx/sites-available/jwd1.xyz /etc/nginx/sites-enabled/jwd1.xyz
sudo rm -f /etc/nginx/sites-available/jwd1.xyz-temp
sudo nginx -t && sudo systemctl reload nginx

echo ""
echo "=== HTTPS Setup Complete ==="
echo "Your API is now available at: https://jwd1.xyz/api"
echo ""
echo "Don't forget to update CORS in your Node.js app to allow https://jwd1.xyz"
