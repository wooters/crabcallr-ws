import { createWebSocketServer } from './server.js';
import { initPresence, cleanupAllPresence } from './presence.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const AGENT_SECRET = process.env.AGENT_SECRET || '';
const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || '';
const VALIDATE_API_KEY_SECRET = process.env.VALIDATE_API_KEY_SECRET || '';
const USAGE_REPORT_SECRET = process.env.USAGE_REPORT_SECRET || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

// Validate required environment variables
const missingVars: string[] = [];
if (!AGENT_SECRET) missingVars.push('AGENT_SECRET');
if (!SUPABASE_FUNCTIONS_URL) missingVars.push('SUPABASE_FUNCTIONS_URL');
if (!VALIDATE_API_KEY_SECRET) missingVars.push('VALIDATE_API_KEY_SECRET');
if (!USAGE_REPORT_SECRET) missingVars.push('USAGE_REPORT_SECRET');

if (missingVars.length > 0) {
  console.error(`ERROR: Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('SUPABASE_URL or SUPABASE_ANON_KEY not set — plugin presence tracking disabled');
}
initPresence(SUPABASE_URL || undefined, SUPABASE_ANON_KEY || undefined);

const { start, stop } = createWebSocketServer({
  port: PORT,
  agentSecret: AGENT_SECRET,
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await cleanupAllPresence();
  await stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  await cleanupAllPresence();
  await stop();
  process.exit(0);
});

// Start server
start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
