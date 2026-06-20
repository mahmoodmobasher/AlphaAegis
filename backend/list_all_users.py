from app.database import SessionLocal
from app.models.user import User
from app.models.portfolio import PortfolioPosition

db = SessionLocal()
users = db.query(User).all()
print(f"Total users: {len(users)}")
for u in users:
    positions = db.query(PortfolioPosition).filter(PortfolioPosition.user_id == u.id).all()
    print(f"User ID: {u.id}, Email: {u.email}, Name: {u.full_name}, Positions count: {len(positions)}")
db.close()
