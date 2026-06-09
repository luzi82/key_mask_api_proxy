# Key Mask API Proxy

A general-purpose, lightweight API reverse proxy deployed on Vercel Edge Functions with built-in client-side key encryption (Key Masking).

## Why this exists

Many APIs (like Google Gemini, Claude, or OpenAI) have regional restrictions or suffer from high latency in certain locations. 
By deploying this proxy on Vercel and configuring it to run exclusively on the `sin1` (Singapore) edge network, requests appear to originate from Singapore, which bypasses many regional restrictions while offering low latency for users in Asia.
Furthermore, instead of sending your real API key in plaintext, you encrypt it on the client side, ensuring no plaintext keys are exposed in transit.

## Architecture & Security

This project acts as a secure pass-through proxy using **Key Masking**:

- **No Plaintext Keys in Transit**: You pass an encrypted version of your API key (`ivBase64:encryptedKeyBase64`) from the client.
- **Edge Deployment**: The Edge function intercepts the request, decrypts the masked key on the fly using AES-256-CBC, and injects the real key into the correct headers/query.
- **Customizable Target**: The proxy forwards the modified request securely to your defined `TARGET_HOST` (e.g., `api.openai.com`, `generativelanguage.googleapis.com`).

## Deployment

Since this is a private project, you can deploy your own instance manually:

1. Push this repository to your private GitHub/GitLab/Bitbucket account.
2. Go to your [Vercel Dashboard](https://vercel.com/dashboard) and click **Add New** -> **Project**.
3. Import your private repository.
4. **Environment Variables**: Configure the following environment variables:
   - `TARGET_HOST`: The API host you want to reverse-proxy to (e.g., `generativelanguage.googleapis.com`).
   - `ENCRYPTION_KEY_BASE64`: A secret 256-bit (32 bytes) AES key, Base64-encoded, used by the edge function to decrypt your masked keys.
5. Click **Deploy**.

Alternatively, you can deploy via the [Vercel CLI](https://vercel.com/docs/cli):
```bash
npx vercel
npx vercel deploy --prod
```

### Generate `ENCRYPTION_KEY_BASE64`

You can safely generate a 256-bit randomly generated base64 string using either OpenSSL or Python:

**Using OpenSSL:**
```bash
openssl rand -base64 32
```

**Using Python:**
```python
import os
import base64

encryption_key = base64.b64encode(os.urandom(32)).decode('utf-8')
print(encryption_key)
```
Add the output as the `ENCRYPTION_KEY_BASE64` env var in Vercel.

## Masking Your Real API Key

Before making requests to your proxy, you need to generate the masked key (`ivBase64:encryptedKeyBase64`). 

Here is a Python script to do this:

```python
import os
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

# 1. Provide your real API key and the base64 encryption key you set in Vercel
real_api_key = b"YOUR_ACTUAL_API_KEY"
encryption_key_base64 = "YOUR_ENCRYPTION_KEY_BASE64_FROM_VERCEL"
encryption_key = base64.b64decode(encryption_key_base64)

# 2. Generate a random 16-byte IV for AES-CBC
iv = os.urandom(16)

# 3. Add PKCS7 padding to the real API key
padder = padding.PKCS7(algorithms.AES.block_size).padder()
padded_data = padder.update(real_api_key) + padder.finalize()

# 4. Encrypt using AES-256-CBC
cipher = Cipher(algorithms.AES(encryption_key), modes.CBC(iv), backend=default_backend())
encryptor = cipher.encryptor()
encrypted_key = encryptor.update(padded_data) + encryptor.finalize()

# 5. Format to ivBase64:encryptedKeyBase64
iv_b64 = base64.b64encode(iv).decode('utf-8')
enc_b64 = base64.b64encode(encrypted_key).decode('utf-8')

masked_key = f"{iv_b64}:{enc_b64}"
print("Your MASKED_KEY is:")
print(masked_key)
```

## Usage

Once deployed, Vercel will provide you with a domain (e.g., `https://your-proxy-domain.vercel.app`).

To use the proxy, simply replace the official API base URL with your new Vercel domain, and use your generated `MASKED_KEY` instead of the original API key. 

### cURL Example

```bash
curl "https://your-proxy-domain.vercel.app/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_MASKED_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[{"text": "Write a story about a magic backpack."}]
        }]
       }'
```

### SDK Example (Node.js)

If you are using the official `@google/generative-ai` SDK, you can override the `baseUrl` during model initialization.

```javascript
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Initialize with your MASKED key
const genAI = new GoogleGenerativeAI("YOUR_MASKED_KEY");

// Override the base URL to point to your Vercel Proxy
const model = genAI.getGenerativeModel(
  { model: "gemini-1.5-flash" },
  { baseUrl: "https://your-proxy-domain.vercel.app" }
);

async function run() {
  const result = await model.generateContent("Write a story about a magic backpack.");
  console.log(result.response.text());
}
run();
```



