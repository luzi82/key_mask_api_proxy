export const config = {
  runtime: 'edge',
  regions: ['sin1'], // singapore
};

const crypto = require('crypto');

const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

export default async function handler(request) {
  const url = new URL(request.url);

  // const realKey = process.env.REAL_KEY;
  // const expectedFakeKey = process.env.FAKE_KEY;
  const encryptionKey = process.env.ENCRYPTION_KEY_BASE64; // 加密金鑰 in base64

  // 🕵️‍♀️ 辣妹搜查線：把所有可能藏金鑰的神秘角落都翻一遍！
  const headerGoogKey = request.headers.get('x-goog-api-key');
  const queryKey = url.searchParams.get('key');
  const xApiKey = request.headers.get('x-api-key');
  const apiKeyHeader = request.headers.get('api-key');
  
  // 拆解 Authorization: Bearer <key>
  const authHeader = request.headers.get('authorization');
  let bearerKey = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    bearerKey = authHeader.substring(7).trim();
  }

  // 抓出到底是哪條管道送進了假金鑰
  const incomingKey = queryKey || headerGoogKey || bearerKey || xApiKey || apiKeyHeader;

  // enc(realKey), iv = incomingKey.split(':')
  if (!incomingKey) {
    return new Response('No API key provided', { status: 400 });
  }

  const [ivBase64, encryptedKeyBase64] = incomingKey.split(':');
  if (!ivBase64 || !encryptedKeyBase64) {
    return new Response('Invalid API key format', { status: 400 });
  }

  try {
    const iv = Buffer.from(ivBase64, 'base64');
    const encryptedKey = Buffer.from(encryptedKeyBase64, 'base64');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(encryptionKey, 'base64'), iv);
    let decrypted = decipher.update(encryptedKey);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    var realKey = decrypted.toString();
  } catch (error) {
    return new Response('Failed to decrypt API key', { status: 400 });
  }  

  const newHeaders = new Headers(request.headers);

  // 🔄 掉包大作戰：把所有帶有假金鑰的地方，精準、無情地全部格式化成真金鑰！
  if (url.searchParams.has('key')) url.searchParams.set('key', realKey);
  if (headerGoogKey) newHeaders.set('x-goog-api-key', realKey);
  if (xApiKey) newHeaders.set('x-api-key', realKey);
  if (apiKeyHeader) newHeaders.set('api-key', realKey);
  if (authHeader) newHeaders.set('authorization', `Bearer ${realKey}`);

  // 🛡️ 保險機制：不管 Hermes 原本用啥格式，我們幫它在 Header 補上 Google 最愛的原生規格！
  newHeaders.set('x-goog-api-key', realKey);

  // 清理多餘路由與偽裝 Host
  url.pathname = url.pathname.replace(/^\/api/, '');
  // url.host = 'generativelanguage.googleapis.com';
  url.host = process.env.TARGET_HOST;
  newHeaders.delete('host');

  // 順利發射出去！🚀
  return fetch(url.toString(), {
    method: request.method,
    headers: newHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'follow'
  });
}
