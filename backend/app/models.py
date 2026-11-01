from datetime import date
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints
from pydantic.alias_generators import to_camel

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
Priority = Literal["none", "low", "medium", "high"]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]


def _unique(labels: list[str]) -> list[str]:
    """Drop repeated labels (ignoring case), keeping the first spelling."""
    seen: set[str] = set()
    unique = []
    for label in labels:
        if label.lower() not in seen:
            seen.add(label.lower())
            unique.append(label)
    return unique


Labels = Annotated[list[Label], Field(max_length=10), AfterValidator(_unique)]


class CamelModel(BaseModel):
    """snake_case in Python, camelCase in JSON (matching the frontend)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ChecklistItem(CamelModel):
    id: str
    text: str
    done: bool


class Card(CamelModel):
    id: str
    title: str
    details: str
    priority: Priority
    due_date: date | None
    labels: list[str]
    checklist: list[ChecklistItem]


class Column(CamelModel):
    id: str
    title: str
    card_ids: list[str]


class Board(CamelModel):
    """Same shape as the frontend BoardData type."""

    columns: list[Column]
    cards: dict[str, Card]


class BoardSummary(CamelModel):
    id: int
    title: str
    # Username of the owner; is_owner is false for boards shared with the user.
    owner: str
    is_owner: bool


class ActivityEntry(CamelModel):
    id: int
    # None once the author's account is deleted.
    author: str | None
    message: str
    created_at: str


class Comment(CamelModel):
    id: str
    author: str | None
    text: str
    created_at: str
    # True for the signed-in user's own comments, which they may delete.
    mine: bool


class CommentRequest(CamelModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class BoardMembers(CamelModel):
    owner: str
    members: list[str]


class AddMemberRequest(CamelModel):
    username: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=32)]


class BoardTitleRequest(CamelModel):
    title: Title


# Every password is hashed with scrypt, so cap what is sent even where any value is checked.
EnteredPassword = Annotated[str, StringConstraints(max_length=128)]


class LoginRequest(CamelModel):
    username: Annotated[str, StringConstraints(max_length=32)]
    password: EnteredPassword


Username = Annotated[
    str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9_.-]{3,32}$")
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class RegisterRequest(CamelModel):
    username: Username
    password: Password


class ChangePasswordRequest(CamelModel):
    current_password: EnteredPassword
    new_password: Password


class DeleteAccountRequest(CamelModel):
    password: EnteredPassword


class RenameColumnRequest(CamelModel):
    title: Title


class CreateColumnRequest(CamelModel):
    title: Title


class MoveColumnRequest(CamelModel):
    position: int = Field(ge=0)


class CreateCardRequest(CamelModel):
    column_id: str
    title: Title
    details: Details = ""
    priority: Priority = "none"
    due_date: date | None = None
    labels: Labels = []


class UpdateCardRequest(CamelModel):
    """Partial update: only the fields sent change. dueDate can be null to clear it.

    The other fields default to None without validation, so leaving them out is fine but
    sending null for them is rejected.
    """

    title: Title = None
    details: Details = None
    priority: Priority = None
    due_date: date | None = None
    labels: Labels = None

    def changes(self) -> dict:
        """The fields that were sent, as database values."""
        values = self.model_dump(include=self.model_fields_set)
        if values.get("due_date") is not None:
            values["due_date"] = values["due_date"].isoformat()
        return values


class MoveCardRequest(CamelModel):
    column_id: str
    position: int = Field(ge=0)


# Keep a request well inside the model's context window.
CHAT_MESSAGE_MAX = 4000
CHAT_HISTORY_MAX = 40


class ChatMessage(CamelModel):
    role: Literal["user", "assistant"]
    # Assistant replies can be longer than what the user may type.
    content: Annotated[str, StringConstraints(max_length=2 * CHAT_MESSAGE_MAX)]


class ChatRequest(CamelModel):
    message: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=CHAT_MESSAGE_MAX)
    ]
    # The frontend sends only the latest turns.
    history: Annotated[list[ChatMessage], Field(max_length=CHAT_HISTORY_MAX)] = []


class ChatResponse(CamelModel):
    message: str
    board: Board | None


ChecklistText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class AddChecklistItemRequest(CamelModel):
    text: ChecklistText


class UpdateChecklistItemRequest(CamelModel):
    """Partial: send `text`, `done` or both (null is rejected, like card updates)."""

    text: ChecklistText = None
    done: bool = None

    def changes(self) -> dict:
        return self.model_dump(include=self.model_fields_set)
