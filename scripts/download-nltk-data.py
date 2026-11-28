#!/usr/bin/env python3
"""Download the NLTK data the content scorers need into one folder.

Usage: python scripts/download-nltk-data.py <folder>

Shared by scripts/setup-python.sh (folder .local/nltk_data) and the Dockerfile (folder /opt/exora-nltk, at build time).
Exits 1 if any REQUIRED package could not be downloaded, so a broken download fails the build instead of the scorers
silently skipping dimensions later.
"""
import os
import sys

import nltk

# The scorers need these. A failure here is an error.
REQUIRED = ["punkt_tab", "cmudict", "stopwords", "vader_lexicon", "averaged_perceptron_tagger_eng"]
# Older names some scripts still look up. Nice to have; absence is not an error.
OPTIONAL = ["punkt", "averaged_perceptron_tagger"]


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    dest = os.path.abspath(sys.argv[1])
    os.makedirs(dest, exist_ok=True)
    nltk.data.path[:] = [dest]
    failed = [p for p in REQUIRED if not nltk.download(p, download_dir=dest, quiet=True)]
    for p in OPTIONAL:
        nltk.download(p, download_dir=dest, quiet=True)
    if failed:
        print("NLTK data download failed for: " + ", ".join(failed), file=sys.stderr)
        return 1
    print("NLTK data ready in " + dest + ": " + ", ".join(REQUIRED))
    return 0


if __name__ == "__main__":
    sys.exit(main())
