from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from config import CPU_COMPUTE_TYPE, GPU_COMPUTE_TYPE, SUPPORTED_EXTENSIONS, RuntimeSettings, SupportedLanguage, TranscriptionConfig

LOGGER = logging.getLogger(__name__)


class TranscriptionError(Exception):
    """Base error for user-facing transcription failures."""


class FileValidationError(TranscriptionError):
    """Raised when the input file is invalid."""


class FfmpegNotFoundError(TranscriptionError):
    """Raised when ffmpeg is required but unavailable."""


class ModelInitializationError(TranscriptionError):
    """Raised when the transcription model cannot be loaded."""


@dataclass(frozen=True)
class SegmentResult:
    id: int
    start: float
    end: float
    text: str
    language: str | None = None
    words: list["WordTimestamp"] | None = None


@dataclass(frozen=True)
class WordTimestamp:
    word: str
    start: float
    end: float


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: str
    duration_seconds: float
    processing_seconds: float
    model: str
    device: str
    segments: list[SegmentResult]


class Transcriber:
    def __init__(self, config: TranscriptionConfig) -> None:
        self.config = config
        self._runtime_settings: RuntimeSettings | None = None
        self._prepare_runtime_environment()

    @property
    def runtime_settings(self) -> RuntimeSettings:
        if self._runtime_settings is None:
            self._runtime_settings = self._resolve_runtime_settings()
        return self._runtime_settings

    def transcribe(self) -> TranscriptionResult:
        self._validate_input_file(self.config.input_path)

        with tempfile.TemporaryDirectory(prefix="whispr_") as temp_dir_name:
            temp_dir = Path(temp_dir_name)
            prepared_path = self._prepare_input_file(self.config.input_path, temp_dir)

            model = self._load_model()
            start_time = time.perf_counter()

            try:
                raw_segments, info = self._run_transcription(model, prepared_path)
            except Exception as exc:
                raise TranscriptionError(f"Transcription failed: {exc}") from exc

            segments = self._build_segments(raw_segments)
            detected_language = getattr(info, "language", None) or (
                self.config.language if self.config.language != "auto" else "unknown"
            )

            if self._should_route_by_segment():
                segments = self._transcribe_with_language_routing(model, prepared_path, segments)
                detected_language = self._resolve_result_language(segments)

            processing_seconds = time.perf_counter() - start_time
            if self.config.post_process:
                segments = self._post_process_segments(segments)
            transcript_text = self._join_segment_text(segments)
            duration_seconds = self._resolve_duration_seconds(info, segments)

            return TranscriptionResult(
                text=transcript_text,
                language=str(detected_language),
                duration_seconds=duration_seconds,
                processing_seconds=processing_seconds,
                model=self.config.model,
                device=self.runtime_settings.device,
                segments=segments,
            )

    def _should_route_by_segment(self) -> bool:
        return len(self.config.language_candidates) > 1 and self.config.task == "transcribe"

    def _transcribe_with_language_routing(
        self,
        model: Any,
        prepared_path: Path,
        base_segments: list[SegmentResult],
    ) -> list[SegmentResult]:
        LOGGER.info(
            "Mixed-language mode enabled for candidate languages: %s",
            ", ".join(self.config.language_candidates),
        )
        routed_segments: list[SegmentResult] = []

        for segment in base_segments:
            routed_segments.append(self._transcribe_segment_with_best_language(model, prepared_path, segment))

        return routed_segments

    def _transcribe_segment_with_best_language(
        self,
        model: Any,
        prepared_path: Path,
        segment: SegmentResult,
    ) -> SegmentResult:
        segment_duration = max(segment.end - segment.start, 0.0)
        if segment_duration <= 0.0:
            return segment

        best_result: SegmentResult | None = None
        best_score: float | None = None

        with tempfile.TemporaryDirectory(prefix="whispr_segment_") as temp_dir_name:
            clip_path = Path(temp_dir_name) / f"segment_{segment.id}.wav"
            self._write_wav_segment(prepared_path, clip_path, segment.start, segment.end)

            for candidate_language in self.config.language_candidates:
                candidate_segment, candidate_score = self._transcribe_clip_for_language(
                    model=model,
                    clip_path=clip_path,
                    original_segment=segment,
                    candidate_language=candidate_language,
                )

                if best_score is None or candidate_score > best_score:
                    best_score = candidate_score
                    best_result = candidate_segment

        return best_result if best_result is not None else segment

    def _run_transcription(self, model: Any, prepared_path: Path) -> tuple[list[Any], Any]:
        try:
            segments_iter, info = self._transcribe_once(model, prepared_path)
            return list(segments_iter), info
        except Exception as primary_exc:
            if self.runtime_settings.device != "cuda":
                raise

            if not self._is_cuda_runtime_failure(primary_exc):
                raise

            LOGGER.warning("CUDA transcription failed, retrying on CPU: %s", primary_exc)
            from faster_whisper import WhisperModel

            fallback = RuntimeSettings(device="cpu", compute_type=CPU_COMPUTE_TYPE, used_fallback=True)
            self._runtime_settings = fallback
            cpu_model = WhisperModel(self.config.model, device=fallback.device, compute_type=fallback.compute_type)
            segments_iter, info = self._transcribe_once(cpu_model, prepared_path)
            return list(segments_iter), info

    def save_outputs(self, result: TranscriptionResult) -> dict[str, Path]:
        output_dir = self.config.output_dir
        output_dir.mkdir(parents=True, exist_ok=True)

        base_name = self.config.input_path.stem
        txt_path = output_dir / f"{base_name}.txt"
        srt_path = output_dir / f"{base_name}.srt"
        json_path = output_dir / f"{base_name}.json"

        txt_path.write_text(result.text, encoding="utf-8")
        srt_path.write_text(self._build_srt(result.segments), encoding="utf-8")
        json_path.write_text(
            json.dumps(self._build_json_payload(result), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return {
            "txt": txt_path,
            "srt": srt_path,
            "json": json_path,
        }

    def _prepare_runtime_environment(self) -> None:
        if sys.platform != "win32":
            return

        candidate_dirs = self._find_windows_cuda_dirs()
        if not candidate_dirs:
            return

        current_path = os.environ.get("PATH", "")
        current_parts = current_path.split(os.pathsep) if current_path else []
        additions = [path for path in candidate_dirs if str(path) not in current_parts]
        if not additions:
            return

        os.environ["PATH"] = os.pathsep.join([*(str(path) for path in additions), current_path])
        LOGGER.info("Added %d CUDA runtime path(s) for Windows DLL resolution", len(additions))

    def _find_windows_cuda_dirs(self) -> list[Path]:
        required_names = ("cublas64_12.dll", "cublasLt64_12.dll")
        candidate_dirs: list[Path] = []

        cuda_path = os.environ.get("CUDA_PATH")
        if cuda_path:
            candidate_dirs.append(Path(cuda_path) / "bin")

        candidate_dirs.append(Path(sys.prefix) / "Lib" / "site-packages" / "ctranslate2")
        candidate_dirs.append(Path("C:/Program Files/Blackmagic Design/DaVinci Resolve"))

        nvidia_toolkit_root = Path("C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA")
        if nvidia_toolkit_root.exists():
            candidate_dirs.extend(path / "bin" for path in nvidia_toolkit_root.iterdir() if path.is_dir())

        resolved: list[Path] = []
        for candidate in candidate_dirs:
            try:
                if candidate.exists() and any((candidate / dll_name).exists() for dll_name in required_names):
                    resolved.append(candidate.resolve())
            except OSError:
                LOGGER.debug("Skipping unreadable CUDA candidate directory: %s", candidate)

        unique_dirs: list[Path] = []
        seen: set[str] = set()
        for path in resolved:
            key = str(path).lower()
            if key not in seen:
                seen.add(key)
                unique_dirs.append(path)
        return unique_dirs

    def _resolve_runtime_settings(self) -> RuntimeSettings:
        if self._has_cuda_support():
            return RuntimeSettings(device="cuda", compute_type=GPU_COMPUTE_TYPE)
        return RuntimeSettings(device="cpu", compute_type=CPU_COMPUTE_TYPE)

    def _has_cuda_support(self) -> bool:
        try:
            import ctranslate2

            get_cuda_device_count = getattr(ctranslate2, "get_cuda_device_count", None)
            if callable(get_cuda_device_count):
                return int(get_cuda_device_count()) > 0
        except Exception as exc:
            LOGGER.debug("CUDA detection via ctranslate2 failed: %s", exc)

        return False

    def _load_model(self) -> Any:
        primary = self.runtime_settings
        LOGGER.info(
            "Loading model '%s' on %s with compute_type=%s",
            self.config.model,
            primary.device,
            primary.compute_type,
        )

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise ModelInitializationError(
                "faster-whisper is not installed. Activate your virtual environment and run 'pip install -r requirements.txt'."
            ) from exc

        try:
            return WhisperModel(self.config.model, device=primary.device, compute_type=primary.compute_type)
        except Exception as primary_exc:
            if primary.device != "cuda":
                raise ModelInitializationError(f"Model loading failed on CPU: {primary_exc}") from primary_exc

            LOGGER.warning("CUDA model load failed, falling back to CPU: %s", primary_exc)
            fallback = RuntimeSettings(device="cpu", compute_type=CPU_COMPUTE_TYPE, used_fallback=True)
            self._runtime_settings = fallback

            try:
                return WhisperModel(self.config.model, device=fallback.device, compute_type=fallback.compute_type)
            except Exception as fallback_exc:
                raise ModelInitializationError(
                    f"Model loading failed on GPU and fallback CPU. GPU error: {primary_exc}. CPU error: {fallback_exc}"
                ) from fallback_exc

    def _transcribe_once(self, model: Any, prepared_path: Path) -> tuple[Any, Any]:
        return model.transcribe(
            str(prepared_path),
            language=None if self.config.language == "auto" else self.config.language,
            task=self.config.task,
            beam_size=self.config.beam_size,
            vad_filter=self.config.vad_filter,
            word_timestamps=self.config.word_timestamps,
        )

    def _transcribe_clip_for_language(
        self,
        *,
        model: Any,
        clip_path: Path,
        original_segment: SegmentResult,
        candidate_language: SupportedLanguage,
    ) -> tuple[SegmentResult, float]:
        segments_iter, _ = model.transcribe(
            str(clip_path),
            language=candidate_language,
            task=self.config.task,
            beam_size=self.config.beam_size,
            vad_filter=False,
            word_timestamps=self.config.word_timestamps,
        )
        raw_segments = list(segments_iter)

        if not raw_segments:
            return (
                SegmentResult(
                    id=original_segment.id,
                    start=original_segment.start,
                    end=original_segment.end,
                    text="",
                    language=candidate_language,
                    words=[],
                ),
                float("-inf"),
            )

        clip_segments = self._build_segments(raw_segments, time_offset=original_segment.start, language=candidate_language)
        merged_text = self._join_segment_text(clip_segments)
        merged_words = self._join_segment_words(clip_segments)
        avg_logprobs = [float(getattr(item, "avg_logprob", -10.0)) for item in raw_segments]
        score = sum(avg_logprobs) / len(avg_logprobs)

        return (
            SegmentResult(
                id=original_segment.id,
                start=original_segment.start,
                end=original_segment.end,
                text=merged_text,
                language=candidate_language,
                words=merged_words,
            ),
            score,
        )

    def _is_cuda_runtime_failure(self, exc: Exception) -> bool:
        message = str(exc).lower()
        runtime_markers = (
            "cublas",
            "cudnn",
            "cuda",
            "failed to load library",
            "cannot be loaded",
            "not found",
        )
        return any(marker in message for marker in runtime_markers)

    def _prepare_input_file(self, input_path: Path, temp_dir: Path) -> Path:
        if input_path.suffix.lower() == ".wav":
            return input_path

        ffmpeg_executable = shutil.which("ffmpeg")
        if ffmpeg_executable is None:
            raise FfmpegNotFoundError(
                "ffmpeg is required for non-WAV inputs but was not found in PATH. Install ffmpeg or use a WAV file."
            )

        output_path = temp_dir / f"{input_path.stem}.wav"
        command = [
            ffmpeg_executable,
            "-y",
            "-i",
            str(input_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            str(output_path),
        ]

        LOGGER.info("Converting %s to temporary WAV via ffmpeg", input_path.name)
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            stderr = completed.stderr.strip() or "Unknown ffmpeg error."
            raise TranscriptionError(f"ffmpeg conversion failed: {stderr}")

        return output_path

    def _validate_input_file(self, input_path: Path) -> None:
        if not input_path.exists():
            raise FileValidationError(f"Input file does not exist: {input_path}")
        if not input_path.is_file():
            raise FileValidationError(f"Input path is not a file: {input_path}")
        if input_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            supported = ", ".join(sorted(ext.lstrip(".") for ext in SUPPORTED_EXTENSIONS))
            raise FileValidationError(
                f"Unsupported file format '{input_path.suffix}'. Supported formats: {supported}."
            )

    def _build_segments(
        self,
        raw_segments: list[Any],
        *,
        time_offset: float = 0.0,
        language: str | None = None,
    ) -> list[SegmentResult]:
        segments: list[SegmentResult] = []
        for index, segment in enumerate(raw_segments, start=1):
            text = str(getattr(segment, "text", "")).strip()
            words = self._extract_word_timestamps(segment, time_offset=time_offset)
            segments.append(
                SegmentResult(
                    id=index,
                    start=round(float(getattr(segment, "start", 0.0)) + time_offset, 3),
                    end=round(float(getattr(segment, "end", 0.0)) + time_offset, 3),
                    text=text,
                    language=language,
                    words=words,
                )
            )
        return segments

    def _post_process_segments(self, segments: list[SegmentResult]) -> list[SegmentResult]:
        processed_segments: list[SegmentResult] = []
        for segment in segments:
            processed_segments.append(
                SegmentResult(
                    id=segment.id,
                    start=segment.start,
                    end=segment.end,
                    text=self._post_process_text(segment.text),
                    language=segment.language,
                    words=segment.words,
                )
            )
        return processed_segments

    def _post_process_text(self, text: str) -> str:
        normalized = text.strip()
        if not normalized:
            return normalized

        normalized = re.sub(r"\s+", " ", normalized)
        normalized = re.sub(r"\s+([,.;:!?])", r"\1", normalized)
        normalized = re.sub(r"([,.;:!?])(?!\s|$)", r"\1 ", normalized)
        normalized = re.sub(r"\s{2,}", " ", normalized)

        if normalized:
            normalized = normalized[0].upper() + normalized[1:]

        return normalized

    def _join_segment_text(self, segments: list[SegmentResult]) -> str:
        return " ".join(segment.text for segment in segments if segment.text).strip()

    def _resolve_duration_seconds(self, info: Any, segments: list[SegmentResult]) -> float:
        raw_duration = getattr(info, "duration", None)
        if raw_duration is not None:
            return round(float(raw_duration), 3)
        if segments:
            return round(max(segment.end for segment in segments), 3)
        return 0.0

    def _build_json_payload(self, result: TranscriptionResult) -> dict[str, Any]:
        return {
            "text": result.text,
            "language": result.language,
            "duration_seconds": result.duration_seconds,
            "processing_seconds": round(result.processing_seconds, 3),
            "model": result.model,
            "device": result.device,
            "segments": [
                {
                    "id": segment.id,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text,
                    "language": segment.language,
                    "words": [
                        {
                            "word": word.word,
                            "start": word.start,
                            "end": word.end,
                        }
                        for word in (segment.words or [])
                    ],
                }
                for segment in result.segments
            ],
        }

    def _resolve_result_language(self, segments: list[SegmentResult]) -> str:
        languages = sorted({segment.language for segment in segments if segment.language})
        if not languages:
            return "unknown"
        if len(languages) == 1:
            return languages[0]
        return f"mixed:{','.join(languages)}"

    def _write_wav_segment(self, source_path: Path, clip_path: Path, start_seconds: float, end_seconds: float) -> None:
        with wave.open(str(source_path), "rb") as source_wav:
            frame_rate = source_wav.getframerate()
            start_frame = max(0, int(start_seconds * frame_rate))
            end_frame = max(start_frame, int(end_seconds * frame_rate))

            source_wav.setpos(start_frame)
            frames = source_wav.readframes(end_frame - start_frame)

            with wave.open(str(clip_path), "wb") as clip_wav:
                clip_wav.setnchannels(source_wav.getnchannels())
                clip_wav.setsampwidth(source_wav.getsampwidth())
                clip_wav.setframerate(frame_rate)
                clip_wav.writeframes(frames)

    def _build_srt(self, segments: list[SegmentResult]) -> str:
        entries: list[str] = []
        for segment in segments:
            entries.append(
                "\n".join(
                    [
                        str(segment.id),
                        f"{self._format_srt_timestamp(segment.start)} --> {self._format_srt_timestamp(segment.end)}",
                        segment.text,
                    ]
                )
            )
        return "\n\n".join(entries).strip() + ("\n" if entries else "")

    def _extract_word_timestamps(self, raw_segment: Any, *, time_offset: float = 0.0) -> list[WordTimestamp]:
        raw_words = getattr(raw_segment, "words", None)

        if not self.config.word_timestamps:
            return []

        if raw_words is None:
            raise TranscriptionError(
                "Word timestamps were requested but the backend did not return word-level timings for a segment."
            )

        words: list[WordTimestamp] = []
        for raw_word in raw_words:
            raw_text = str(getattr(raw_word, "word", "")).strip()
            start = getattr(raw_word, "start", None)
            end = getattr(raw_word, "end", None)

            if not raw_text:
                continue

            if start is None or end is None:
                raise TranscriptionError(
                    f"Word timestamps were requested but are incomplete for word '{raw_text}'."
                )

            words.append(
                WordTimestamp(
                    word=raw_text,
                    start=round(float(start) + time_offset, 3),
                    end=round(float(end) + time_offset, 3),
                )
            )

        if not words and str(getattr(raw_segment, "text", "")).strip():
            raise TranscriptionError(
                "Word timestamps were requested but no word-level timings were returned for a non-empty segment."
            )

        return words

    def _join_segment_words(self, segments: list[SegmentResult]) -> list[WordTimestamp]:
        merged_words: list[WordTimestamp] = []
        for segment in segments:
            if segment.words:
                merged_words.extend(segment.words)
        return merged_words

    def _format_srt_timestamp(self, seconds: float) -> str:
        total_milliseconds = max(0, int(round(seconds * 1000)))
        hours, remainder = divmod(total_milliseconds, 3_600_000)
        minutes, remainder = divmod(remainder, 60_000)
        secs, milliseconds = divmod(remainder, 1_000)
        return f"{hours:02}:{minutes:02}:{secs:02},{milliseconds:03}"
