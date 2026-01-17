from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Boolean, ForeignKey # type: ignore
from sqlalchemy.orm import relationship # type: ignore
from datetime import datetime, timezone
from database import Base

class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, unique=True, index=True) # "BHP"
    name = Column(String)                            # "BHP Group"
    sector = Column(String, nullable=True)
    
    # realtime data fields
    price = Column(Float, default=0.0)
    change_amount = Column(Float, default=0.0)
    change_percent = Column(String, default="0%")    # "+1.23%"
    market_cap = Column(String, nullable=True)       # "200B"
    volume = Column(String, nullable=True)
    
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_watched = Column(Boolean, default=False)

