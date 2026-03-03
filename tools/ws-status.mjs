#!/usr/bin/env node

const DEFAULT_HEALTH_URL = 'https://ws.crabcallr.com/health';
const DEFAULT_METRICS_URL = 'https://ws.crabcallr.com/metrics';
const DEFAULT_TIMEOUT_MS = 5000;

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i += 1;
    }
  }
  return args;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseMetric(metricsText, name) {
  const regex = new RegExp(`^${name}\\\\s+([0-9.]+)$`, 'm');
  const match = metricsText.match(regex);
  return match ? Number(match[1]) : undefined;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const healthUrl = args.get('health-url') || DEFAULT_HEALTH_URL;
  const metricsUrl = args.get('metrics-url') || DEFAULT_METRICS_URL;
  const timeoutMs = Number(args.get('timeout') || DEFAULT_TIMEOUT_MS);
  const requireHealthy = args.get('require-healthy') !== 'false';
  const useMetrics = !args.has('no-metrics');

  const maxPlugins = args.get('max-plugins') ? Number(args.get('max-plugins')) : undefined;
  const maxAgents = args.get('max-agents') ? Number(args.get('max-agents')) : undefined;
  const maxMemoryMb = args.get('max-memory-mb') ? Number(args.get('max-memory-mb')) : undefined;

  const errors = [];

  let health;
  try {
    const res = await fetchWithTimeout(healthUrl, timeoutMs);
    if (!res.ok) {
      errors.push(`health http ${res.status}`);
    } else {
      health = await res.json();
    }
  } catch (err) {
    errors.push(`health fetch failed: ${err?.message || err}`);
  }

  if (health) {
    const status = health.status || 'unknown';
    if (requireHealthy && status !== 'healthy') {
      errors.push(`status=${status}`);
    }
    if (maxPlugins !== undefined && health.connections?.plugins > maxPlugins) {
      errors.push(`plugins=${health.connections.plugins} over max ${maxPlugins}`);
    }
    if (maxAgents !== undefined && health.connections?.agents > maxAgents) {
      errors.push(`agents=${health.connections.agents} over max ${maxAgents}`);
    }
  }

  let metricsText;
  let metrics = {};
  if (useMetrics) {
    try {
      const res = await fetchWithTimeout(metricsUrl, timeoutMs);
      if (res.ok) {
        metricsText = await res.text();
        metrics = {
          plugins: parseMetric(metricsText, 'ws_manager_plugins_connected'),
          agents: parseMetric(metricsText, 'ws_manager_agents_connected'),
          activeCalls: parseMetric(metricsText, 'ws_manager_active_calls'),
          memoryBytes: parseMetric(metricsText, 'process_resident_memory_bytes'),
        };
      }
    } catch (err) {
      errors.push(`metrics fetch failed: ${err?.message || err}`);
    }
  }

  if (metrics.memoryBytes !== undefined && maxMemoryMb !== undefined) {
    const memoryMb = metrics.memoryBytes / (1024 * 1024);
    if (memoryMb > maxMemoryMb) {
      errors.push(`memory=${memoryMb.toFixed(1)}MB over max ${maxMemoryMb}MB`);
    }
  }

  const line = [
    `status=${health?.status ?? 'unknown'}`,
    `plugins=${health?.connections?.plugins ?? 'n/a'}`,
    `agents=${health?.connections?.agents ?? 'n/a'}`,
    `uptime=${health?.uptime ?? 'n/a'}s`,
  ].join(' ');
  console.log(line);

  if (useMetrics && metricsText) {
    const memoryMb = metrics.memoryBytes !== undefined ? (metrics.memoryBytes / (1024 * 1024)).toFixed(1) : 'n/a';
    console.log(
      `metrics plugins=${metrics.plugins ?? 'n/a'} agents=${metrics.agents ?? 'n/a'} activeCalls=${metrics.activeCalls ?? 'n/a'} memory=${memoryMb}MB`
    );
  }

  if (errors.length) {
    console.log(`errors: ${errors.join('; ')}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
