export const config = {
  runtime: 'edge',
  regions: ['sin1'], // singapore
};

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

  let realKey;
  try {
    const decodeBase64 = (base64) => {
      const binString = atob(base64);
      const bytes = new Uint8Array(binString.length);
      for (let i = 0; i < binString.length; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      return bytes;
    };

    const rawKey = decodeBase64(encryptionKey);
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );

    const iv = decodeBase64(ivBase64);
    const encryptedData = decodeBase64(encryptedKeyBase64);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv: iv },
      cryptoKey,
      encryptedData
    );

    const decoder = new TextDecoder();
    realKey = decoder.decode(decryptedBuffer);
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
