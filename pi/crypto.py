"""Fernet encryption helpers for RDP passwords."""
import os
from cryptography.fernet import Fernet


def _key() -> bytes:
    raw = os.environ.get("FERNET_KEY", "").strip()
    if not raw:
        raise RuntimeError(
            "FERNET_KEY missing from environment. Generate one with:\n"
            '  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    return raw.encode()


def encrypt(plaintext: str) -> str:
    if plaintext is None:
        return None
    return Fernet(_key()).encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    if token is None:
        return None
    return Fernet(_key()).decrypt(token.encode()).decode()
