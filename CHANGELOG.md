# Changelog

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
