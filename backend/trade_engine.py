from sqlalchemy.orm import Session # type: ignore
import models
from datetime import datetime

def internal_execute_trade(db: Session, ticker: str, shares: int, price: float, trade_type: str):
    """
    internal helper to execute a trade across DB tables
    """
    account = db.query(models.Account).first()
    if not account:
        account = models.Account(balance=100000.0)
        db.add(account)
    
    total_cost = shares * price

    if trade_type == "BUY":
        if account.balance < total_cost:
            raise ValueError(f"Insufficient Buying Power. Cost: ${total_cost}, Available: ${account.balance}")
        
        # deduct cash
        account.balance -= total_cost
        
        # update holding
        holding = db.query(models.Holding).filter(models.Holding.ticker == ticker).first()
        if holding:
            # weighted average cost logic
            current_total_value = holding.shares * holding.avg_cost
            new_total_value = current_total_value + total_cost
            total_shares = holding.shares + shares
            
            holding.shares = total_shares
            holding.avg_cost = new_total_value / total_shares
        else:
            new_holding = models.Holding(ticker=ticker, shares=shares, avg_cost=price)
            db.add(new_holding)

    elif trade_type == "SELL":
        holding = db.query(models.Holding).filter(models.Holding.ticker == ticker).first()
        if not holding or holding.shares < shares:
            raise ValueError("Insufficient Shares")
        
        # add cash
        account.balance += total_cost
        
        # deduct shares
        holding.shares -= shares
        if holding.shares == 0:
            db.delete(holding)

    # record history
    tx = models.TransactionHistory(
        ticker=ticker, 
        type=trade_type, 
        shares=shares, 
        price=price
    )
    db.add(tx)
    return account.balance
