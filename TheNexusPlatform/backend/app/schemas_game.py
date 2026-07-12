"""Schemas for the mock Game Platform scenario generator."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class GenerateScenarioRequest(BaseModel):
    program_id: str
    game_type: str
    prompt: str = Field(min_length=1)


class ScenarioStep(BaseModel):
    narration: str
    dialogue: Optional[str] = None


class ScenarioResult(BaseModel):
    title: str
    setup: str
    steps: list[ScenarioStep] = Field(default_factory=list)
    outcome: str


class ScenarioResponse(BaseModel):
    id: str
    program_id: str
    game_type: str
    prompt: str
    title: str
    setup: str
    steps: list[ScenarioStep]
    outcome: str
    created_at: datetime
