from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


MIN_GPU_VRAM_MB = 6144


def write_payload(output_path: Path, payload: dict) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_gpu_info() -> tuple[str, int]:
    try:
        completed = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if completed.returncode != 0:
            return "", 0

        lines = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
        if not lines:
            return "", 0

        best_name = ""
        best_memory = 0
        for line in lines:
            parts = [part.strip() for part in line.split(",")]
            if len(parts) < 2:
                continue
            name = parts[0]
            try:
                memory_mb = int(float(parts[1]))
            except Exception:
                memory_mb = 0

            if memory_mb > best_memory:
                best_memory = memory_mb
                best_name = name

        return best_name, best_memory
    except Exception:
        return "", 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-path", required=True)
    args = parser.parse_args()

    output_path = Path(args.output_path)

    try:
        import ctranslate2
    except Exception as exc:
        write_payload(
            output_path,
            {
                "status": "done",
                "gpuCapable": False,
                "recommendedDevice": "cpu",
                "reason": f"GPU check failed: {exc}",
                "details": "",
                "vramMb": 0,
            },
        )
        return 0

    get_cuda_device_count = getattr(ctranslate2, "get_cuda_device_count", None)
    try:
        device_count = int(get_cuda_device_count()) if callable(get_cuda_device_count) else 0
    except Exception:
        device_count = 0

    if device_count <= 0:
        write_payload(
            output_path,
            {
                "status": "done",
                "gpuCapable": False,
                "recommendedDevice": "cpu",
                "reason": "GPU ni na voljo za WHISPR CUDA mode.",
                "details": "",
                "vramMb": 0,
            },
        )
        return 0

    gpu_name, vram_mb = read_gpu_info()
    if vram_mb and vram_mb < MIN_GPU_VRAM_MB:
        write_payload(
            output_path,
            {
                "status": "done",
                "gpuCapable": False,
                "recommendedDevice": "cpu",
                "reason": f"GPU premalo zmogljiv za current large-v3 mode ({round(vram_mb / 1024, 1)} GB VRAM).",
                "details": gpu_name,
                "vramMb": vram_mb,
            },
        )
        return 0

    details = gpu_name or f"CUDA devices: {device_count}"
    if vram_mb:
        details = f"{details} ({round(vram_mb / 1024, 1)} GB VRAM)"

    write_payload(
        output_path,
        {
            "status": "done",
            "gpuCapable": True,
            "recommendedDevice": "gpu",
            "reason": "",
            "details": details,
            "vramMb": vram_mb,
        },
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
