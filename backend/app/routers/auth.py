from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, UserResponse, Token
from app.services.auth_helpers import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user
)
from app.services.google_oauth import verify_google_token

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_in.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists."
        )
    
    # Create new user
    hashed_pwd = get_password_hash(user_in.password)
    db_user = User(
        email=user_in.email,
        hashed_password=hashed_pwd,
        full_name=user_in.full_name
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    # Fetch user
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Generate token
    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/google", response_model=Token)
def google_login(id_token: str = Body(..., embed=True), db: Session = Depends(get_db)):
    # Debug log (truncated token)
    print("[DEBUG] Received Google id_token:", id_token[:20], "...")
    """Verify Google ID token, upsert user, and return JWT."""
    try:
        email, full_name = verify_google_token(id_token)
        print("[DEBUG] Google token verified. Email:", email, "Name:", full_name)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google authentication failed",
        ) from e

    # Upsert user
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email, hashed_password="google_oauth_placeholder", full_name=full_name)
        db.add(user)
        db.commit()
        db.refresh(user)

    access_token = create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}
