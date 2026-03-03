/**
 * Protocol compliance tests.
 *
 * Validates that sample messages conform to the canonical JSON Schema
 * and that the TypeScript type guards agree with the schema.
 */

import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it, beforeAll } from 'vitest';
import {
  isPluginAuthMessage,
  isPluginUtteranceMessage,
  isPluginCallEndRequestMessage,
  isAgentConnectMessage,
  isUserMessageMessage,
  isCallStartMessage,
  isCallEndMessage,
  isIsPluginConnectedMessage,
} from '../messages.js';

// Load the canonical schema
const schemaPath = resolve(__dirname, '../../../protocol/crabcallr-protocol.schema.json');
const schema = JSON.parse(readFileSync(schemaPath, 'utf-8'));

let ajv: Ajv2020;
let validatePluginToManager: ReturnType<Ajv2020['compile']>;
let validateManagerToPlugin: ReturnType<Ajv2020['compile']>;
let validateAgentToManager: ReturnType<Ajv2020['compile']>;
let validateManagerToAgent: ReturnType<Ajv2020['compile']>;

beforeAll(() => {
  ajv = new Ajv2020({ strict: false });
  ajv.addSchema(schema, 'protocol');

  // Compile using $ref so that $defs in the root schema are accessible
  validatePluginToManager = ajv.compile({ $ref: 'protocol#/properties/PluginToManager' });
  validateManagerToPlugin = ajv.compile({ $ref: 'protocol#/properties/ManagerToPlugin' });
  validateAgentToManager = ajv.compile({ $ref: 'protocol#/properties/AgentToManager' });
  validateManagerToAgent = ajv.compile({ $ref: 'protocol#/properties/ManagerToAgent' });
});

// ============================================================================
// PluginToManager
// ============================================================================

describe('PluginToManager', () => {
  const validMessages = [
    { name: 'auth', msg: { type: 'auth', apiKey: 'cc_abc123def456', ts: 1700000000000 } },
    {
      name: 'utterance',
      msg: {
        type: 'utterance',
        utteranceId: 'oc_001_001',
        callId: 'call-123',
        text: 'Hello there',
        ts: 1700000000000,
      },
    },
    {
      name: 'utterance with endCall',
      msg: {
        type: 'utterance',
        utteranceId: 'oc_002_001',
        callId: 'call-123',
        text: 'Goodbye!',
        endCall: true,
        ts: 1700000000000,
      },
    },
    {
      name: 'call_end_request',
      msg: { type: 'call_end_request', userId: 'user-1', callId: 'call-123', ts: 1700000000000 },
    },
    { name: 'ping', msg: { type: 'ping', ts: 1700000000000 } },
  ];

  for (const { name, msg } of validMessages) {
    it(`accepts valid ${name}`, () => {
      expect(validatePluginToManager(msg)).toBe(true);
    });
  }

  const invalidMessages = [
    { name: 'auth missing apiKey', msg: { type: 'auth', ts: 1700000000000 } },
    { name: 'utterance missing text', msg: { type: 'utterance', utteranceId: 'oc_001_001', callId: 'c', ts: 1700000000000 } },
    { name: 'unknown type', msg: { type: 'unknown_type', ts: 1700000000000 } },
    { name: 'ping missing ts', msg: { type: 'ping' } },
  ];

  for (const { name, msg } of invalidMessages) {
    it(`rejects invalid ${name}`, () => {
      expect(validatePluginToManager(msg)).toBe(false);
    });
  }
});

// ============================================================================
// ManagerToPlugin
// ============================================================================

