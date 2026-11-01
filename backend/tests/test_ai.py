import json
import os
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app import ai
from app.models import ChatMessage

live = pytest.mark.skipif(not os.environ.get("OPENROUTER_API_KEY"), reason="needs OPENROUTER_API_KEY")


def completion(message):
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


@pytest.fixture
def client(monkeypatch):
    client = MagicMock()
    monkeypatch.setattr(ai, "get_client", lambda: client)
    return client


def test_ask_returns_the_reply(client):
    client.chat.completions.create.return_value = completion(SimpleNamespace(content="4"))
    assert ai.ask("What is 2+2?") == "4"
    kwargs = client.chat.completions.create.call_args.kwargs
    assert kwargs["model"] == "openai/gpt-oss-120b"
    assert kwargs["messages"] == [{"role": "user", "content": "What is 2+2?"}]


def test_chat_sends_board_history_and_message(client):
    reply = ai.AIResponse(message="Done", operations=[])
    client.chat.completions.parse.return_value = completion(SimpleNamespace(parsed=reply))
    board = {"columns": [], "cards": {}}
    history = [ChatMessage(role="user", content="Hi"), ChatMessage(role="assistant", content="Hello")]

    assert ai.chat(board, history, "Add a card") == reply
    kwargs = client.chat.completions.parse.call_args.kwargs
    system, *rest = kwargs["messages"]
    assert system["role"] == "system"
    assert system["content"].endswith(json.dumps(board))
    assert f"Today is {date.today().isoformat()}." in system["content"]
    assert rest == [
        {"role": "user", "content": "Hi"},
        {"role": "assistant", "content": "Hello"},
        {"role": "user", "content": "Add a card"},
    ]
    assert kwargs["response_format"] is ai.AIResponse


def test_chat_without_structured_reply_raises(client):
    client.chat.completions.parse.return_value = completion(SimpleNamespace(parsed=None))
    with pytest.raises(ValueError):
        ai.chat({"columns": [], "cards": {}}, [], "Hi")


def test_missing_key_raises_openai_error(monkeypatch):
    from openai import OpenAIError

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "not-for-openrouter")
    with pytest.raises(OpenAIError):
        ai.get_client()


@pytest.mark.live
@live
def test_live_ask():
    assert "4" in ai.ask("What is 2+2?")


def test_client_points_at_openrouter(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    client = ai.get_client()
    assert str(client.base_url) == "https://openrouter.ai/api/v1/"
    assert client.api_key == "test-key"
