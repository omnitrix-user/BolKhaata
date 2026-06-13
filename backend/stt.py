import io
import os

from openai import OpenAI

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    return _client


def transcribe_audio(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio via OpenAI Whisper. Returns transcript text or '' on failure."""
    if not os.getenv("OPENAI_API_KEY"):
        return ""
    try:
        buf = io.BytesIO(audio_bytes)
        buf.name = filename
        result = _get_client().audio.transcriptions.create(
            model="whisper-1",
            file=buf,
        )
        return (result.text or "").strip()
    except Exception as exc:  # pragma: no cover - network/runtime guard
        print(f"[stt] transcription failed: {exc}")
        return ""
