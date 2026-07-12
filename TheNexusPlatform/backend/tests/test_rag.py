"""Tests for chunking and BM25 retrieval."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.chunking import chunk_text, tokenize
from app.rag import index_upload_text, retrieve_context, retrieve_from_text


def test_chunk_text_overlap():
    text = "word " * 500
    chunks = chunk_text(text, chunk_size=200, overlap=50)
    assert len(chunks) > 1
    assert all("text" in c and "start" in c for c in chunks)


def test_tokenize_lowercase():
    tokens = tokenize("Brain Basics: Neurons & Synapses!")
    assert "brain" in tokens
    assert "neurons" in tokens


def test_retrieve_from_text_prefers_relevant_chunk():
    text = (
        "Learning and memory involve hippocampus and amygdala. "
        "Senses and perception use the retina and cochlea. "
        "Movement is controlled by motor cortex."
    ) * 30
    context = retrieve_from_text(text, "hippocampus learning memory", top_k=2, max_chars=2000)
    assert "hippocampus" in context.lower() or "learning" in context.lower()


def test_retrieve_context_prefers_relevant_chunk():
    upload_id = "test-upload-rag"
    text = (
        "Chapter 1 Brain Basics. Neurons are nerve cells. "
        "Chapter 2 Senses and Perception. Vision uses the retina. "
        "Chapter 3 Movement. Motor cortex controls muscles."
    ) * 20
    index_upload_text(upload_id, text)
    context = retrieve_context([upload_id], "retina vision perception", top_k=3, max_chars=2000)
    assert "retina" in context.lower() or "vision" in context.lower()


if __name__ == "__main__":
    test_chunk_text_overlap()
    test_tokenize_lowercase()
    test_retrieve_from_text_prefers_relevant_chunk()
    test_retrieve_context_prefers_relevant_chunk()
    print("All RAG tests passed.")
