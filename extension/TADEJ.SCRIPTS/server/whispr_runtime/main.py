from __future__ import annotations

import argparse
import logging
import sys
import traceback
from pathlib import Path

from config import DEFAULT_BEAM_SIZE, DEFAULT_MODEL, DEFAULT_TASK, SupportedLanguage, TranscriptionConfig
from transcriber import ModelInitializationError, Transcriber, TranscriptionError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Local Windows transcription tool built with faster-whisper.",
    )
    parser.add_argument("input_path", help="Path to a local audio or video file.")
    parser.add_argument(
        "--language",
        choices=["sl", "hr", "sr", "auto"],
        default="auto",
        help="Language code. Use 'auto' to detect automatically.",
    )
    parser.add_argument(
        "--languages",
        type=parse_language_candidates,
        default=(),
        help="Comma-separated candidate languages for mixed-language audio, for example 'sl,hr,sr'.",
    )
    parser.add_argument(
        "--model",
        choices=["tiny", "base", "small", "medium", "large-v3"],
        default=DEFAULT_MODEL,
        help="Whisper model size to use.",
    )
    parser.add_argument(
        "--task",
        choices=["transcribe", "translate"],
        default=DEFAULT_TASK,
        help="Whether to transcribe in-source language or translate to English.",
    )
    parser.add_argument(
        "--word-timestamps",
        action="store_true",
        default=True,
        help="Enable word-level timestamp generation.",
    )
    parser.add_argument(
        "--no-word-timestamps",
        action="store_false",
        dest="word_timestamps",
        help="Disable word-level timestamp generation.",
    )
    parser.add_argument(
        "--vad-filter",
        action="store_true",
        help="Enable voice activity detection filtering.",
    )
    parser.add_argument(
        "--beam-size",
        type=positive_int,
        default=DEFAULT_BEAM_SIZE,
        help="Beam search width. Higher values can improve accuracy but are slower.",
    )
    parser.add_argument(
        "--post-process",
        action="store_true",
        help="Apply lightweight offline cleanup to the transcript text after transcription.",
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Directory for .txt, .srt, and .json outputs. Defaults to the input file directory.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Show debug logs and full stack traces on failure.",
    )
    return parser


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("Value must be greater than 0.")
    return parsed


def parse_language_candidates(value: str) -> tuple[SupportedLanguage, ...]:
    allowed = {"sl", "hr", "sr"}
    parsed = [item.strip().lower() for item in value.split(",") if item.strip()]
    if not parsed:
        raise argparse.ArgumentTypeError("Provide at least one language code, for example 'sl,hr'.")

    invalid = [item for item in parsed if item not in allowed]
    if invalid:
        raise argparse.ArgumentTypeError(
            f"Unsupported language code(s): {', '.join(invalid)}. Allowed values: sl, hr, sr."
        )

    deduplicated: list[SupportedLanguage] = []
    for item in parsed:
        if item not in deduplicated:
            deduplicated.append(item)  # type: ignore[arg-type]
    return tuple(deduplicated)


def configure_logging(debug: bool) -> None:
    level = logging.DEBUG if debug else logging.INFO
    logging.basicConfig(level=level, format="%(levelname)s: %(message)s")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def parse_args() -> argparse.Namespace:
    return build_parser().parse_args()


def main() -> int:
    args = parse_args()
    configure_logging(args.debug)

    input_path = Path(args.input_path).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve() if args.output_dir else input_path.parent
    selected_language = args.language
    if len(args.languages) == 1:
        selected_language = args.languages[0]

    config = TranscriptionConfig(
        input_path=input_path,
        output_dir=output_dir,
        language=selected_language,
        language_candidates=args.languages,
        model=args.model,
        task=args.task,
        word_timestamps=args.word_timestamps,
        vad_filter=args.vad_filter,
        beam_size=args.beam_size,
        post_process=args.post_process,
        debug=args.debug,
    )

    try:
        transcriber = Transcriber(config)
        result = transcriber.transcribe()
        output_paths = transcriber.save_outputs(result)
    except (TranscriptionError, ModelInitializationError) as exc:
        return handle_error(exc, debug=args.debug)
    except Exception as exc:
        return handle_error(exc, debug=args.debug, unexpected=True)

    runtime = transcriber.runtime_settings
    print(f"Device: {runtime.device} ({runtime.compute_type})")
    if runtime.used_fallback:
        print("GPU initialization failed. The run continued on CPU.")
    print(f"Detected language: {result.language}")
    print(f"Transcript saved to: {output_paths['txt']}")
    print(f"SRT saved to: {output_paths['srt']}")
    print(f"JSON saved to: {output_paths['json']}")
    print("\nTranscript:\n")
    print(result.text)

    return 0


def handle_error(exc: Exception, *, debug: bool, unexpected: bool = False) -> int:
    message_prefix = "Unexpected error" if unexpected else "Error"
    if debug:
        traceback.print_exc()
    else:
        print(f"{message_prefix}: {exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
