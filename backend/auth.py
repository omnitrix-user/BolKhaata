"""Lightweight PIN auth + shop resolution from a bearer-style token header.

We keep dependencies to the stdlib: PINs are stored as PBKDF2-HMAC-SHA256
hashes (salt$iterations$hash). Sessions are opaque random tokens stored on the
shop row and sent by the client in the ``X-Shop-Token`` header.
"""

import hashlib
import hmac
import os

from fastapi import Header, HTTPException

import database

_ITERATIONS = 120_000


def hash_pin(pin: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, _ITERATIONS)
    return f"{salt.hex()}${_ITERATIONS}${dk.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        salt_hex, iters, hash_hex = stored.split("$")
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, int(iters))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except Exception:
        return False


def require_shop(x_shop_token: str | None = Header(default=None)):
    """FastAPI dependency: resolve the authenticated shop or raise 401."""
    if not x_shop_token:
        raise HTTPException(status_code=401, detail="Missing shop token")
    row = database.get_shop_by_token(x_shop_token)
    if row is None:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return row
