/**
 * Message protocol types for CrabCallr WebSocket communication
 *
 * Fire-and-forget messaging architecture: no request/response correlation,
 * no pending requests, no timeouts at the message level.
 */

// ============================================================================
// Plugin <-> Manager Messages
// ============================================================================

/** Messages sent from OpenClaw plugin to WS Manager */
export type PluginToManager =
  | { type: 'auth'; apiKey: string; ts: number }
  | { type: 'utterance'; utteranceId: string; callId: string; text: string; endCall?: boolean; ts: number }
  | { type: 'call_end_request'; userId: string; callId: string; ts: number }
  | { type: 'ping'; ts: number };

/** Messages sent from WS Manager to OpenClaw plugin */
export type ManagerToPlugin =
  | { type: 'auth_result'; success: boolean; userId?: string; error?: string; ts: number }
  | { type: 'call_start'; callId: string; source: CallSource; ts: number }
  | { type: 'user_message'; messageId: string; text: string; callId: string; ts: number }
  | { type: 'call_end'; callId: string; durationSeconds: number; source: CallSource; startedAt: number; ts: number }
  | { type: 'pong'; ts: number };

// ============================================================================
// Agent <-> Manager Messages
// ============================================================================

/** Call source types */
export type CallSource = 'browser' | 'phone';

/** Messages sent from LiveKit agent to WS Manager */
export type AgentToManager =
  | { type: 'agent_connect'; agentSecret: string; agentId: string; ts: number }
  | { type: 'user_message'; userId: string; callId: string; messageId: string; text: string; ts: number }
  | { type: 'call_start'; userId: string; callId: string; source: CallSource; timestamp?: number; ts: number }
  | { type: 'call_end'; userId: string; callId: string; durationSeconds: number; source: CallSource; startedAt: number; ts: number }
  | { type: 'is_plugin_connected'; userId: string; ts: number }
  | { type: 'ping'; ts: number };

/** Messages sent from WS Manager to LiveKit agent */
export type ManagerToAgent =
  | { type: 'agent_auth_result'; success: boolean; error?: string; ts: number }
  | { type: 'utterance'; utteranceId: string; callId: string; text: string; endCall?: boolean; ts: number }
  | { type: 'plugin_connected_result'; userId?: string; connected?: boolean; error?: string; ts: number }
  | { type: 'call_end_request'; userId: string; callId: string; ts: number }
  | { type: 'pong'; ts: number };

// ============================================================================
// Combined Types
// ============================================================================

/** All inbound message types */
export type InboundMessage = PluginToManager | AgentToManager;

/** All outbound message types */
export type OutboundMessage = ManagerToPlugin | ManagerToAgent;

// ============================================================================
// Type Guards
// ============================================================================

export function isPluginAuthMessage(msg: unknown): msg is { type: 'auth'; apiKey: string; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'auth' &&
    'apiKey' in msg &&
    typeof (msg as { apiKey: unknown }).apiKey === 'string'
  );
}

export function isPluginUtteranceMessage(
  msg: unknown
): msg is { type: 'utterance'; utteranceId: string; callId: string; text: string; endCall?: boolean; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'utterance' &&
    'utteranceId' in msg &&
    'callId' in msg &&
    'text' in msg
  );
}

export function isPluginCallEndRequestMessage(
  msg: unknown
): msg is { type: 'call_end_request'; userId: string; callId: string; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'call_end_request' &&
    'userId' in msg &&
    'callId' in msg &&
    typeof (msg as { userId: unknown }).userId === 'string' &&
    typeof (msg as { callId: unknown }).callId === 'string'
  );
}

export function isAgentConnectMessage(
  msg: unknown
): msg is { type: 'agent_connect'; agentSecret: string; agentId: string; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'agent_connect' &&
    'agentSecret' in msg &&
    'agentId' in msg
  );
}

export function isUserMessageMessage(
  msg: unknown
): msg is { type: 'user_message'; userId: string; callId: string; messageId: string; text: string; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'user_message' &&
    'userId' in msg &&
    'callId' in msg &&
    'messageId' in msg &&
    'text' in msg
  );
}

export function isCallStartMessage(
  msg: unknown
): msg is { type: 'call_start'; userId: string; callId: string; source: CallSource; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'call_start' &&
    'userId' in msg &&
    'callId' in msg &&
    'source' in msg
  );
}

export function isCallEndMessage(
  msg: unknown
): msg is { type: 'call_end'; userId: string; callId: string; durationSeconds: number; source: CallSource; startedAt: number; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'call_end' &&
    'userId' in msg &&
    'callId' in msg &&
    'durationSeconds' in msg &&
    'source' in msg &&
    'startedAt' in msg
  );
}

export function isIsPluginConnectedMessage(
  msg: unknown
): msg is { type: 'is_plugin_connected'; userId: string; ts: number } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    msg.type === 'is_plugin_connected' &&
    'userId' in msg &&
    typeof (msg as { userId: unknown }).userId === 'string'
  );
}
