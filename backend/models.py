from typing import List, Literal, Optional

from pydantic import BaseModel


class KhataEntry(BaseModel):
    customer_name: str
    amount: float
    type: Literal["credit", "payment"]
    note: str = ""
    date: Optional[str] = None
    phone: Optional[str] = None


class TranscriptIn(BaseModel):
    transcript: str


class InvoiceItem(BaseModel):
    name: str
    qty: int = 1
    rate: float = 0
    gst: float = 5


class Invoice(BaseModel):
    invoice_id: Optional[str] = None
    customer_name: str
    items: List[InvoiceItem] = []
    total: Optional[float] = None
    date: Optional[str] = None


class ReminderIn(BaseModel):
    customer_name: str
    phone: Optional[str] = None
    amount: float
