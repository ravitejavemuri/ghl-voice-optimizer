#!/usr/bin/env python3
"""Load and validate Voice AI optimizer mock fixtures.

Usage (from project root):
    python scripts/validate_fixtures.py
    python scripts/validate_fixtures.py --summary
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURES_DIR = ROOT / "fixtures"


def load_json(path: Path) -> dict | list:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_fixtures() -> dict:
    manifest = load_json(FIXTURES_DIR / "manifest.json")
    agent_config = load_json(FIXTURES_DIR / manifest["agentConfig"])
    transcripts = [load_json(FIXTURES_DIR / entry["file"]) for entry in manifest["transcripts"]]
    golden = {
        key: load_json(FIXTURES_DIR / rel_path)
        for key, rel_path in manifest["goldenExamples"].items()
    }
    return {
        "manifest": manifest,
        "agentConfig": agent_config,
        "transcripts": transcripts,
        "golden": golden,
    }


def print_summary(data: dict) -> None:
    transcripts = data["transcripts"]
    issue_counts = Counter()
    outcome_counts = Counter()

    for transcript in transcripts:
        outcome_counts[transcript["outcome"]] += 1
        for issue in transcript.get("expectedIssues", []):
            if issue != "none":
                issue_counts[issue] += 1

    print("Voice AI Optimizer — fixture summary")
    print("=" * 40)
    print(f"Agent: {data['agentConfig']['name']}")
    print(f"Transcripts: {len(transcripts)}")
    print(f"Golden examples: {len(data['golden'])}")
    print()
    print("Outcomes:")
    for outcome, count in sorted(outcome_counts.items()):
        print(f"  {outcome}: {count}")
    print()
    print("Expected issues:")
    for issue, count in issue_counts.most_common():
        print(f"  {issue}: {count}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate Voice AI optimizer fixtures")
    parser.add_argument("--summary", action="store_true", help="Print dataset summary")
    args = parser.parse_args()

    data = load_fixtures()
    if args.summary:
        print_summary(data)
        return

    print(json.dumps(data["manifest"], indent=2))


if __name__ == "__main__":
    main()
