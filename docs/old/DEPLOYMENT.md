# Deployment Guide

FootFive backend is deployed to a VPS using GitHub Actions for continuous deployment.

## Deployment Overview

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Git Push   │ ──►  │   GitHub     │ ──►  │     VPS      │
│  to master   │      │   Actions    │      │  (PM2/Node)  │
└──────────────┘      └──────────────┘      └──────────────┘
                            │
                            ▼
                     SSH to VPS
                     git pull
                     npm ci
                     run migrations
                     pm2 restart
```

## GitHub Actions Workflow

The deployment workflow is defined in `.github/workflows/deploy.yml`:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [ master ]
  workflow_dispatch:  # Manual trigger

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - uses: appleboy/ssh-action@v0.1.8
      with:
        host: 77.68.4.18
        username: jd
        port: 4020
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /home/jd/footfive-backend
          git fetch origin && git reset --hard origin/master
          export NVM_DIR="$HOME/.nvm"
          [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
          npm ci --production
          PGPASSWORD=${{ secrets.PGPASSWORD }} psql -h localhost -U jd -d footfive -f db/migrations/002_add_event_types.sql || true
          npx pm2 delete footfive-backend || true
          export SIMULATION_AUTO_START=true
          npx pm2 start listen.js --name footfive-backend --update-env
          npx pm2 save
```

## Required GitHub Secrets

Configure these secrets in your repository settings (Settings → Secrets → Actions):

| Secret | Description |
|--------|-------------|
| `SSH_PRIVATE_KEY` | Private SSH key for VPS access |
| `PGPASSWORD` | PostgreSQL password for migrations |

### Setting Up SSH Key

1. Generate key pair (on your local machine):
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy"
```

2. Add public key to VPS:
```bash
ssh jd@77.68.4.18 -p 4020
echo "your-public-key" >> ~/.ssh/authorized_keys
```

3. Add private key as GitHub secret `SSH_PRIVATE_KEY`

## VPS Setup

### Initial Server Setup

1. **Install Node.js via NVM**:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 24
nvm use 24
```

2. **Install PM2**:
```bash
npm install -g pm2
```

3. **Install PostgreSQL**:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

4. **Create Database and User**:
```bash
sudo -u postgres psql
CREATE USER jd WITH PASSWORD 'your_password';
CREATE DATABASE footfive OWNER jd;
GRANT ALL PRIVILEGES ON DATABASE footfive TO jd;
\q
```

5. **Clone Repository**:
```bash
mkdir -p /home/jd/footfive-backend
cd /home/jd/footfive-backend
git clone https://github.com/jdwd40/footfive_back.git .
```

6. **Create Environment File**:
```bash
cat > .env.production << EOF
PGDATABASE=footfive
PGUSER=jd
PGPASSWORD=your_password
PGHOST=localhost
PGPORT=5432
NODE_ENV=production
SIMULATION_AUTO_START=true
EOF
```

7. **Initial Setup**:
```bash
npm ci --production
npm run migrate
npm run seed
```

8. **Start with PM2**:
```bash
pm2 start listen.js --name footfive-backend
pm2 save
pm2 startup  # Follow instructions to enable startup on boot
```

### Directory Structure on VPS

```
/home/jd/
├── footfive-backend/      # Application directory
│   ├── listen.js
│   ├── package.json
│   ├── .env.production
│   └── ...
└── .nvm/                  # Node Version Manager
```

## PM2 Commands

### Basic Operations

```bash
# List processes
pm2 list

# View logs
pm2 logs footfive-backend

# Real-time logs
pm2 logs footfive-backend --lines 100

# Restart application
pm2 restart footfive-backend

# Stop application
pm2 stop footfive-backend

# Delete from PM2
pm2 delete footfive-backend

# Save current process list
pm2 save
```

### Monitoring

```bash
# Real-time monitoring dashboard
pm2 monit

# Show detailed info
pm2 show footfive-backend

# Memory/CPU usage
pm2 status
```

