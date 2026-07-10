from typing import Optional

# ── Per-mode prompt templates (ported from src/services/prompts.ts) ──────────
# Same source concept, three voices. These are sent to Claude as the system
# prompt for the on-demand assistant, and summarized inside the generation
# prompt so all three modes stay factually consistent.
MODE_PROMPTS: dict[str, str] = {
    "conversational": (
        "You are a warm, encouraging tutor talking one-on-one with a student. "
        "Explain the concept the way a great teacher would out loud: short, friendly, "
        "second-person sentences. Check for understanding, use 'you', and keep it "
        "informal and human. Never sound like an essay or a textbook."
    ),
    "summary": (
        "Write a clear, well-structured textbook-style explanation of the concept. "
        "Use precise, neutral prose organized into short paragraphs, define key terms, "
        "and prioritize clarity and completeness over personality. This is the "
        "'read to understand' reference version."
    ),
    "narrative": (
        "Explain the concept purely through real-world examples and analogies. "
        "Ground every idea in a concrete, everyday scenario the student already knows, "
        "then map it back to the concept. Lead with the example, not the definition."
    ),
}


def _grade_clause(grade: Optional[str]) -> str:
    if not grade:
        return "Assume a general high-school reading level."
    return f"Target the reading level and content depth appropriate for a {grade} student."


def build_generation_prompt(topic: str, grade: Optional[str], source_text: Optional[str] = None) -> str:
    """One structured call: produce all three modes + assistant replies as JSON.

    The same facts are expressed in three voices so switching modes never changes
    the underlying content, only the presentation.
    """
    source_clause = ""
    if source_text and source_text.strip():
        source_clause = f"""
Ground your lesson in this source material from the teacher's uploaded documents:
---
{source_text.strip()}
---
Use facts, terminology, and emphasis from the source material above. Do not invent content that contradicts it.
"""

    return f"""You are generating a single micro-lesson about the concept: "{topic}".

{_grade_clause(grade)}
{source_clause}
Produce ONE JSON object (no markdown, no commentary) with EXACTLY these keys:

{{
  "concept": "<short concept name, e.g. '{topic}'>",
  "conversational": {{
    "question": "<the lesson's guiding question, e.g. 'What is {topic}?'>",
    "bubbles": [
      {{ "text": "<a short, friendly tutor chat message>" }},
      {{ "text": "<another short chat message that builds on it>" }},
      {{ "text": "<a wrap-up chat message>" }}
    ]
  }},
  "summary": {{
    "title": "<concept title>",
    "paragraphs": [
      "<clear textbook paragraph 1>",
      "<clear textbook paragraph 2>",
      "<clear textbook paragraph 3>"
    ]
  }},
  "narrative": {{
    "title": "<concept title>",
    "lead": "<a one-line hook that opens with an everyday scene>",
    "paragraphs": [
      "<real-world analogy paragraph 1>",
      "<real-world analogy paragraph 2>",
      "<real-world analogy paragraph 3>"
    ]
  }},
  "assistantReply": {{
    "conversational": "<how the tutor would answer a follow-up question, informal>",
    "summary": "<how a textbook-style assistant would answer a follow-up>",
    "narrative": "<how an analogy-first assistant would answer a follow-up>"
  }}
}}

Rules:
- All three modes must teach the SAME facts about "{topic}" — only the voice differs.
- conversational voice: {MODE_PROMPTS['conversational']}
- summary voice: {MODE_PROMPTS['summary']}
- narrative voice: {MODE_PROMPTS['narrative']}
- Keep each chat bubble to 1-3 sentences. Keep article paragraphs to 2-4 sentences.
- Do NOT include images or figures. Do NOT include any keys other than those above.
- Output raw JSON only."""


def build_assistant_prompt(topic: str, mode: str, source_text: Optional[str] = None) -> str:
    """System prompt for an on-demand assistant question within a mode."""
    voice = MODE_PROMPTS.get(mode, MODE_PROMPTS["conversational"])
    source_clause = ""
    if source_text and source_text.strip():
        source_clause = (
            f"\n\nReference material from the teacher's course:\n{source_text.strip()[:4000]}\n"
        )
    return (
        f"{voice}\n\n"
        f"You are helping a student who is currently studying the concept \"{topic}\"."
        f"{source_clause}\n"
        "Answer their question in 2-4 sentences, in the voice described above. "
        "Do not give away quiz answers; nudge toward understanding. Plain text only."
    )
