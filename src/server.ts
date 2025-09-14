import http from 'node:http';
import { type WebSocket, WebSocketServer } from 'ws';
import {
  APPLICATION_ROUTE,
  HEALTHCHECK_ROUTE,
  ID_GEN,
  PING_INTERVAL_MS,
  PORT,
} from './config.ts';
import type { Client, WSMessage } from './types.ts';
import { broadcast, removeClient, safeParse, sendTo } from './utils.ts';

const clients = new Map<string, Client>();

// Create underlying HTTP server (so we can upgrade easily and optionally serve health endpoints)
const httpServer = http.createServer((req, res) => {
  if (req.url === HEALTHCHECK_ROUTE) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', clients: clients.size }));
    return;
  }

  // default
  res.writeHead(404);
  res.end();
});

const socketServer = new WebSocketServer({ noServer: true });

/* WebSocket connection handling */
socketServer.on('connection', (socket: WebSocket, _req) => {
  const id = ID_GEN();
  const client: Client = { id, socket, isAlive: true };
  clients.set(id, client);

  console.log(`new connection: ${id} (total: ${clients.size})`);

  // Immediately send a welcome message with assigned id
  const welcome: WSMessage = { action: 'welcome', payload: { id } };
  socket.send(JSON.stringify(welcome));

  // Message handler
  socket.on('message', (raw) => {
    const msg = safeParse<WSMessage>(raw);
    if (!msg || typeof msg.action !== 'string') {
      socket.send(
        JSON.stringify({ action: 'error', payload: 'invalid_message' }),
      );
      return;
    }

    // Basic router for actions
    switch (msg.action) {
      case 'ping':
        // client ping -> reply pong
        socket.send(JSON.stringify({ action: 'pong' }));
        break;

      case 'echo':
        // echo back the payload
        socket.send(JSON.stringify({ action: 'echo', payload: msg.payload }));
        break;

      case 'broadcast':
        // broadcast to everyone except sender
        broadcast(
          clients,
          { action: 'broadcast', payload: { from: id, body: msg.payload } },
          id,
        );
        break;

      case 'private':
        // send to a specific client id (msg.to required)
        if (!msg.to) {
          socket.send(
            JSON.stringify({ action: 'error', payload: 'missing_target' }),
          );
        } else {
          const ok = sendTo(clients, msg.to, {
            action: 'private',
            payload: { from: id, body: msg.payload },
          });
          socket.send(
            JSON.stringify({
              action: 'private_ack',
              payload: { to: msg.to, delivered: ok },
            }),
          );
        }
        break;

      case 'list_clients':
        // return array of client ids
        socket.send(
          JSON.stringify({
            action: 'clients',
            payload: Array.from(clients.keys()),
          }),
        );
        break;

      default:
        socket.send(
          JSON.stringify({
            action: 'error',
            payload: `unknown_action:${msg.action}`,
          }),
        );
    }
  });

  socket.on('close', (code, reason) => {
    clients.delete(id);
    console.log(
      `connection closed: ${id} (${code}) reason=${reason?.toString() || ''}`,
    );
  });

  socket.on('error', (err) => {
    console.warn(`socket error for ${id}:`, err.message || err);
  });

  socket.on('pong', () => {
    // mark alive
    const c = clients.get(id);
    if (c) c.isAlive = true;
  });
});

/* HTTP upgrade -> handle WebSocket upgrade */
httpServer.on('upgrade', (req, socket, head) => {
  const { url } = req;

  if (url === APPLICATION_ROUTE) {
    socketServer.handleUpgrade(req, socket, head, (ws) => {
      socketServer.emit('connection', ws, req);
    });
  } else {
    // reject upgrade
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
  }
});

/* Heartbeat: ping clients periodically, terminate if not responding */
const interval = setInterval(() => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[heartbeat] running, clients=${clients.size}`);
  }

  for (const [id, client] of clients.entries()) {
    if (!client.isAlive) {
      console.log(`terminating dead client ${id}`);
      removeClient(clients, id);
      continue;
    }
    client.isAlive = false;
    try {
      client.socket.ping(); // 'ws' will expect pong event
    } catch (err) {
      console.warn(`ping error for ${id}`, (err as Error).message);
      removeClient(clients, id);
    }
  }
}, PING_INTERVAL_MS);

/* Start server */
httpServer.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});

/* Graceful shutdown */
function shutdown() {
  console.log('shutting down...');
  clearInterval(interval);

  // close WebSocket server (stops accepting new connections)
  socketServer.close(() => {
    console.log('wss closed');
  });

  // terminate all clients
  for (const [_id, client] of clients.entries()) {
    try {
      client.socket.close(1001, 'server_shutdown');
    } catch {
      client.socket.terminate();
    }
  }

  // close HTTP server
  httpServer.close(() => {
    console.log('http server closed');
    process.exit(0);
  });

  // Force exit after a timeout
  setTimeout(() => {
    console.warn('force exit');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