## Manual Deployment

If GitHub Actions fails, deploy manually:

```bash
# SSH to VPS
ssh jd@77.68.4.18 -p 4020

# Navigate to app directory
cd /home/jd/footfive-backend

# Pull latest code
git fetch origin
git reset --hard origin/master

# Install dependencies
npm ci --production

# Run any new migrations
PGPASSWORD=your_password psql -h localhost -U jd -d footfive -f db/migrations/latest.sql

# Restart PM2
pm2 restart footfive-backend
```

## Nginx Reverse Proxy (Optional)

If using nginx as reverse proxy:

```nginx
# /etc/nginx/sites-available/footfive

server {
    listen 80;
    server_name jwd1.xyz;

    location /api {
        proxy_pass http://127.0.0.1:9001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;

        # SSE support
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        proxy_buffering off;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/footfive /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d jwd1.xyz
```

## Environment Variables

### Production Environment

| Variable | Value | Description |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Environment mode |
| `PGDATABASE` | `footfive` | Database name |
| `PGUSER` | `jd` | PostgreSQL user |
| `PGPASSWORD` | `****` | Database password |
| `PGHOST` | `localhost` | Database host |
| `PGPORT` | `5432` | Database port |
| `SIMULATION_AUTO_START` | `true` | Auto-start tournaments |

## Health Checks

### Check Application Status

```bash
# PM2 status
pm2 status

# API health check
curl http://localhost:9001/api

# Simulation status
curl http://localhost:9001/api/live/status
```

### Check Database

```bash
psql -U jd -d footfive -c "SELECT COUNT(*) FROM teams;"
```

### Check Logs

```bash
# Application logs
pm2 logs footfive-backend --lines 50

# System logs
journalctl -u pm2-jd -f
```

## Rollback

If deployment causes issues:

```bash
# View commit history
git log --oneline -10

# Rollback to previous commit
git reset --hard HEAD~1

# Restart application
pm2 restart footfive-backend
```

Or rollback to specific commit:
```bash
git reset --hard abc1234
pm2 restart footfive-backend
```

## Database Backup

### Manual Backup

```bash
pg_dump -U jd footfive > backup_$(date +%Y%m%d).sql
```

### Restore from Backup

```bash
psql -U jd -d footfive < backup_20250106.sql
```

### Automated Backups (Cron)

```bash
# Add to crontab
crontab -e

# Daily backup at 3 AM
0 3 * * * pg_dump -U jd footfive > /home/jd/backups/footfive_$(date +\%Y\%m\%d).sql
```

## Troubleshooting Deployment

### GitHub Actions Fails

1. Check workflow run logs in GitHub Actions tab
2. Common issues:
   - SSH key mismatch
   - Wrong port number
   - PM2 not found (use full path)

### Application Won't Start

```bash
# Check PM2 logs
pm2 logs footfive-backend --err

# Check if port is in use
lsof -i :9001

# Check Node.js version
node --version
```

### Database Connection Fails

```bash
# Test database connection
psql -U jd -d footfive -c "SELECT 1;"

# Check PostgreSQL status
sudo systemctl status postgresql

# Check pg_hba.conf for local connections
sudo cat /etc/postgresql/14/main/pg_hba.conf
```

## Monitoring

### Set Up PM2 Monitoring

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### External Monitoring

Consider using:
- UptimeRobot for uptime monitoring
- PM2 Plus for advanced monitoring
- Custom health check endpoint

## Deployment Checklist

Before deploying:
- [ ] Tests pass locally (`npm test`)
- [ ] No hardcoded secrets in code
- [ ] Database migrations are idempotent
- [ ] Environment variables documented

After deploying:
- [ ] Application starts (`pm2 status`)
- [ ] API responds (`curl /api`)
- [ ] Simulation running (`curl /api/live/status`)
- [ ] Check logs for errors (`pm2 logs`)
