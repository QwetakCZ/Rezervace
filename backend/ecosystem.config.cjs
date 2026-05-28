module.exports = {
  apps: [
    {
      name: "rezervace-backend",
      cwd: __dirname,
      script: "src/server.js",
      interpreter: "node",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      // Načtení .env souboru přímo přes PM2
      env_file: ".env",
      env: {
        NODE_ENV: "production",
        // PORT=4001 kvůli konfliktu s tt-denik na portu 4000
        // Přepsat lze v .env souboru
        PORT: 4001,
      },
    },
  ],
};

