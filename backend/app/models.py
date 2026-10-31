from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class CamelModel(BaseModel):
    """snake_case in Python, camelCase in JSON (matching the frontend)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Card(CamelModel):
    id: str
    title: str
    details: str


class Column(CamelModel):
    id: str
    title: str
    card_ids: list[str]


class Board(CamelModel):
    """Same shape as the frontend BoardData type."""

    columns: list[Column]
    cards: dict[str, Card]


class LoginRequest(CamelModel):
    username: str
    password: str


class RenameColumnRequest(CamelModel):
    title: Title


class CreateCardRequest(CamelModel):
    column_id: str
    title: Title
    details: Details = ""


class UpdateCardRequest(CamelModel):
    title: Title
    details: Details = ""


class MoveCardRequest(CamelModel):
    column_id: str
    position: int = Field(ge=0)
