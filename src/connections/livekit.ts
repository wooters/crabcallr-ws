import type { WebSocket } from 'ws';
import type { ConnectionManager } from './manager.js';
import {
  isAgentConnectMessage,
  isUserMessageMessage,
  isCallStartMessage,
  isCallEndMessage,
  isIsPluginConnectedMessage,
  type AgentToManager,
} from '../types/messages.js';
import { reportUsage } from '../billing/usage.js';

const AUTH_TIMEOUT_MS = 10000;

export function handleAgentConnection(
  ws: WebSocket,
  connectionManager: ConnectionManager,
  agentSecret: string
): void {
  let agentId: string | null = null;
  let isAuthenticated = false;

  console.log('New agent connection attempt');

  // Set authentication timeout
  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      console.log('Agent authentication timeout');
      ws.close(4001, 'Authentication timeout');
    }
  }, AUTH_TIMEOUT_MS);

  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    let message: AgentToManager;
    try {
      message = JSON.parse(data.toString()) as AgentToManager;
    } catch {
      console.log('Invalid JSON from agent');
      ws.close(4002, 'Invalid message format');
      return;
    }

    // Handle authentication
    if (isAgentConnectMessage(message)) {
      if (isAuthenticated) {
        console.log('Agent already authenticated');
        return;
      }

      // Validate agent secret using constant-time comparison
      const secretValid = timingSafeEqual(message.agentSecret, agentSecret);

      if (secretValid) {
        isAuthenticated = true;
        agentId = message.agentId;
        clearTimeout(authTimeout);

        // Send auth result FIRST
        connectionManager.sendToAgent(ws, {
          type: 'agent_auth_result',
          success: true,
          ts: Date.now(),
        });

        // THEN register the agent
        connectionManager.registerAgent(agentId, ws);

        console.log(`Agent authenticated: ${agentId}`);
      } else {
        connectionManager.sendToAgent(ws, {
          type: 'agent_auth_result',
          success: false,
          error: 'Invalid agent secret',
          ts: Date.now(),
        });
        ws.close(4003, 'Authentication failed');
      }
      return;
    }

    // Handle is_plugin_connected - returns error response for unauth instead of closing
    if (isIsPluginConnectedMessage(message)) {
      if (!isAuthenticated) {
        console.log(`Plugin status query rejected: not authenticated`);
        connectionManager.sendToAgent(ws, {
          type: 'plugin_connected_result',
          error: 'not authenticated',
          ts: Date.now(),
        });
        return;
      }

      const connected = connectionManager.isPluginConnected(message.userId);
      console.log(`Plugin status query for user ${message.userId}: ${connected ? 'connected' : 'not connected'}`);
      connectionManager.sendToAgent(ws, {
        type: 'plugin_connected_result',
        userId: message.userId,
        connected,
        ts: Date.now(),
      });
      return;
    }

    // All other messages require authentication
    if (!isAuthenticated || !agentId) {
      console.log('Received message from unauthenticated agent');
      ws.close(4003, 'Not authenticated');
      return;
    }

    // Handle user_message (fire-and-forget)
    if (isUserMessageMessage(message)) {
      const success = connectionManager.routeUserMessageToPlugin(
        message.messageId,
        message.userId,
        message.callId,
        message.text,
        ws,
        message.ts
      );

      if (!success) {
        // Send user-facing error utterance so agent can speak it
        connectionManager.sendToAgent(ws, {
          type: 'utterance',
          utteranceId: 'sys_error',
          callId: message.callId,
          text: "I can't reach your assistant right now. Please try again later.",
          endCall: false,
          ts: Date.now(),
        });
      }
      return;
    }

    // Handle call start (logging only, no persistence)
    if (isCallStartMessage(message)) {
      console.log(`Call started: ${message.callId} for user ${message.userId} (${message.source})`);
      connectionManager.registerCall(message.callId, message.userId, ws, message.source);
      connectionManager.notifyPluginCallStart(message.userId, message.callId, message.source);
      return;
    }

    // Handle call end - report usage via edge function
    if (isCallEndMessage(message)) {
      console.log(
        `Call ended: ${message.callId} for user ${message.userId} (${message.source}, ${message.durationSeconds}s)`
      );
      connectionManager.notifyPluginCallEnd(
        message.userId,
        message.callId,
        message.durationSeconds,
        message.source,
        message.startedAt
      );
      connectionManager.unregisterCall(message.callId);
      await reportUsage(message.userId, message.durationSeconds, message.source, message.startedAt, message.callId);
      return;
    }

    // Handle ping (keep-alive)
    if (message.type === 'ping') {
      connectionManager.sendToAgent(ws, { type: 'pong', ts: Date.now() });
      return;
    }

    console.log(`Unknown message type from agent: ${(message as { type: string }).type}`);
  });

  // Handle connection close
  ws.on('close', (code: number, reason: Buffer) => {
    clearTimeout(authTimeout);

    if (agentId) {
      connectionManager.unregisterAgent(agentId);
      connectionManager.clearCallsForAgent(ws);
      console.log(`Agent disconnected: ${agentId}: ${code} ${reason.toString()}`);
    } else {
      console.log(`Unauthenticated agent disconnected: ${code}`);
    }
  });

  // Handle errors
  ws.on('error', (error: Error) => {
    console.error(`Agent WebSocket error: ${error.message}`);
  });
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do comparison to maintain constant time for same-length strings
    // but we know result will be false
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ a.charCodeAt(i);
    }
    return result === 0 && a.length === b.length;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
