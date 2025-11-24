from pydantic import BaseModel, Field, constr
from typing import Optional

class WalkinRegisterRequest(BaseModel):
    name: constr(strip_whitespace=True, min_length=1, max_length=200)
    mobile: constr(strip_whitespace=True, min_length=8, max_length=20)
    yearOfBirth: constr(strip_whitespace=True, min_length=4, max_length=4)
    gender: Optional[str] = ""
    hasCaregiver: bool = False
    countryCode: Optional[str] = Field(default="+91", max_length=6)

    # NEW: optional OTP fields for walk-in verification
    otpCode: Optional[str] = None
    otpSessionId: Optional[str] = None


class WalkinRegisterResponse(BaseModel):
    patientId: str
    created: bool
    kioskVisitId: str
    normalizedPhone: str
    groupAssigned: str = "Patients"
