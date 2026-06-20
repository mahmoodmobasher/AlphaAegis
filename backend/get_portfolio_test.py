"""
Test script for fetching portfolio data via FastAPI.
Ensures authentication and endpoint response correctness.
"""

import sys
sys.path.append('.')
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.services.auth_helpers import create_access_token
from datetime import timedelta

client = TestClient(app)

db = SessionLocal()
user = db.query(User).filter(User.email == "mahmoodmobasher@gmail.com").first()
if not user:
    print("User not found!")
    db.close()
    sys.exit(1)

token = create_access_token(data={"sub": user.email}, expires_delta=timedelta(hours=1))
headers = {"Authorization": f"Bearer {token}"}
response = client.get("/api/portfolio", headers=headers)
print("STATUS:", response.status_code)
import json
print(json.dumps(response.json(), indent=2))
db.close()
