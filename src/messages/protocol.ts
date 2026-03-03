/**
 * Message protocol re-exports and utilities
 *
 * This module re-exports the shared message types and provides
 * additional utilities for working with the message protocol.
 */

export * from '../types/messages.js';

/**
 * Parse a raw message string into a typed message object
 */
export function parseMessage<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Serialize a message object to a JSON string
 */
export function serializeMessage<T>(message: T): string {
  return JSON.stringify(message);
}

/**
 * Generate a unique call ID
 */
export function generateCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
