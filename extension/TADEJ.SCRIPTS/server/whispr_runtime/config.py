from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Final, Literal

LanguageOption = Literal["sl", "hr", "sr", "auto"]
SupportedLanguage = Literal["sl", "hr", "sr"]
TaskOption = Literal["transcribe", "translate"]
ModelOption = Literal["tiny", "base", "small", "medium", "large-v3"]

SUPPORTED_EXTENSIONS: Final[set[str]] = {
    ".wav",
    ".mp3",
    ".m4a",
    ".flac",
    ".mp4",
    ".mov",
    ".mkv",
}
DEFAULT_MODEL: Final[ModelOption] = "small"
DEFAULT_TASK: Final[TaskOption] = "transcribe"
DEFAULT_BEAM_SIZE: Final[int] = 5
CPU_COMPUTE_TYPE: Final[str] = "int8"
GPU_COMPUTE_TYPE: Final[str] = "float16"


@dataclass(frozen=True)
class TranscriptionConfig:
    input_path: Path
    output_dir: Path
    language: LanguageOption = "auto"
    language_candidates: tuple[SupportedLanguage, ...] = ()
    model: ModelOption = DEFAULT_MODEL
    task: TaskOption = DEFAULT_TASK
    word_timestamps: bool = True
    vad_filter: bool = False
    beam_size: int = DEFAULT_BEAM_SIZE
    post_process: bool = False
    debug: bool = False


@dataclass(frozen=True)
class RuntimeSettings:
    device: str
    compute_type: str
    used_fallback: bool = False
