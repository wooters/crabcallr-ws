import type { CallSource } from '../types/messages.js';

const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || '';
const USAGE_REPORT_SECRET = process.env.USAGE_REPORT_SECRET || '';

/**
 * Report usage for a completed call by calling the report-usage edge function
 */
export async function reportUsage(
  userId: string,
  durationSeconds: number,
  sessionType: CallSource,
  startedAt: number,
  callId?: string
): Promise<void> {
  if (durationSeconds <= 0) {
    console.log(`Skipping usage report for ${userId}: duration ${durationSeconds}s`);
    return;
  }

  if (!SUPABASE_FUNCTIONS_URL || !USAGE_REPORT_SECRET) {
    console.error('Missing SUPABASE_FUNCTIONS_URL or USAGE_REPORT_SECRET');
    return;
  }

  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/report-usage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${USAGE_REPORT_SECRET}`,
      },
      body: JSON.stringify({
        user_id: userId,
        duration_seconds: durationSeconds,
        session_type: sessionType,
        started_at: startedAt,
        call_id: callId || null,
      }),
    });

    const data = (await response.json()) as { success?: boolean; error?: string };

    if (!response.ok) {
      console.error(`Usage report failed: ${response.status} ${data.error}`);
      return;
    }

    console.log(`Reported ${durationSeconds}s ${sessionType} usage for user ${userId}`);
  } catch (error) {
    console.error(`Failed to report usage: ${error}`);
  }
}
