from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Stock(Base):
    __tablename__ = "stocks"

    id = Column(Integer, primary_key=True, index=True)
    ticker = Column(String, unique=True, index=True) # e.g. BHP
    name = Column(String)                            # e.g. BHP Group Limited
    sector = Column(String)                          # e.g. Basic Materials
    description = Column(Text, nullable=True)        # long text desc 
    
    # Relationship to prices
    prices = relationship("StockPrice", back_populates="stock")

class StockPrice(Base):
    __tablename__ = "stock_prices"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stocks.id"))
    
    timestamp = Column(DateTime, default=datetime.utcnow)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)

    stock = relationship("Stock", back_populates="prices")