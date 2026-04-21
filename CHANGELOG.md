# Changelog

## 1.17.1 - fix

- Hardened installer Python bootstrap so step `[9/15]` no longer depends on the Microsoft Store winget source.
- Python install now uses `winget --source winget` first and falls back to a direct Python.org 3.11 installer if winget fails.

## 1.17.0 - feature

- Fixed In-Out caption placement by carrying the exported range start through transcription persistence and inserting imported captions at the original sequence In point instead of `00:00:00`.
- Added a Translation section to the Transcribe window with an Original/Translate toggle and target language dropdown; the current WHISPR backend supports translation to English.

## 1.16.7 - fix

- Removed ExtendScript-unsafe Array `.indexOf()` calls from transcript manifest sequence alias handling and replaced them with an ES3-safe helper.
- Re-normalized existing sequence manifest entries before alias updates so legacy manifest data cannot crash caption/transcript loading.

## 1.16.6 - fix

- Hardened transcript manifest alias normalization so legacy or malformed `sequenceIds` / `sequenceNames` values no longer crash with `.indexOf is not a function`.
- Made installer model preload rerun-safe: step `[14/15]` now checks for an existing `large-v3` cache or readiness marker before triggering the faster-whisper model download again.
- Updated extension, manifest, and release metadata to `1.16.6`.

## 1.16.4 - fix

- Removed the non-essential `install.bat` alias so the project now exposes only one installer entrypoint: `installer.bat`.

## 1.16.3 - fix

- Added rerun-safe Python dependency handling to `installer.bat`: the installer now skips pip work when the required transcription packages are already importable and retries the requirements install once before failing.
- This makes repeated installer runs more stable on machines where a previous partial install or file-lock situation would otherwise break the transcription environment bootstrap.

## 1.16.2 - fix

- Removed the fragile `:extract_zip` helper dependency from the main installer flow and inlined the critical ZIP validation/extraction steps so `installer.bat` no longer fails with `The system cannot find the batch label specified - extract_zip`.
- Fixed the ffmpeg bootstrap step by replacing the failing `robocopy` copy from the extracted ffmpeg build with a direct PowerShell `Copy-Item` into `%USERPROFILE%\aktual-premiere-tools\tools\ffmpeg\bin`.
- Re-tested the installer flow locally and confirmed it now progresses past plugin extraction and into the ffmpeg/bootstrap stages.

## 1.16.1 - fix

- Hardened `install.bat` download/extract flow by adding explicit ZIP validation and switching extraction to a direct .NET zip extraction path instead of relying on the previous `Expand-Archive` step that could fail with invalid file format errors.
- Added clearer installer validation for the public plugin release package so it now fails early if `TADEJ.SCRIPTS\server\whispr_runtime\main.py` is missing from the extracted release.
- Switched download logic to prefer `curl.exe` with redirect/fail handling and only fall back to `Invoke-WebRequest` if needed, reducing silent bad-download cases.
- Promoted `installer.bat` to the primary installer entrypoint and kept `install.bat` as a compatibility alias.

## 1.16.0 - feature

- Rebuilt the installer into a distribution-minded bootstrap flow centered on `%USERPROFILE%\aktual-premiere-tools`, with predictable subfolders for plugin files, runtime, models, tools, presets, config, downloads, and temp data.
- Added a new clean installer flow centered on `installer.bat`, with `install.bat` available as a compatibility alias.
- The installer now downloads the public plugin zip, `premiereCSXS.reg`, and the WAV transcription preset, installs the CEP extension, provisions the bundled WHISPR runtime, creates a local venv, installs Python dependencies, downloads portable ffmpeg, and preloads the `large-v3` model into the central install root.
- Updated the panel/JSX runtime paths so transcription now resolves its runtime from `%USERPROFILE%\aktual-premiere-tools\runtime\whispr` and prefers the centrally installed `wav-transcribe.epr` preset.
- Removed generated zip and Python cache leftovers from the repo so distribution artifacts and runtime bytecode do not bloat source control.

