#!/usr/bin/env python3
"""Apply platform schema to Supabase Postgres when DATABASE_URL is configured.

Usage:
  export DATABASE_URL='postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'
  python backend/scripts/run_platform_migrations.py

Get the connection string from Supabase Dashboard → Project Settings → Database.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL_FILES = [
    ROOT / "supabase" / "schema.sql",
    ROOT / "supabase" / "migration_platform.sql",
]


def main() -> int:
    url = os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL")
    if not url:
        print(
            "Set DATABASE_URL to your Supabase Postgres connection string.\n"
            "Until then, the backend uses local JSON storage in backend/.local_data/ for platform tables.",
            file=sys.stderr,
        )
        return 1

    try:
        import psycopg2
    except ImportError:
        print("Install psycopg2-binary: pip install psycopg2-binary", file=sys.stderr)
        return 1

    for sql_path in SQL_FILES:
        if not sql_path.exists():
            print(f"Missing {sql_path}", file=sys.stderr)
            return 1
        print(f"Running {sql_path.name}...")
        sql = sql_path.read_text()
        with psycopg2.connect(url) as conn:
            conn.autocommit = True
            with conn.cursor() as cur:
                cur.execute(sql)
        print(f"  OK")

    print("Migrations complete. Restart the backend to use Supabase tables instead of local storage.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
