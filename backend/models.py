from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Auth / shop
# --------------------------------------------------------------------------- #
class ShopRegister(BaseModel):
    name: str
    owner_name: str = ""
    phone: str
    pin: str = Field(min_length=4, max_length=6)
    gstin: str = ""
    address: str = ""
    mode: Literal["single", "multi"] = "single"
    business_type: Literal["standard", "street_vendor"] = "standard"
    gst_rate: float = 5
    upi_id: str = ""


class ShopLogin(BaseModel):
    phone: str
    pin: str


class ShopUpdate(BaseModel):
    name: Optional[str] = None
    owner_name: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[str] = None
    gst_rate: Optional[float] = None
    upi_id: Optional[str] = None
    business_type: Optional[Literal["standard", "street_vendor"]] = None


# --------------------------------------------------------------------------- #
# Khata
# --------------------------------------------------------------------------- #
class KhataEntry(BaseModel):
    customer_name: str
    amount: float
    type: Literal["credit", "payment"]
    note: str = ""
    date: Optional[str] = None
    phone: Optional[str] = None


class TranscriptIn(BaseModel):
    transcript: str


class CustomerPhoneIn(BaseModel):
    phone: str


# --------------------------------------------------------------------------- #
# Invoices
# --------------------------------------------------------------------------- #
class InvoiceItem(BaseModel):
    name: str
    qty: float = 1
    rate: float = 0
    gst: Optional[float] = None  # None => use the shop's stored gst_rate


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