## 1.15.1 - fix

- Removed the last hardcoded `C:\Users\Produkcija\...` WHISPR Python path from the panel-side GPU probe flow so a fresh install can resolve the bundled runtime from the current user's `Documents\TADEJ\WHISPR` folder.
- Kept the JSX transcription bridge aligned with the same dynamic `Documents`-based runtime path so both install-time provisioning and runtime probing use the same portable location.

## 1.15.0 - feature

- Bundled the minimal WHISPR runtime source inside the extension package so transcription can be provisioned on a new machine.
- Rebuilt `installer.bat` into a full bootstrap installer that installs the CEP extension, copies the WHISPR runtime into `Documents`, creates the Python virtualenv, installs Python dependencies, checks ffmpeg, and preloads the `large-v3` model.
- Added packaging cleanup for Python cache folders so runtime leftovers do not leak into future releases.

## 1.14.0 - feature

- Rewrote the sequence-specific transcription persistence layer to use a project-local manifest-backed transcript store with deterministic sequence keys, latest-valid transcript resolution, atomic transcript writes, completed-job registration, legacy transcript migration, and per-sequence caption-style persistence.
- The panel now loads active-sequence transcript state through `loadSequencePersistence()` and registers finished jobs through `registerCompletedTranscription()` instead of the old panel-state sidecar flow.

## 1.13.2 - fix

- Removed all remaining transcription processing-window leftovers from the extension source, including the unused `lottie` script include and old transcription-status animation assets.
- Re-scanned the extension source afterward and confirmed there are no remaining references to the old transcribing/success processing window implementation.

## 1.13.0 - feature

- Replaced the old transcription loading screen with a new 2-window status overlay flow.
- Window 1 now shows the white `Dot_Loading_Icons_Pack_42` animation with `Transcribing` and a live status line while the job runs.
- After a real successful transcription, the loading window fades out and a separate success window fades in with `Uspešno`, `Square Check`, and `OK`.
- Clicking `OK` now fades out the whole success overlay cleanly, and failed jobs reset the overlay without showing success.

## 1.12.2 - fix

- Fixed the transcription feedback transition so the `Transcribing` window can actually fade out after processing finishes.
- The root cause was a modal-card CSS rule forcing all feedback cards to stay at full opacity, which overrode the loading card's `is-fading-out` state.
- Cleaned up stale overlay references in the modal render function to match the new two-window feedback flow.

## 1.12.1 - fix

- Split the transcription feedback into two separate modal windows: one for `Transcribing` and one for `Uspešno`.
- The UI now switches between those two windows with fade-out / fade-in instead of trying to morph one mixed overlay state into the other.

## 1.12.0 - feature

- Replaced the old transcription loading overlay with a new modal state-machine flow: `hidden -> loading -> loadingFadeOut -> successFadeIn -> successVisible -> closing`.
- The new modal now uses the white Dot Loading 41 animation while transcription runs, fades the loading state out on success, then fades in the Square Check success state with `Uspešno` and an `OK` button.
- Closing from the success state now fades out the whole modal cleanly instead of relying on the previous mixed class-toggling overlay logic.

## 1.11.3 - fix

- Fixed the transcription success overlay handoff so the Square Check animation, `uspe?no` text, and `OK` button are no longer kept hidden after the loading fade-out.

## 1.11.2 - fix

- Finished the overlay timing so the transcription window fades in, the loading state fades out on completion, then the Square Check, `uspešno`, and `OK` fade in, and clicking `OK` fades the whole overlay out.

## 1.11.1 - fix

- Polished the success overlay flow so the loading animation/text fade out first, then the Square Check, `uspešno`, and `OK` button fade in, and the overlay closes cleanly on `OK`.

## 1.11.0 - feature

