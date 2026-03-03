export interface ApiKeyValidationResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

const SUPABASE_FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || '';
const VALIDATE_API_KEY_SECRET = process.env.VALIDATE_API_KEY_SECRET || '';

/**
 * Validate an API key by calling the validate-api-key edge function
 */
export async function validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'Invalid API key format' };
  }

  if (!SUPABASE_FUNCTIONS_URL || !VALIDATE_API_KEY_SECRET) {
    console.error('Missing SUPABASE_FUNCTIONS_URL or VALIDATE_API_KEY_SECRET');
    return { valid: false, error: 'Server configuration error' };
  }

  try {
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/validate-api-key`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${VALIDATE_API_KEY_SECRET}`,
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    const data = (await response.json()) as { valid: boolean; user_id?: string; error?: string };

    if (!response.ok && response.status !== 200) {
      console.error(`API key validation failed: ${response.status} ${data.error}`);
      return { valid: false, error: data.error || 'Validation failed' };
    }

    if (data.valid && data.user_id) {
      return { valid: true, userId: data.user_id };
    }

    return { valid: false, error: data.error || 'Invalid API key' };
  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false, error: 'Validation failed' };
  }
}
