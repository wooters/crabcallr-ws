import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ConnectionManager } from '../connections/manager.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  connections: {
    plugins: number;
    agents: number;
  };
}

const startTime = Date.now();

export function createHealthHandler(connectionManager: ConnectionManager) {
  return function handleHealth(_req: IncomingMessage, res: ServerResponse): void {
    const status: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      connections: {
        plugins: connectionManager.getPluginCount(),
        agents: connectionManager.getAgentCount(),
      },
    };

    // Mark as degraded if no agents are connected
    if (status.connections.agents === 0) {
      status.status = 'degraded';
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(status));
  };
}

export function handleReadiness(_req: IncomingMessage, res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}