describe('ManagerToPlugin', () => {
  const validMessages = [
    { name: 'auth_result success', msg: { type: 'auth_result', success: true, userId: 'user-1', ts: 1700000000000 } },
    { name: 'auth_result failure', msg: { type: 'auth_result', success: false, error: 'Bad key', ts: 1700000000000 } },
    { name: 'auth_result minimal', msg: { type: 'auth_result', success: true, ts: 1700000000000 } },
    { name: 'call_start', msg: { type: 'call_start', callId: 'call-1', source: 'browser', ts: 1700000000000 } },
    {
      name: 'user_message',
      msg: { type: 'user_message', messageId: 'usr_001', text: 'Hello', callId: 'call-1', ts: 1700000000000 },
    },
    {
      name: 'call_end',
      msg: {
        type: 'call_end',
        callId: 'call-1',
        durationSeconds: 120,
        source: 'phone',
        startedAt: 1700000000000,
        ts: 1700000000000,
      },
    },
    { name: 'pong', msg: { type: 'pong', ts: 1700000000000 } },
  ];

  for (const { name, msg } of validMessages) {
    it(`accepts valid ${name}`, () => {
      expect(validateManagerToPlugin(msg)).toBe(true);
    });
  }

  const invalidMessages = [
    { name: 'auth_result missing success', msg: { type: 'auth_result', ts: 1700000000000 } },
    { name: 'call_start invalid source', msg: { type: 'call_start', callId: 'c', source: 'carrier_pigeon', ts: 1700000000000 } },
    { name: 'user_message missing text', msg: { type: 'user_message', messageId: 'usr_001', callId: 'c', ts: 1700000000000 } },
    { name: 'error type (removed)', msg: { type: 'error', code: 'ERR', message: 'bad', ts: 1700000000000 } },
    { name: 'pong missing ts', msg: { type: 'pong' } },
  ];

  for (const { name, msg } of invalidMessages) {
    it(`rejects invalid ${name}`, () => {
      expect(validateManagerToPlugin(msg)).toBe(false);
    });
  }
});

// ============================================================================
// AgentToManager
// ============================================================================

describe('AgentToManager', () => {
  const validMessages = [
    {
      name: 'agent_connect',
      msg: { type: 'agent_connect', agentSecret: 'secret', agentId: 'agent-1', ts: 1700000000000 },
    },
    {
      name: 'user_message',
      msg: {
        type: 'user_message',
        userId: 'user-1',
        callId: 'call-1',
        messageId: 'usr_001',
        text: 'Hello',
        ts: 1700000000000,
      },
    },
    {
      name: 'call_start',
      msg: { type: 'call_start', userId: 'user-1', callId: 'call-1', source: 'browser', ts: 1700000000000 },
    },
    {
      name: 'call_start with timestamp',
      msg: {
        type: 'call_start',
        userId: 'user-1',
        callId: 'call-1',
        source: 'phone',
        timestamp: 1700000000,
        ts: 1700000000000,
      },
    },
    {
      name: 'call_end',
      msg: {
        type: 'call_end',
        userId: 'user-1',
        callId: 'call-1',
        durationSeconds: 60,
        source: 'browser',
        startedAt: 1700000000,
        ts: 1700000000000,
      },
    },
    { name: 'is_plugin_connected', msg: { type: 'is_plugin_connected', userId: 'user-1', ts: 1700000000000 } },
    { name: 'ping', msg: { type: 'ping', ts: 1700000000000 } },
  ];

  for (const { name, msg } of validMessages) {
    it(`accepts valid ${name}`, () => {
      expect(validateAgentToManager(msg)).toBe(true);
    });
  }

  const invalidMessages = [
    { name: 'agent_connect missing agentId', msg: { type: 'agent_connect', agentSecret: 's', ts: 1700000000000 } },
    { name: 'user_message missing userId', msg: { type: 'user_message', callId: 'c', messageId: 'usr_001', text: 'hi', ts: 1700000000000 } },
    { name: 'call_start missing source', msg: { type: 'call_start', userId: 'u', callId: 'c', ts: 1700000000000 } },
    { name: 'ping missing ts', msg: { type: 'ping' } },
  ];

  for (const { name, msg } of invalidMessages) {
    it(`rejects invalid ${name}`, () => {
      expect(validateAgentToManager(msg)).toBe(false);
    });
  }
});

// ============================================================================
// ManagerToAgent
// ============================================================================

