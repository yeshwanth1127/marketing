#!/usr/bin/env bash
# One-time: Python environment for skill scripts (pinned versions from the vendor repos).
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
"$PY" -m venv .local/pyenv
.local/pyenv/bin/pip install -q --upgrade pip
# DMP lite set (pins from core/tools/vendor-scripts/digital-marketing-pro/scripts/requirements.txt) + brand extraction deps
.local/pyenv/bin/pip install -q nltk==3.10.3 textstat==0.7.13 pillow==12.3.0 pypdf
mkdir -p .local/nltk_data
.local/pyenv/bin/python -c "import nltk;[nltk.download(p,download_dir='.local/nltk_data',quiet=True) for p in ['punkt_tab','stopwords','averaged_perceptron_tagger','averaged_perceptron_tagger_eng','vader_lexicon']]"
echo "Python environment ready: .local/pyenv (NLTK data in .local/nltk_data)"
