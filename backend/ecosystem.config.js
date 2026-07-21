'use strict';

module.exports = {
  apps: [
    {
      name: 'grievance-platform-backend',
      script: 'server.js',
      cwd: __dirname,
      // HTTP layer only. Once src/jobs workers are wired up (implementation
      // phase), run them as a separate PM2 app rather than scaling this one
      // to more than 1 instance-per-worker-type — BullMQ workers sharing a
      // queue name across cluster instances is fine (BullMQ dedupes via
      // Redis locks), but keeping HTTP and worker concerns as separate PM2
      // apps makes scaling/restart/log policy independent for each.
      instances: process.env.PM2_INSTANCES || 1,
      exec_mode: 'cluster',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      out_file: 'logs/pm2-out.log',
      error_file: 'logs/pm2-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
