from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class IBConfigBase(BaseModel):
    host: str = Field(default="127.0.0.1")
    port: int
    client_id: int
    account_id: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    use_ssl: bool = True
    mode: str = "paper"

class IBConfigCreate(IBConfigBase):
    pass

class IBConfigUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    client_id: Optional[int] = None
    account_id: Optional[str] = None
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    use_ssl: Optional[bool] = None
    mode: Optional[str] = None

class IBConfigResponse(IBConfigBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
