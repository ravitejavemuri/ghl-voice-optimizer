"""Load and validate Voice AI optimizer mock fixtures.

Usage:
    PYTHONPATH=. python -m Assignments._ghl_voice_optimizer
    PYTHONPATH=. python -m Assignments._ghl_voice_optimizer --summary
    python scripts/validate_fixtures.py --summary
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_json(path: Path) -> dict | list:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_fixtures() -> dict:
    manifest = load_json(FIXTURES_DIR / "manifest.json")
    agent_config = load_json(FIXTURES_DIR / manifest["agentConfig"])
    transcripts = []
    for entry in manifest["transcripts"]:
        data = load_json(FIXTURES_DIR / entry["file"])
        transcripts.append(data)

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
    manifest = data["manifest"]
    transcripts = data["transcripts"]
    issue_counts = Counter()
    outcome_counts = Counter()

    for t in transcripts:
        outcome_counts[t["outcome"]] += 1
        for issue in t.get("expectedIssues", []):
            if issue != "none":
                issue_counts[issue] += 1

    print("Voice AI Optimizer — mock fixture summary")
    print("=" * 48)
    print(f"Agent: {data['agentConfig']['name']}")
    print(f"Transcripts: {len(transcripts)}")
    print(f"Golden examples: {len(data['golden'])}")
    print()
    print("Outcomes:")
    for outcome, count in sorted(outcome_counts.items()):
        print(f"  {outcome}: {count}")
    print()
    print("Expected issues (ground truth):")
    for issue, count in issue_counts.most_common():
        print(f"  {issue}: {count}")
    print()
    print("Golden pipeline artifacts:")
    for name in data["golden"]:
        print(f"  - {name}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Load Voice AI optimizer mock fixtures")
    parser.add_argument(
        "--summary",
        action="store_true",
        help="Print dataset summary instead of full JSON",
    )
    args = parser.parse_args()

    data = load_fixtures()

    if args.summary:
        print_summary(data)
        return

    print(json.dumps(data["manifest"], indent=2))


if __name__ == "__main__":
    main()
