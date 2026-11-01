import hashlib
import hmac
import secrets

# scrypt from the standard library; parameters per OWASP's minimum recommendation.
N, R, P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=N, r=R, p=P)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    _, salt, digest = password_hash.split("$")
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=N, r=R, p=P)
    return hmac.compare_digest(candidate.hex(), digest)
