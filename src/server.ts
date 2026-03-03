import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { ConnectionManager } from './connections/manager.js';
import { handlePluginConnection } from './connections/plugin.js';
import { handleAgentConnection } from './connections/livekit.js';
import { createHealthHandler, handleReadiness } from './health/index.js';
import { handleMetrics } from './metrics.js';

export interface ServerConfig {
  port: number;
  agentSecret: string;
}

export function createWebSocketServer(config: ServerConfig) {
  const connectionManager = new ConnectionManager();
  const healthHandler = createHealthHandler(connectionManager);

  // Create HTTP server for health checks and WebSocket upgrade
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = req.url || '/';

    if (url === '/health') {
      healthHandler(req, res);
      return;
    }

    if (url === '/ready') {
      handleReadiness(req, res);
      return;
    }

    if (url === '/metrics') {
      handleMetrics(req, res);
      return;
    }

    // Return 404 for other HTTP requests
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  // Create WebSocket server attached to HTTP server
  const wss = new WebSocketServer({ noServer: true });

  // Handle WebSocket upgrade requests
  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const url = request.url || '/';

    if (url === '/plugin') {
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        handlePluginConnection(ws, connectionManager);
      });
      return;
    }

    if (url === '/agent') {
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        handleAgentConnection(ws, connectionManager, config.agentSecret);
      });
      return;
    }

    // Reject unknown paths
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  });

  return {
    server,
    connectionManager,
    start: () => {
      return new Promise<void>((resolve) => {
        server.listen(config.port, () => {
          console.log(`WebSocket server listening on port ${config.port}`);
          console.log(`  Plugin endpoint: ws://localhost:${config.port}/plugin`);
          console.log(`  Agent endpoint: ws://localhost:${config.port}/agent`);
          console.log(`  Health endpoint: http://localhost:${config.port}/health`);
          resolve();
        });
      });
    },
    stop: () => {
      return new Promise<void>((resolve, reject) => {
        // Close all WebSocket connections
        connectionManager.closeAll();

        // Close the HTTP server
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}
