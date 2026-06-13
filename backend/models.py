from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class KhataEntry(BaseModel):
    customer_name: str
    amount: float
    transaction_type: str  # e.g. "credit" or "debit"
    description: Optional[str] = None
    created_at: Optional[datetime] = None


class Invoice(BaseModel):
    transaction_id: Optional[int] = None
    customer_name: str
    amount: float
    pdf_path: Optional[str] = None
    created_at: Optional[datetime] = None
