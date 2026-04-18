"""UPI ID utilities — format validation + masking for privacy."""
import re

_UPI_REGEX = re.compile(r'^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$')


def validate_upi_id(upi_id: str) -> bool:
    """Validate UPI ID format (e.g., name@okicici, phone@ybl)."""
    return bool(_UPI_REGEX.match(upi_id)) and len(upi_id) <= 50


def mask_upi_id(upi_id: str) -> str:
    """Mask UPI ID for privacy (show ab****@bank)."""
    if not upi_id or '@' not in upi_id:
        return '****'
    name, bank = upi_id.split('@', 1)
    masked = name[:2] + '****' if len(name) > 2 else '****'
    return f"{masked}@{bank}"
