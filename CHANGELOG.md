# Changelog

## 1.3.0 - feature

- Reworked ORG FOLDERS logic.
- ORG FOLDERS now always creates and uses the root bin named ` SEKVENCE` and moves sequences there, including sequences found inside subfolders.
- ORG FOLDERS now organizes only root-level non-sequence files into the standard bins (`ASSETS`, `AUDIO`, `FOOTAGE`) and leaves files inside subfolders untouched.
- ORG FOLDERS still creates the same bin structure as before, including subbins under ` SEKVENCE`.
- The cleanup button `🪄` remains responsible for scanning empty bins recursively, including empty bins inside subfolders.
