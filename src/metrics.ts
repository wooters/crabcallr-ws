import type { IncomingMessage, ServerResponse } from 'node:http';
import client from 'prom-client';

const register = new client.Registry();

client.collectDefaultMetrics({ register });

const pluginConnectionsGauge = new client.Gauge({
  name: 'ws_manager_plugins_connected',
  help: 'Number of authenticated plugin WebSocket connections',
});

const agentConnectionsGauge = new client.Gauge({
  name: 'ws_manager_agents_connected',
  help: 'Number of authenticated agent WebSocket connections',
});

const activeCallsGauge = new client.Gauge({
  name: 'ws_manager_active_calls',
  help: 'Number of active calls tracked by the manager',
});

register.registerMetric(pluginConnectionsGauge);
register.registerMetric(agentConnectionsGauge);
register.registerMetric(activeCallsGauge);

export function setPluginConnections(count: number): void {
  pluginConnectionsGauge.set(count);
}

export function setAgentConnections(count: number): void {
  agentConnectionsGauge.set(count);
}

export function setActiveCalls(count: number): void {
  activeCallsGauge.set(count);
}

export async function handleMetrics(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.writeHead(200, { 'Content-Type': register.contentType });
  res.end(await register.metrics());
}
