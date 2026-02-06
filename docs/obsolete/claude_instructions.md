# VPS Setup Instructions for FootFive Backend Deployment

## 1. VPS Initial Setup

```bash
# SSH into VPS
ssh -p 4020 jd@213.165.91.221

# Create app directory
mkdir -p /home/jd/footfive-backend
cd /home/jd/footfive-backend

# Install Node.js (if needed)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL (if needed)
sudo apt update
sudo apt install postgresql postgresql-contrib

# Install PM2 process manager
sudo npm install -g pm2
```

## 2. Database Setup

```bash
# Create database
sudo -u postgres psql
CREATE DATABASE footfive_prod;
CREATE USER footfive_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE footfive_prod TO footfive_user;
\q
```

## 3. Environment Configuration

Create `/home/jd/footfive-backend/.env.production`:

```env
PGDATABASE=footfive_prod
PGHOST=localhost
PGUSER=footfive_user
PGPASSWORD=your_secure_password
PGPORT=5432
NODE_ENV=production
PORT=3000
```

## 4. GitHub Actions Workflow

Create `.github/workflows/deploy.yml` in your repository:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - run: npm ci
    - run: npm test
    
    - uses: appleboy/ssh-action@v0.1.8
      with:
        host: 213.165.91.221
        username: jd
        port: 4020
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        script: |
          cd /home/jd/footfive-backend
          if [ ! -d ".git" ]; then
            git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git .
          else
            git fetch origin && git reset --hard origin/main
          fi
          npm ci --production
          npm run seed
          pm2 restart footfive-backend || pm2 start listen.js --name footfive-backend
          pm2 save
```

## 5. SSH Key Setup

```bash
# Generate SSH key (local machine)
ssh-keygen -t rsa -b 4096 -C "github-actions"

# Copy to VPS
ssh-copy-id -p 4020 jd@213.165.91.221

# Add private key to GitHub Secrets as SSH_PRIVATE_KEY
```

## 6. PM2 Startup Configuration

```bash
# On VPS
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u jd --hp /home/jd
```

## 7. Optional: Nginx Reverse Proxy

```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/footfive-backend
```

Nginx config:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/footfive-backend /etc/nginx/sites-enabled/
sudo systemctl restart nginx
```

## Important Reminders

- Replace `YOUR_USERNAME/YOUR_REPO_NAME` in the workflow
- Add `SSH_PRIVATE_KEY` to GitHub repository secrets
- Update database password in `.env.production`
- Ensure your VPS firewall allows traffic on the required ports
- Test the deployment after setup
