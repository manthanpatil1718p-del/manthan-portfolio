// Persistent auto-reconnecting tunnel with keepalive
const localtunnel = require('localtunnel');

async function startTunnel() {
  const subdomain = 'manthan-cinematics-' + Math.floor(100 + Math.random() * 900);
  try {
    const tunnel = await localtunnel({ port: 3000, subdomain });
    console.log('=== TUNNEL ACTIVE ===');
    console.log('URL: ' + tunnel.url);
    
    tunnel.on('close', () => {
      console.log('Tunnel dropped. Reconnecting in 3s...');
      setTimeout(startTunnel, 3000);
    });
    
    tunnel.on('error', err => {
      console.error('Tunnel error:', err.message);
      try { tunnel.close(); } catch (_) {}
    });

    // Keepalive ping every 20s so the tunnel never idles out
    const ping = setInterval(() => {
      fetch(tunnel.url + '/api/health').catch(() => {});
    }, 20000);

    tunnel.on('close', () => clearInterval(ping));
  } catch (err) {
    console.error('Tunnel connect failed:', err.message);
    setTimeout(startTunnel, 4000);
  }
}

startTunnel();
