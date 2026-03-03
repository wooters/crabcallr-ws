import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { CallSource, ManagerToPlugin, ManagerToAgent } from '../types/messages.js';
import { setActiveCalls, setAgentConnections, setPluginConnections } from '../metrics.js';

const ALLOW_MULTI_PLUGIN_CONNECTIONS =
  process.env.ALLOW_MULTI_PLUGIN_CONNECTIONS === 'true' ||
  process.env.ALLOW_MULTI_PLUGIN_CONNECTIONS === '1';

export interface PluginConnection {
  ws: WebSocket;
  userId: string;
  connectionId: string;
  connectedAt: Date;
  lastPing: Date;
}

export interface AgentConnection {
  ws: WebSocket;
  agentId: string;
  connectedAt: Date;
}

export interface ActiveCall {
  callId: string;
  userId: string;
  agentWs: WebSocket;
  startedAt?: number;
  source?: CallSource;
}

export class ConnectionManager {
  private plugins = new Map<string, Map<string, PluginConnection>>(); // userId -> (connectionId -> connection)
  private pluginsByWs: WeakMap<WebSocket, PluginConnection> = new WeakMap();
  private agents = new Map<string, AgentConnection>(); // agentId -> connection
  private activeCalls = new Map<string, ActiveCall>(); // callId -> call

  // ============================================================================
  // Plugin Connection Management
  // ============================================================================

  registerPlugin(userId: string, ws: WebSocket): string {
    // Close existing connections if multi-connection mode is disabled
    const existingConnections = this.plugins.get(userId);
    if (existingConnections && !ALLOW_MULTI_PLUGIN_CONNECTIONS) {
      console.log(`Closing existing connection for user ${userId}`);
      for (const connection of existingConnections.values()) {
        this.pluginsByWs.delete(connection.ws);
        connection.ws.close(1000, 'New connection established');
      }
      this.plugins.delete(userId);
    }

    const connectionId = randomUUID();
    const connection: PluginConnection = {
      ws,
      userId,
      connectionId,
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    const userConnections = this.plugins.get(userId) ?? new Map<string, PluginConnection>();
    userConnections.set(connectionId, connection);
    this.plugins.set(userId, userConnections);
    this.pluginsByWs.set(ws, connection);

    setPluginConnections(this.getPluginCount());
    console.log(`Plugin registered for user ${userId}. Total plugins: ${this.getPluginCount()}`);
    return connectionId;
  }

  unregisterPlugin(ws: WebSocket): void {
    const connection = this.pluginsByWs.get(ws);
    if (!connection) return;

    const userConnections = this.plugins.get(connection.userId);
    if (!userConnections) return;

    userConnections.delete(connection.connectionId);
    if (userConnections.size === 0) {
      this.plugins.delete(connection.userId);
    }
    this.pluginsByWs.delete(ws);

    setPluginConnections(this.getPluginCount());
    console.log(
      `Plugin unregistered for user ${connection.userId}. Total plugins: ${this.getPluginCount()}`
    );
  }

  getPlugin(userId: string): PluginConnection | undefined {
    const userConnections = this.plugins.get(userId);
    if (!userConnections || userConnections.size === 0) return undefined;

    let latest: PluginConnection | undefined;
    for (const connection of userConnections.values()) {
      if (!latest || connection.connectedAt > latest.connectedAt) {
        latest = connection;
      }
    }
    return latest;
  }

  updatePluginPing(ws: WebSocket): void {
    const connection = this.pluginsByWs.get(ws);
    if (connection) {
      connection.lastPing = new Date();
    }
  }

  isPluginConnected(userId: string): boolean {
    const userConnections = this.plugins.get(userId);
    return Boolean(userConnections && userConnections.size > 0);
  }

  getPluginCount(): number {
    let total = 0;
    for (const userConnections of this.plugins.values()) {
      total += userConnections.size;
    }
    return total;
  }

  // ============================================================================
  // Agent Connection Management
  // ============================================================================

  registerAgent(agentId: string, ws: WebSocket): void {
    // Close existing connection if any
    const existing = this.agents.get(agentId);
    if (existing) {
      console.log(`Closing existing connection for agent ${agentId}`);
      existing.ws.close(1000, 'New connection established');
    }

    this.agents.set(agentId, {
      ws,
      agentId,
      connectedAt: new Date(),
    });

    setAgentConnections(this.agents.size);
    console.log(`Agent registered: ${agentId}. Total agents: ${this.agents.size}`);
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    setAgentConnections(this.agents.size);
    console.log(`Agent unregistered: ${agentId}. Total agents: ${this.agents.size}`);
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  // ============================================================================
  // Message Routing (fire-and-forget)
  // ============================================================================

  routeUserMessageToPlugin(
    messageId: string,
    userId: string,
    callId: string,
    text: string,
    agentWs: WebSocket,
    ts: number
  ): boolean {
    const plugin = this.getPlugin(userId);
    if (!plugin) {
      console.log(`Cannot route user_message ${messageId}: plugin not connected for user ${userId}`);
      return false;
    }

    this.registerCall(callId, userId, agentWs);

    this.sendToPlugin(plugin.ws, {
      type: 'user_message',
      messageId,
      text,
      callId,
      ts,
    });

    console.log(`Routed user_message ${messageId} to plugin for user ${userId}`);
    return true;
  }

  handlePluginUtterance(callId: string, utteranceId: string, text: string, endCall: boolean | undefined, ts: number): void {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.log(`Cannot forward utterance ${utteranceId} for ${callId}: no active call`);
      return;
    }

    this.sendToAgent(call.agentWs, {
      type: 'utterance',
      utteranceId,
      callId,
      text,
      endCall,
      ts,
    });

    console.log(`Forwarded utterance ${utteranceId} for call ${callId}${endCall ? ' (endCall)' : ''}`);
  }

  registerCall(callId: string, userId: string, agentWs: WebSocket, source?: CallSource, startedAt?: number): void {
    const existing = this.activeCalls.get(callId);
    if (existing && existing.agentWs !== agentWs) {
      console.log(`Call ${callId} re-registered with a different agent connection`);
    }
    if (existing && existing.userId !== userId) {
      console.log(`Call ${callId} re-registered with a different user (${userId})`);
    }

    this.activeCalls.set(callId, {
      callId,
      userId,
      agentWs,
      source: source ?? existing?.source,
      startedAt: startedAt ?? existing?.startedAt,
    });
    setActiveCalls(this.activeCalls.size);
  }

  unregisterCall(callId: string): void {
    this.activeCalls.delete(callId);
    setActiveCalls(this.activeCalls.size);
  }

  clearCallsForAgent(agentWs: WebSocket): void {
    for (const [callId, call] of this.activeCalls.entries()) {
      if (call.agentWs === agentWs) {
        this.activeCalls.delete(callId);
      }
    }
    setActiveCalls(this.activeCalls.size);
  }

  forwardCallEndRequest(userId: string, callId: string, ts: number): boolean {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.log(`Cannot forward call end request for ${callId}: no active call`);
      return false;
    }

    if (call.userId !== userId) {
      console.log(`Cannot forward call end request for ${callId}: user mismatch (${userId})`);
      return false;
    }

    this.sendToAgent(call.agentWs, {
      type: 'call_end_request',
      userId,
      callId,
      ts,
    });

    console.log(`Forwarded call end request for ${callId} (user ${userId})`);
    return true;
  }

