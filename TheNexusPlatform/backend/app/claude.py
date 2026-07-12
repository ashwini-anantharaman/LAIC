import json
from typing import Type, TypeVar

from anthropic import Anthropic
from pydantic import BaseModel, ValidationError

from .config import get_settings

T = TypeVar("T", bound=BaseModel)

_client: Anthropic | None = None


def _get_client() -> Anthropic:
    global _client
    if _client is not None:
        return _client
    settings = get_settings()
    if not settings.anthropic_api_key or settings.anthropic_api_key == "your_anthropic_api_key_here":
        raise RuntimeError("ANTHROPIC_API_KEY is not configured. Set it in backend/.env")
    _client = Anthropic(api_key=settings.anthropic_api_key)
    return _client


def call_claude(system_prompt: str, user_message: str, max_tokens: int = 3000) -> str:
    """Single text completion (mirrors the LIAC lib/claude.ts wrapper)."""
    client = _get_client()
    settings = get_settings()
    message = client.messages.create(
        model=settings.claude_model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    )
    block = message.content[0]
    if block.type != "text":
        raise RuntimeError("Unexpected Claude response type")
    return block.text


def _extract_json(text: str) -> str:
    """Strip markdown fences / prose and return the JSON object substring."""
    t = text.strip()
    if t.startswith("```"):
        # remove opening fence (```json or ```) and trailing fence
        t = t.split("```", 2)[1] if t.count("```") >= 2 else t.strip("`")
        if t.lstrip().lower().startswith("json"):
            t = t.lstrip()[4:]
    start = t.find("{")
    end = t.rfind("}")
    if start != -1 and end != -1 and end > start:
        return t[start : end + 1]
    return t.strip()


def call_claude_json(system_prompt: str, user_message: str, schema: Type[T], max_tokens: int = 3500) -> T:
    """Call Claude and validate the response against a Pydantic schema.

    Retries once (with a corrective nudge) if the first response is not valid
    JSON matching the schema.
    """
    raw = call_claude(system_prompt, user_message, max_tokens=max_tokens)
    last_err: Exception | None = None
    for attempt in range(2):
        candidate = raw if attempt == 0 else raw
        try:
            data = json.loads(_extract_json(candidate))
            return schema.model_validate(data)
        except (json.JSONDecodeError, ValidationError) as err:
            last_err = err
            if attempt == 0:
                raw = call_claude(
                    system_prompt,
                    user_message
                    + "\n\nYour previous response was not valid JSON matching the required shape. "
                    "Return ONLY the raw JSON object, no markdown, no commentary.",
                    max_tokens=max_tokens,
                )
    raise RuntimeError(f"Claude did not return valid JSON: {last_err}")
