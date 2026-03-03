import type { WebSocket } from 'ws';
import type { ConnectionManager } from './manager.js';
import {
  isPluginAuthMessage,
  isPluginCallEndRequestMessage,
  isPluginUtteranceMessage,
  type PluginToManager,
} from '../types/messages.js';
import { validateApiKey } from '../auth/api-key.js';
import { trackPluginPresence, untrackPluginPresence } from '../presence.js';

const HEARTBEAT_INTERVAL_MS = 10000;
const AUTH_TIMEOUT_MS = 10000;

export function handlePluginConnection(ws: WebSocket, connectionManager: ConnectionManager): void {
  let userId: string | null = null;
  let connectionId: string | null = null;
  let isAuthenticated = false;
  let heartbeatInterval: NodeJS.Timeout | null = null;

  console.log('New plugin connection attempt');

  // Set authentication timeout
  const authTimeout = setTimeout(() => {
    if (!isAuthenticated) {
      console.log('Plugin authentication timeout');
      ws.close(4001, 'Authentication timeout');
    }
  }, AUTH_TIMEOUT_MS);

  // Handle incoming messages
  ws.on('message', async (data: Buffer) => {
    let message: PluginToManager;
    try {
      message = JSON.parse(data.toString()) as PluginToManager;
    } catch {
      console.log('Invalid JSON from plugin');
      ws.close(4002, 'Invalid message format');
      return;
    }

    // Handle authentication
    if (isPluginAuthMessage(message)) {
      if (isAuthenticated) {
        console.log('Plugin already authenticated');
        return;
      }

      const result = await validateApiKey(message.apiKey);

      if (result.valid && result.userId) {
        isAuthenticated = true;
        userId = result.userId;
        clearTimeout(authTimeout);

        connectionId = connectionManager.registerPlugin(userId, ws);
        trackPluginPresence(userId, connectionId);

        connectionManager.sendToPlugin(ws, {
          type: 'auth_result',
          success: true,
          userId,
          ts: Date.now(),
        });

        // Start heartbeat
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === ws.OPEN) {
            ws.ping();
          }
        }, HEARTBEAT_INTERVAL_MS);

        console.log(`Plugin authenticated for user ${userId}`);
      } else {
        connectionManager.sendToPlugin(ws, {
          type: 'auth_result',
          success: false,
          error: result.error || 'Invalid API key',
          ts: Date.now(),
        });
        ws.close(4003, 'Authentication failed');
      }
      return;
    }

    // All other messages require authentication
    if (!isAuthenticated || !userId) {
      console.log('Received message from unauthenticated plugin');
      ws.close(4003, 'Not authenticated');
      return;
    }

    // Handle ping
    if (message.type === 'ping') {
      connectionManager.updatePluginPing(ws);
      connectionManager.sendToPlugin(ws, { type: 'pong', ts: Date.now() });
      return;
    }

    // Handle utterance (fire-and-forget from plugin)
    if (isPluginUtteranceMessage(message)) {
      connectionManager.handlePluginUtterance(message.callId, message.utteranceId, message.text, message.endCall, message.ts);
      return;
    }

    if (isPluginCallEndRequestMessage(message)) {
      if (message.userId !== userId) {
        console.log(`Rejected call end request for ${message.callId}: user mismatch`);
        return;
      }

      connectionManager.forwardCallEndRequest(message.userId, message.callId, message.ts);
      return;
    }

    console.log(`Unknown message type from plugin: ${(message as { type: string }).type}`);
  });

  // Handle WebSocket pong (response to our ping)
  ws.on('pong', () => {
    if (userId) {
      connectionManager.updatePluginPing(ws);
    }
  });

  // Handle connection close
  ws.on('close', (code: number, reason: Buffer) => {
    clearTimeout(authTimeout);
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    if (userId) {
      if (connectionId) untrackPluginPresence(connectionId);
      connectionManager.unregisterPlugin(ws);
      console.log(`Plugin disconnected for user ${userId}: ${code} ${reason.toString()}`);
    } else {
      console.log(`Unauthenticated plugin disconnected: ${code}`);
    }
  });

  // Handle errors
  ws.on('error', (error: Error) => {
    console.error(`Plugin WebSocket error: ${error.message}`);
  });
}
