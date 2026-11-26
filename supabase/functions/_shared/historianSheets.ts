import type { HistorianArchiveRange } from './historianArchive.ts';

const tokenEndpoint = 'https://oauth2.googleapis.com/token';
const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

export async function googleSheetsAccessToken(credentials: {
  clientId: string | undefined;
  clientSecret: string | undefined;
  refreshToken: string | undefined;
  serviceAccount?: string;
}): Promise<string> {
  const { clientId, clientSecret, refreshToken, serviceAccount } = credentials;
  let body: URLSearchParams;
  if (serviceAccount) {
    const { client_email: email, private_key: pem, private_key_id: keyId } = JSON.parse(serviceAccount);
    if (typeof email !== 'string' || !email.endsWith('.iam.gserviceaccount.com') ||
        typeof pem !== 'string' || !pem.startsWith('-----BEGIN PRIVATE KEY-----') ||
        typeof keyId !== 'string' || !/^[a-f0-9]+$/.test(keyId)) {
      throw new Error('Invalid Google service account credentials');
    }
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const keyData = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), char => char.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', keyData, algorithm, false, ['sign']);
    const encode = (value: object) => base64Url(new TextEncoder().encode(JSON.stringify(value)));
    const now = Math.floor(Date.now() / 1000);
    const unsigned = encode({ alg: 'RS256', typ: 'JWT', kid: keyId }) + '.' + encode({
      iss: email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: tokenEndpoint, iat: now, exp: now + 3600,
    });
    const signature = await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(unsigned));
    body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + base64Url(new Uint8Array(signature)) });
  } else {
    if (!clientId || !clientSecret || !refreshToken) throw new Error('Google credentials are missing');
    body = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken,
      grant_type: 'refresh_token' });
  }
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    body,
    redirect: 'error', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Google authentication failed (${response.status})`);
  const { access_token: token } = await response.json();
  if (typeof token !== 'string' || !token) throw new Error('Google authentication failed');
  return token;
}

export async function loadHistorianSheet(entry: HistorianArchiveRange, accessToken: string) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${entry.spreadsheetId}/values/${encodeURIComponent(entry.range)}?valueRenderOption=UNFORMATTED_VALUE`;
  const deadline = AbortSignal.timeout(15_000);
  const request = () => fetch(url, { headers: { Authorization: `Bearer ${accessToken}` },
    redirect: 'error', signal: deadline });
  let response = await request();
  for (let attempt = 0; attempt < 2 && [429, 500, 502, 503, 504].includes(response.status); attempt++) {
    const retryAfter = response.headers.get('Retry-After');
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const waitMs = retryAfter === null ? 0 : Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    if (waitMs >= 10_000) break;
    await response.body?.cancel();
    await new Promise(resolve => setTimeout(resolve, Math.max(0, waitMs || 0, 1000 * 2 ** attempt) + Math.random() * 250));
    response = await request();
  }
  if (!response.ok) throw new Error(`Google Sheets read failed (${response.status})`);
  const { values } = await response.json();
  if (!Array.isArray(values) || values.some(row => !Array.isArray(row))) throw new Error('Google Sheets returned an invalid grid');
  return values;
}