  notifyPluginCallEnd(
    userId: string,
    callId: string,
    durationSeconds: number,
    source: CallSource,
    startedAt: number
  ): boolean {
    const plugin = this.getPlugin(userId);
    if (!plugin) {
      console.log(`Cannot notify call end for ${callId}: plugin not connected for user ${userId}`);
      return false;
    }

    this.sendToPlugin(plugin.ws, {
      type: 'call_end',
      callId,
      durationSeconds,
      source,
      startedAt,
      ts: Date.now(),
    });

    console.log(`Notified plugin of call end: ${callId} for user ${userId}`);
    return true;
  }

  notifyPluginCallStart(userId: string, callId: string, source: CallSource): boolean {
    const plugin = this.getPlugin(userId);
    if (!plugin) {
      console.log(`Cannot notify call start for ${callId}: plugin not connected for user ${userId}`);
      return false;
    }

    this.sendToPlugin(plugin.ws, {
      type: 'call_start',
      callId,
      source,
      ts: Date.now(),
    });

    console.log(`Notified plugin of call start: ${callId} for user ${userId}`);
    return true;
  }

  // ============================================================================
  // Send Helpers
  // ============================================================================

  sendToPlugin(ws: WebSocket, message: ManagerToPlugin): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  sendToAgent(ws: WebSocket, message: ManagerToAgent): void {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  closeAll(): void {
    // Close all plugin connections
    for (const userConnections of this.plugins.values()) {
      for (const plugin of userConnections.values()) {
        plugin.ws.close(1001, 'Server shutting down');
      }
    }
    this.plugins.clear();
    this.pluginsByWs = new WeakMap();
    setPluginConnections(0);

    // Close all agent connections
    for (const agent of this.agents.values()) {
      agent.ws.close(1001, 'Server shutting down');
    }
    this.agents.clear();
    setAgentConnections(0);

    this.activeCalls.clear();
    setActiveCalls(0);
  }
}
