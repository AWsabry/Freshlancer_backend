# Deployment Guide

## Prerequisites
- Node.js >= 16.0.0
- MongoDB Atlas account or MongoDB instance
- PM2 (for process management) - Install globally: `npm install -g pm2`

## Environment Setup

1. Copy `env.example` to `config.env`:
   ```bash
   cp env.example config.env
   ```

2. Fill in all required environment variables in `config.env`
   - Update database connection string
   - Set strong JWT secret
   - Configure email SMTP settings
   - Set payment gateway credentials
   - Update URLs for production

3. Set `NODE_ENV=production` in `config.env` for production deployment

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

## Local Production Test

Test the application in production mode locally:
```bash
npm run start:prod
```

Visit `http://localhost:8080/health` to verify the server is running.

## PM2 Deployment

### Initial Setup

1. Install PM2 globally (if not already installed):
   ```bash
   npm install -g pm2
   ```

2. Create logs directory:
   ```bash
   mkdir -p logs
   ```

3. Start application with PM2:
   ```bash
   npm run pm2:start
   ```

   Or start with production environment:
   ```bash
   pm2 start ecosystem.config.js --env production
   ```

### PM2 Management Commands

- **Check status:**
  ```bash
  pm2 status
  ```

- **View logs:**
  ```bash
  npm run pm2:logs
  # Or
  pm2 logs freshlancer-api
  ```

- **Restart application:**
  ```bash
  npm run pm2:restart
  ```

- **Stop application:**
  ```bash
  npm run pm2:stop
  ```

- **Delete application from PM2:**
  ```bash
  npm run pm2:delete
  ```

- **Monitor application:**
  ```bash
  pm2 monit
  ```

### PM2 Startup Script (Auto-start on server reboot)

1. Generate startup script:
   ```bash
   pm2 startup
   ```
   This will output a command - run it with sudo.

2. Save PM2 process list:
   ```bash
   pm2 save
   ```

Now PM2 will automatically restart your application on server reboot.

## Health Check

The application includes a health check endpoint:
- **URL:** `http://your-domain.com/health`
- **Response:**
  ```json
  {
    "status": "success",
    "message": "Server is running",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "uptime": 3600,
    "environment": "production"
  }
  ```

## Production Checklist

- [ ] All environment variables are set in `config.env`
- [ ] `NODE_ENV=production` is set
- [ ] Database connection string is correct
- [ ] JWT secret is strong and unique
- [ ] Email SMTP credentials are configured
- [ ] Payment gateway credentials are set
- [ ] CORS is configured (currently allows all origins)
- [ ] Rate limiting is enabled (100 requests/hour in production)
- [ ] PM2 is configured and running
- [ ] Logs directory exists
- [ ] Health check endpoint is accessible
- [ ] Graceful shutdown is working

## Monitoring

### PM2 Monitoring
- Use `pm2 monit` for real-time monitoring
- Check logs in `logs/` directory
- Monitor via PM2 dashboard: `pm2 plus` (optional)

### Application Monitoring
- Health check endpoint: `/health`
- Check PM2 status: `pm2 status`
- View logs: `pm2 logs freshlancer-api`

## Troubleshooting

### Application won't start
1. Check environment variables in `config.env`
2. Verify database connection
3. Check logs: `pm2 logs freshlancer-api`
4. Verify Node.js version: `node --version` (should be >= 16.0.0)

### Database connection errors
1. Verify MongoDB connection string
2. Check network connectivity
3. Verify database credentials
4. Check MongoDB Atlas IP whitelist (if using Atlas)

### High memory usage
- PM2 is configured to restart at 1GB memory usage
- Monitor with: `pm2 monit`
- Check for memory leaks in application code

### Rate limiting issues
- Rate limit is set to 100 requests/hour per IP in production
- Adjust in `app.js` if needed

## Security Notes

- **CORS:** Currently configured to allow all origins. Consider restricting in production if needed.
- **Rate Limiting:** Enabled (100 req/hour in production)
- **Environment Variables:** Never commit `config.env` to version control
- **JWT Secret:** Use a strong, unique secret in production
- **HTTPS:** Recommended to use a reverse proxy (Nginx) with SSL/TLS

## Updates and Maintenance

### Deploying Updates

1. Pull latest code:
   ```bash
   git pull origin main
   ```

2. Install new dependencies (if any):
   ```bash
   npm install
   ```

3. Restart application:
   ```bash
   npm run pm2:restart
   ```

### Zero-Downtime Deployment

PM2 cluster mode allows zero-downtime deployments:
```bash
pm2 reload ecosystem.config.js --env production
```

This will reload the application with zero downtime.

## Additional Resources

- [PM2 Documentation](https://pm2.keymetrics.io/docs/usage/quick-start/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express.js Production Best Practices](https://expressjs.com/en/advanced/best-practice-production.html)

