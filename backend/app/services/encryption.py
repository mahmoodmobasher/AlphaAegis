import base64
from app.config import settings

def encrypt_key(plain_text: str) -> str:
    if not plain_text:
        return ""
    key = settings.SECRET_KEY[:32].encode()
    encoded_chars = []
    for i, char in enumerate(plain_text):
        key_c = key[i % len(key)]
        encoded_c = chr(ord(char) ^ key_c)
        encoded_chars.append(encoded_c)
    encoded_string = "".join(encoded_chars)
    return base64.b64encode(encoded_string.encode('utf-8', errors='ignore')).decode('utf-8')

def decrypt_key(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    try:
        raw_cipher = base64.b64decode(cipher_text.encode('utf-8')).decode('utf-8', errors='ignore')
        key = settings.SECRET_KEY[:32].encode()
        decoded_chars = []
        for i, char in enumerate(raw_cipher):
            key_c = key[i % len(key)]
            decoded_c = chr(ord(char) ^ key_c)
            decoded_chars.append(decoded_c)
        return "".join(decoded_chars)
    except Exception:
        return cipher_text
