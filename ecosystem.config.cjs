// pm2 process description: start with "pm2 start ecosystem.config.cjs".
// The settings are read from the .env file next to this one (see .env.example).
module.exports = {
  apps: [
    {
      name: 'forse-notify',
      script: './server.cjs',
      // Node 20+ loads the file itself; nothing to install.
      node_args: '--env-file=.env',
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      time: true, // timestamps in the pm2 logs
    },
  ],
};
