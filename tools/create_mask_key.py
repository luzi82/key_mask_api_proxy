import os
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

import argparse

parser = argparse.ArgumentParser(description='Generate a masked API key for Vercel environment variable.')
parser.add_argument('--real-key', type=str, help='Your actual API key to be masked')
parser.add_argument('--encryption-key', type=str, help='Base64 encryption key from Vercel')
args = parser.parse_args()

# 1. Provide your real API key and the base64 encryption key you set in Vercel
real_api_key = args.real_key.encode('utf-8')
encryption_key_base64 = args.encryption_key.encode('utf-8')
encryption_key = base64.b64decode(encryption_key_base64)

# 2. Generate a random 16-byte IV for AES-CBC
iv = os.urandom(16)

# 3. Add PKCS7 padding to the real API key
padder = padding.PKCS7(128).padder()
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