- Reworked transcription persistence into a non-destructive flow that now writes both sequence-id and sequence-name sidecar aliases, so restore can survive sequence switching and project reopen more reliably.
- Added sequence-name fallback loading for the transcription JSON when creating captions, instead of depending only on the in-memory path from the current session.
- Simplified the post-transcription success state to a fade-out loading overlay followed by a `Square Check` confirmation with `Uspesno` and an `OK` button.
- Stored both `Square Check` and `Square Cross` Lottie assets locally in the extension for future status states.

## 1.10.1 - fix

- Removed the front-end caption blocker that still required `resultJsonPath` in memory and now lets caption creation use the sequence sidecar transcription JSON fallback after sequence switching.
- Switched the processing overlay to `Dot Loading 41` and rendered it in white for the dark transcription overlay.
- Replaced the completion alert popup with an in-panel success overlay animation, message, and `OK` button.

## 1.10.0 - feature

- Fixed sequence restore so a finished transcription keeps its JSON sidecar available when switching away to another sequence and then returning before rebuilding captions.
- Replaced the plain transcription overlay status with the local `Abstract Loading 22` Lottie animation during background transcription.
- Removed the `BOS` language option from the Transcribe UI.

## 1.9.0 - feature

- Made GPU the default processing mode when the local GPU capability probe confirms the machine is ready, while still falling back safely to CPU when CUDA or VRAM are insufficient.
- Removed the Track Style info block from Caption Maker and moved the lock message to an overlay directly on the `Create Captions` button.
- Extended `ORG FOLDERS` so root-level `.srt` files are moved into a `SUBTITLES` bin, created only when such files exist.

## 1.8.4 - fix

- Added a sequence-aware `CPU / GPU` processing toggle above `Transcribe` and wired it into the transcription job launch path.
- Added a local GPU capability probe that disables the GPU toggle and shows a warning when CUDA or VRAM are not sufficient for the current WHISPR workflow.
- Forced all panel toggles into left-aligned layout and kept the selected processing device stable while job state is polled in the background.

## 1.8.3 - fix

- Removed the non-working typography, color, and styling controls from Caption Maker and reduced the panel to the layout controls the current scripting workflow actually uses.
- Kept caption state sequence-aware and persistent, but simplified the stored caption settings to layout-only values.
- Added an explicit UI/backend note that Premiere's public scripting API does not expose loading a Properties > Track Style preset such as `RUMENA_TEST` from the panel.

## 1.8.2 - fix

- Fixed caption regeneration so layout changes like `1 line` and `1 word` are reflected in the next caption build.
- The caption workflow now refreshes an existing imported SRT when possible and falls back to a unique import-path build when Premiere would otherwise reuse stale cached subtitle media.
- Kept the Adobe-compatible limitation explicit: current caption scripting still does not expose direct full visual styling setters, so visual style values remain saved and restored but not directly applied to the created caption track.

## 1.8.1 - fix

- Styling system now updates immediate internal state on every relevant UI change and remains wired into caption creation.
- Source, language, style, and toggle state is sequence-specific and restored per active Premiere sequence.
- Added disk persistence next to the Premiere project in a predictable sequence-based sidecar folder/file naming scheme.
- On save, finished transcription JSON and SRT references are copied next to the project for stable restoration.
- Caption creation now also writes generated caption SRT and style JSON next to the project when possible.
- The `1 line / 2 lines` toggle is fully wired into caption block generation.
- Toggle switches were restyled to 20px height.
- Create Captions stays pinned in a fixed modal footer.
- Current Adobe-compatible limitation is explicit: ExtendScript caption workflow reliably supports create/import caption tracks plus layout and all-caps control, but not direct full visual caption styling application.

## 1.8.0 - feature

- Replaced the source selector with a visual toggle switch and made In-Out the default source.
- Added a 1-line / 2-line toggle for Caption Maker and wired it into caption block generation.
- Added a full caption styling state system with grouped UI controls, presets, persistent style state, and safe defaults.
- Caption creation now consumes a structured style object and applies supported layout/text-transform rules while storing unsupported visual styling values predictably for later extension.

## 1.7.0 - feature

