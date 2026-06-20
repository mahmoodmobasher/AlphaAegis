from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app import models, database
from app.services.auth_helpers import get_current_user
from app.schemas.ib_config import IBConfigResponse, IBConfigCreate, IBConfigUpdate

router = APIRouter(prefix="/ib/configs", tags=["IB Configs"])

@router.post("/", response_model=IBConfigResponse)
async def create_ib_config(
    cfg: IBConfigCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_cfg = models.IBConfig(**cfg.dict(), user_id=current_user.id)
    db.add(db_cfg)
    db.commit()
    db.refresh(db_cfg)
    return db_cfg

@router.get("/", response_model=list[IBConfigResponse])
async def list_ib_configs(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.IBConfig).filter(models.IBConfig.user_id == current_user.id).all()

@router.get("/me", response_model=IBConfigResponse)
async def get_my_ib_config(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    cfg = db.query(models.IBConfig).filter(models.IBConfig.user_id == current_user.id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="No IB config found for user")
    return cfg

@router.get("/{config_id}", response_model=IBConfigResponse)
async def get_ib_config(
    config_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    cfg = db.query(models.IBConfig).filter(models.IBConfig.id == config_id, models.IBConfig.user_id == current_user.id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    return cfg

@router.put("/{config_id}", response_model=IBConfigResponse)
async def update_ib_config(
    config_id: int,
    cfg: IBConfigUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_cfg = db.query(models.IBConfig).filter(models.IBConfig.id == config_id, models.IBConfig.user_id == current_user.id).first()
    if not db_cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    for key, value in cfg.dict(exclude_unset=True).items():
        setattr(db_cfg, key, value)
    db.commit()
    db.refresh(db_cfg)
    return db_cfg

@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ib_config(
    config_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    cfg = db.query(models.IBConfig).filter(models.IBConfig.id == config_id, models.IBConfig.user_id == current_user.id).first()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    db.delete(cfg)
    db.commit()
    return
