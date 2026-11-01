#!/usr/bin/env bash
# One-time: Python environment for skill scripts (pinned versions from the vendor repos). Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."
# mediapipe (talking-head effects) has wheels up to Python 3.12, so prefer 3.12/3.11.
PY="${PYTHON:-}"
if [ -z "$PY" ]; then for v in python3.12 python3.11 python3.13 python3.10 python3; do if command -v "$v" >/dev/null 2>&1; then PY="$v"; break; fi; done; fi
echo "Using $PY ($("$PY" --version))"
[ -x .local/pyenv/bin/python ] || "$PY" -m venv .local/pyenv
P=.local/pyenv/bin/python
"$P" -m pip install -q --upgrade pip
# Batch 0-1: DMP lite set (pins from DMP requirements.txt) + brand extraction deps
"$P" -m pip install -q nltk==3.10.3 textstat==0.7.13 pillow==12.3.0 pypdf
mkdir -p .local/nltk_data
"$P" -c "import nltk;[nltk.download(p,download_dir='.local/nltk_data',quiet=True) for p in ['punkt_tab','punkt','cmudict','stopwords','averaged_perceptron_tagger','averaged_perceptron_tagger_eng','vader_lexicon']]"
echo "OK batch 0-1 (DMP scorers)"
# Batch 2: real-sound + earshot (sound design and listening checks)
if "$P" -m pip install -q numpy scipy soundfile soxr librosa pyloudnorm scikit-learn matplotlib; then echo "OK batch 2 audio (real-sound)"; else echo "FAILED batch 2 audio"; fi
if "$P" -m pip install -q torch --index-url https://download.pytorch.org/whl/cpu && "$P" -m pip install -q transformers && "$P" -m pip install -q --no-deps ./vendor/earshot; then echo "OK batch 2 earshot (listening checks)"; else echo "FAILED batch 2 earshot"; fi
# Batch 2: talking-head effects (face tracking)
if "$P" -m pip install -q opencv-python mediapipe; then echo "OK batch 2 effects (mediapipe)"; else echo "FAILED batch 2 effects: mediapipe needs Python 3.10-3.12 (brew install python@3.12, then delete .local/pyenv and re-run)"; fi
echo "Python environment ready: .local/pyenv (NLTK data in .local/nltk_data)"