describe('ManagerToAgent', () => {
  const validMessages = [
    { name: 'agent_auth_result success', msg: { type: 'agent_auth_result', success: true, ts: 1700000000000 } },
    { name: 'agent_auth_result failure', msg: { type: 'agent_auth_result', success: false, error: 'bad', ts: 1700000000000 } },
    {
      name: 'utterance',
      msg: {
        type: 'utterance',
        utteranceId: 'oc_001_001',
        callId: 'call-1',
        text: 'Response',
        ts: 1700000000000,
      },
    },
    {
      name: 'plugin_connected_result success',
      msg: { type: 'plugin_connected_result', userId: 'user-1', connected: true, ts: 1700000000000 },
    },
    {
      name: 'plugin_connected_result error',
      msg: { type: 'plugin_connected_result', error: 'not authenticated', ts: 1700000000000 },
    },
    {
      name: 'plugin_connected_result minimal',
      msg: { type: 'plugin_connected_result', ts: 1700000000000 },
    },
    {
      name: 'call_end_request',
      msg: { type: 'call_end_request', userId: 'user-1', callId: 'call-1', ts: 1700000000000 },
    },
    { name: 'pong', msg: { type: 'pong', ts: 1700000000000 } },
  ];

  for (const { name, msg } of validMessages) {
    it(`accepts valid ${name}`, () => {
      expect(validateManagerToAgent(msg)).toBe(true);
    });
  }

  const invalidMessages = [
    { name: 'agent_auth_result missing success', msg: { type: 'agent_auth_result', ts: 1700000000000 } },
    { name: 'call_end_request missing callId', msg: { type: 'call_end_request', userId: 'u', ts: 1700000000000 } },
    { name: 'error type (not in protocol)', msg: { type: 'error', message: 'bad', ts: 1700000000000 } },
    { name: 'pong missing ts', msg: { type: 'pong' } },
  ];

  for (const { name, msg } of invalidMessages) {
    it(`rejects invalid ${name}`, () => {
      expect(validateManagerToAgent(msg)).toBe(false);
    });
  }
});

// ============================================================================
// Type guard consistency
// ============================================================================

describe('Type guard consistency with schema', () => {
  it('isPluginAuthMessage agrees with schema', () => {
    const valid = { type: 'auth', apiKey: 'cc_test123', ts: 1700000000000 };
    const invalid = { type: 'auth', ts: 1700000000000 };

    expect(isPluginAuthMessage(valid)).toBe(true);
    expect(validatePluginToManager(valid)).toBe(true);
    expect(isPluginAuthMessage(invalid)).toBe(false);
    expect(validatePluginToManager(invalid)).toBe(false);
  });

  it('isPluginUtteranceMessage agrees with schema', () => {
    const valid = { type: 'utterance', utteranceId: 'oc_001_001', callId: 'c', text: 'hi', ts: 1700000000000 };
    const invalid = { type: 'utterance', utteranceId: 'oc_001_001', ts: 1700000000000 };

    expect(isPluginUtteranceMessage(valid)).toBe(true);
    expect(validatePluginToManager(valid)).toBe(true);
    expect(isPluginUtteranceMessage(invalid)).toBe(false);
    expect(validatePluginToManager(invalid)).toBe(false);
  });

  it('isPluginCallEndRequestMessage agrees with schema', () => {
    const valid = { type: 'call_end_request', userId: 'u', callId: 'c', ts: 1700000000000 };
    expect(isPluginCallEndRequestMessage(valid)).toBe(true);
    expect(validatePluginToManager(valid)).toBe(true);
  });

  it('isAgentConnectMessage agrees with schema', () => {
    const valid = { type: 'agent_connect', agentSecret: 's', agentId: 'a', ts: 1700000000000 };
    expect(isAgentConnectMessage(valid)).toBe(true);
    expect(validateAgentToManager(valid)).toBe(true);
  });

  it('isUserMessageMessage agrees with schema', () => {
    const valid = { type: 'user_message', userId: 'u', callId: 'c', messageId: 'usr_001', text: 'hi', ts: 1700000000000 };
    expect(isUserMessageMessage(valid)).toBe(true);
    expect(validateAgentToManager(valid)).toBe(true);
  });

  it('isCallStartMessage agrees with schema', () => {
    const valid = { type: 'call_start', userId: 'u', callId: 'c', source: 'browser', ts: 1700000000000 };
    expect(isCallStartMessage(valid)).toBe(true);
    expect(validateAgentToManager(valid)).toBe(true);
  });

  it('isCallEndMessage agrees with schema', () => {
    const valid = {
      type: 'call_end', userId: 'u', callId: 'c',
      durationSeconds: 60, source: 'phone', startedAt: 1700000000, ts: 1700000000000,
    };
    expect(isCallEndMessage(valid)).toBe(true);
    expect(validateAgentToManager(valid)).toBe(true);
  });

  it('isIsPluginConnectedMessage agrees with schema', () => {
    const valid = { type: 'is_plugin_connected', userId: 'u', ts: 1700000000000 };
    expect(isIsPluginConnectedMessage(valid)).toBe(true);
    expect(validateAgentToManager(valid)).toBe(true);
  });
});
