import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

let client: SupabaseClient | null = null;
const userChannels = new Map<string, RealtimeChannel>(); // userId -> channel
const userConnectionCounts = new Map<string, number>(); // userId -> connection count
const connectionToUser = new Map<string, string>(); // connectionId -> userId

export function initPresence(url?: string, anonKey?: string): void {
  if (!url || !anonKey) {
    console.log('Supabase presence disabled: SUPABASE_URL or SUPABASE_ANON_KEY not set');
    return;
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtime: { transport: WebSocket as any },
  });

  console.log('Supabase presence initialized');
}

export function trackPluginPresence(userId: string, connectionId: string): void {
  if (!client) return;

  connectionToUser.set(connectionId, userId);
  const count = userConnectionCounts.get(userId) ?? 0;

  if (count > 0) {
    const existingChannel = userChannels.get(userId);
    // Reuse channel if it exists and is in a healthy state
    if (existingChannel) {
      userConnectionCounts.set(userId, count + 1);
      console.log(`Presence reused for user ${userId} (connection ${connectionId}, count=${count + 1})`);
      return;
    }
    // Channel was removed or in bad state — fall through to create a fresh one
  }

  const channel = client.channel(`plugin-status:${userId}`);
  userChannels.set(userId, channel);
  userConnectionCounts.set(userId, count + 1);

  channel.subscribe((status, err) => {
    if (err) {
      console.warn(`Presence channel error for user ${userId}: ${status}`, err);
    }
    if (status === 'SUBSCRIBED') {
      channel.track({ status: 'online' }).then(() => {
        console.log(`Presence tracked for user ${userId} (connection ${connectionId})`);
      }).catch((trackErr) => {
        console.warn(`Failed to track presence for user ${userId}:`, trackErr);
      });
    }
  });
}

export async function untrackPluginPresence(connectionId: string): Promise<void> {
  if (!client) return;

  const userId = connectionToUser.get(connectionId);
  if (!userId) return;

  connectionToUser.delete(connectionId);
  const count = userConnectionCounts.get(userId) ?? 0;

  if (count > 1) {
    userConnectionCounts.set(userId, count - 1);
    console.log(`Presence decremented for user ${userId} (count=${count - 1})`);
    return;
  }

  // Last connection for this user — tear down the channel
  userConnectionCounts.delete(userId);
  const channel = userChannels.get(userId);
  if (!channel) return;

  userChannels.delete(userId);

  try {
    await channel.untrack();
    client.removeChannel(channel);
    console.log(`Presence untracked for user ${userId}`);
  } catch (err) {
    console.warn(`Failed to untrack presence for user ${userId}:`, err);
  }
}

export async function cleanupAllPresence(): Promise<void> {
  if (!client) return;

  for (const [userId, channel] of userChannels.entries()) {
    try {
      await channel.untrack();
      client.removeChannel(channel);
    } catch (err) {
      console.warn(`Failed to cleanup presence for user ${userId}:`, err);
    }
  }
  userChannels.clear();
  userConnectionCounts.clear();
  connectionToUser.clear();
  console.log('All presence channels cleaned up');
}
