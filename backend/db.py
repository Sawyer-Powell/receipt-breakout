from typing import Annotated
from fastapi import Depends
from sqlalchemy import Engine
from sqlmodel import (
    Relationship,
    SQLModel,
    Field,
    Session,
    create_engine,
    inspect,
)
import logging

logger = logging.getLogger(__name__)


class Receipt(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    path: str = Field()

    line_items: list["ReceiptLineItem"] = Relationship(back_populates="receipt")


class ReceiptLineItem(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    path: str = Field()
    price: float = Field()
    name: str = Field()
    receipt_id: int | None = Field(default=None, foreign_key="receipt.id")
    receipt: Receipt | None = Relationship(back_populates="line_items")


engine = create_engine(
    "sqlite:///./data.sqlite", echo=True, connect_args={"check_same_thread": False}
)


def ensure_tables_exist(engine: Engine):
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    model_tables = list(SQLModel.metadata.tables.keys())

    if not any(table in existing_tables for table in model_tables):
        SQLModel.metadata.create_all(engine)
        logger.info("Creating tables in db according to schema")


ensure_tables_exist(engine)


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
