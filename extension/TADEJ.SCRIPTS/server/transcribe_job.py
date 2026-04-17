from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_state(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_state(path: Path, payload: dict) -> None:
    payload["updatedAt"] = utc_now()
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_languages(raw_value: str) -> list[str]:
    values = []
    seen = set()

    for part in raw_value.split(","):
        code = part.strip().lower()
        if not code or code in seen:
            continue
        seen.add(code)
        values.append(code)

    if not values:
        values.append("sl")

    return values


def build_summary(result_json_path: Path) -> str:
    try:
        data = json.loads(result_json_path.read_text(encoding="utf-8"))
    except Exception:
        return "Transcription finished"

    language = data.get("language") or "unknown"
    segments = data.get("segments") or []
    return f"Language: {language} | Segments: {len(segments)}"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--state-path", required=True)
    parser.add_argument("--input-path", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--whispr-root", required=True)
    parser.add_argument("--main-script", required=True)
    parser.add_argument("--languages", default="sl")
    parser.add_argument("--processing-device", default="cpu")
    args = parser.parse_args()

    state_path = Path(args.state_path)
    input_path = Path(args.input_path)
    output_dir = Path(args.output_dir)
    whispr_root = Path(args.whispr_root)
    main_script = Path(args.main_script)
    log_path = state_path.parent / "transcribe.log"
    languages = normalize_languages(args.languages)
    processing_device = "gpu" if str(args.processing_device).lower() == "gpu" else "cpu"

    output_dir.mkdir(parents=True, exist_ok=True)
    state = read_state(state_path)
    state.update(
        {
            "status": "transcribing",
            "statusLabel": "Transcribing",
            "error": "",
            "audioPath": str(input_path),
            "outputDir": str(output_dir),
            "normalizedLanguages": languages,
            "processingDevice": processing_device,
            "startedAt": utc_now(),
        }
    )
    write_state(state_path, state)

    command = [
        sys.executable,
        str(main_script),
        str(input_path),
        "--model",
        "large-v3",
        "--beam-size",
        "10",
        "--post-process",
        "--output-dir",
        str(output_dir),
    ]

    if len(languages) == 1:
        command.extend(["--language", languages[0]])
    else:
        command.extend(["--languages", ",".join(languages)])

    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    if processing_device == "cpu":
        env["CUDA_VISIBLE_DEVICES"] = "-1"

    try:
        completed = subprocess.run(
            command,
            cwd=str(whispr_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
        log_path.write_text((completed.stdout or "") + "\n\n" + (completed.stderr or ""), encoding="utf-8")
    except Exception as exc:
        state.update(
            {
                "status": "failed",
                "statusLabel": "Failed",
                "error": f"Worker launch failed: {exc}",
                "finishedAt": utc_now(),
            }
        )
        write_state(state_path, state)
        return 1

    base_name = input_path.stem
    result_json_path = output_dir / f"{base_name}.json"
    result_srt_path = output_dir / f"{base_name}.srt"

    if completed.returncode != 0:
        error_text = (completed.stderr or completed.stdout or "").strip() or "Transcription process failed"
        state.update(
            {
                "status": "failed",
                "statusLabel": "Failed",
                "error": error_text,
                "finishedAt": utc_now(),
            }
        )
        write_state(state_path, state)
        return completed.returncode

    if not result_json_path.exists():
        state.update(
            {
                "status": "failed",
                "statusLabel": "Failed",
                "error": "Transcription finished but JSON output was not created",
                "finishedAt": utc_now(),
            }
        )
        write_state(state_path, state)
        return 1

    state.update(
        {
            "status": "completed",
            "statusLabel": "Completed",
            "resultJsonPath": str(result_json_path),
            "resultSrtPath": str(result_srt_path) if result_srt_path.exists() else "",
            "summary": build_summary(result_json_path),
            "processingDevice": processing_device,
            "error": "",
            "finishedAt": utc_now(),
        }
    )
    write_state(state_path, state)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
