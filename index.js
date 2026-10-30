// CraftBot 24/7 Cloud Entrypoint
// Default to Port 80 for HOKAS web service routing (and 3001 for local Windows dev)
if (!process.env.PORT) {
  process.env.PORT = process.platform === 'win32' ? '3001' : '80';
}

require('./server/dist/index.js');