- Switched Caption Maker from proportional segment-based caption timing to real per-word timestamps from Project A.
- Caption blocks now use the first and last word timing in each block, while `Words per line` still controls only line breaking and block splitting.

## 1.6.6 - fix

- Implemented `Words per line` as a real caption line-breaking feature for Caption Maker.
- Caption formatting now keeps transcription timing intact while splitting long segments into multiple caption blocks and breaking lines more naturally around punctuation when possible.

## 1.6.5 - fix

- Switched the CEP launch call from bare `cmd.exe` to the full `C:\\Windows\\System32\\cmd.exe` path, because the worker pipeline itself succeeds when run manually and the remaining blocker is process resolution inside CEP.

## 1.6.4 - fix

- Normalized CEP `file:///...` extension paths into real Windows filesystem paths before building the transcription worker command.
- Added the same path normalization on the JSX side so the bridge stays robust if CEP returns URI-style extension paths again.

## 1.6.3 - fix

- Switched CEP worker launch to `cmd.exe /c launch_worker.cmd` so the transcription worker starts more reliably on Windows/CEP than direct executable invocation.
- Added predictable `worker-stdout.log` and `worker-stderr.log` files in each WHISPR job folder for easier debugging.

## 1.6.2 - fix

- Removed the unsupported ExtendScript `system.callSystem` dependency from the transcription worker launch path.
- Moved background worker startup to the CEP panel runtime via `window.cep.process.createProcess`, while keeping export/state handling in JSX.

## 1.6.1 - fix

- Replaced the blocked popup-based TRANSCRIBE UI with an in-panel modal window so the workflow works reliably inside CEP.
- Preserved the same job-based background transcription flow and safe close behavior while removing the dependency on `window.open`.

## 1.6.0 - feature

- Reworked TRANSCRIBE into a job-based workflow with a dedicated transcription UI.
- Added source selection for In-Out vs Entire Timeline.
- Added language selection for SLO, CRO, SRB, and BOS, with BOS normalized to the practical CRO/HR bridge because Project A does not expose a direct `bs` mode.
- Added a detached Python worker bridge that calls WHISPR by CLI, writes job-state JSON on disk, and lets the popup window close safely while transcription continues.
- Added a Caption Maker section that stays disabled until transcription completes, then generates/imports an SRT and creates a subtitle caption track in the active sequence.

## 1.5.0 - feature

- Removed the `BIN` test button.
- Renamed the cleanup button to `CLEAN`.
- Added a `TRANSCRIBE` panel entry that currently ships as the placeholder message `comming soon` for public release.

## 1.4.1 - fix

- Reworked ORG, empty-bin cleanup, and test-bin deletion to traverse any project item with a `children` collection, making folder detection more robust across Premiere builds.

## 1.4.0 - feature

- Added a new test `BIN` button next to `🪄` that searches for bins named `bin` and tries to delete them directly.

## 1.3.2 - fix

- Fixed bin detection to use Premiere's string-based project item type (`\"BIN\"`) with enum fallback, so cleanup and recursive sequence scanning can actually see bins reliably.

## 1.3.1 - fix

- Backtracked the empty-bin cleanup issue.
- Root cause: cleanup only collected bins that were already empty on the first scan, so parent bins that became empty only after child-bin deletion were never removed.
- Fix: cleanup now runs in repeated passes until no more empty bins can be deleted.

## 1.3.0 - feature

- Reworked ORG FOLDERS logic.
- ORG FOLDERS now always creates and uses the root bin named ` SEKVENCE` and moves sequences there, including sequences found inside subfolders.
- ORG FOLDERS now organizes only root-level non-sequence files into the standard bins (`ASSETS`, `AUDIO`, `FOOTAGE`) and leaves files inside subfolders untouched.
- ORG FOLDERS still creates the same bin structure as before, including subbins under ` SEKVENCE`.
- The cleanup button `🪄` remains responsible for scanning empty bins recursively, including empty bins inside subfolders.
