import json
import os
from datetime import date
from typing import Annotated, Literal

from openai import OpenAI, OpenAIError
from pydantic import BaseModel, Field

from app.models import ChatMessage

MODEL = "openai/gpt-oss-120b"


def get_client() -> OpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY")
    # Checked here: without a key the SDK would fall back to OPENAI_API_KEY.
    if not api_key:
        raise OpenAIError("OPENROUTER_API_KEY is not set")
    return OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)


def ask(question: str) -> str:
    """Send a single question and return the reply (connectivity check)."""
    completion = get_client().chat.completions.create(
        model=MODEL, messages=[{"role": "user", "content": question}]
    )
    return completion.choices[0].message.content


# Structured output. Plain strings here: titles are validated when the operations are
# applied, with the same request models the board routes use.


Priority = Literal["none", "low", "medium", "high"]


class CreateCard(BaseModel):
    type: Literal["create_card"]
    column_id: str
    title: str
    details: str
    priority: Priority
    due_date: str | None
    labels: list[str]


class UpdateCard(BaseModel):
    type: Literal["update_card"]
    card_id: str
    title: str
    details: str
    priority: Priority
    due_date: str | None
    labels: list[str]


class MoveCard(BaseModel):
    type: Literal["move_card"]
    card_id: str
    column_id: str
    position: int


class DeleteCard(BaseModel):
    type: Literal["delete_card"]
    card_id: str


class RenameColumn(BaseModel):
    type: Literal["rename_column"]
    column_id: str
    title: str


class AddColumn(BaseModel):
    type: Literal["add_column"]
    title: str


Operation = Annotated[
    CreateCard | UpdateCard | MoveCard | DeleteCard | RenameColumn | AddColumn,
    Field(discriminator="type"),
]


class AIResponse(BaseModel):
    message: str
    operations: list[Operation]


SYSTEM_PROMPT = """You are the assistant in a Kanban project management app. You help the user \
plan their work and can change their board.

The current board is JSON: "columns" is the ordered list of columns, each with an "id", a \
"title" and "cardIds" (the cards in that column, top to bottom); "cards" maps each card id to \
its "id", "title", "details", "priority" ("none", "low", "medium" or "high"), "dueDate" (an \
ISO date such as 2026-03-31, or null), "labels" (short tags) and "checklist" (items with "text" \
and "done"; you can read the checklist but not change it).

Reply with "message" (your answer to the user, short and plain text) and "operations" (the \
changes to make, applied in order; an empty list when nothing should change):
- create_card: add a card at the bottom of column_id.
- update_card: replace the title, details, priority, due_date and labels of card_id (repeat the \
current values of the fields you do not change).
- move_card: move card_id to column_id at position (0 is the top, counted without the moved card).
- delete_card: delete card_id.
- rename_column: rename column_id.
- add_column: add a column with this title at the right end of the board. You cannot delete or \
reorder columns; the user does that.

Use only ids that appear in the board. A card or column you create in this reply has no id \
yet, so it cannot be used in the same reply. Titles are 1-200 characters, details at most 2000, \
due_date is YYYY-MM-DD or null, and a card has at most 10 labels of up to 30 characters. \
Only change the board when the user asks for it, and say in your message what you changed.
"""


def chat(board: dict, history: list[ChatMessage], message: str) -> AIResponse:
    """Ask the model about the board, given the earlier conversation and the new message."""
    completion = get_client().chat.completions.parse(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": f"{SYSTEM_PROMPT}\nToday is {date.today().isoformat()}.\n\n"
                f"Current board:\n{json.dumps(board)}",
            },
            *(turn.model_dump() for turn in history),
            {"role": "user", "content": message},
        ],
        response_format=AIResponse,
        # Only use OpenRouter providers that support structured outputs.
        extra_body={"provider": {"require_parameters": True}},
    )
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise ValueError("The model returned no structured reply")
    return parsed
