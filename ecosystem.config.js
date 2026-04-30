// Use `config.development.env` when NODE_ENV=development, `config.production.env` when production.
// Start production: `pm2 start ecosystem.config.js --env production`
// (ensures server loads the production env file; place config.production.env on the server, gitignored)
module.exports = {
  apps: [
    {
      name: 'freshlancer-api',
      script: './server.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 8080
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 8080
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '1G',
      watch: false,
      ignore_watch: ['node_modules', 'logs', 'uploads'],
      min_uptime: '10s',
      max_restarts: 10
    }
  ]
};

