#!/usr/bin/env python3
"""Post-init script for Python default template.

Renames my_mcp_server / my-mcp-server to the actual project name
derived from the target directory.

Environment variables (set by mcpize init):
- MCPIZE_PROJECT_DIR: Target project directory
- MCPIZE_PROJECT_NAME: Project name (basename of target dir)
"""

import os
import shutil
import subprocess
from pathlib import Path

TEMPLATE_HYPHEN = "my-mcp-server"
TEMPLATE_UNDERSCORE = "my_mcp_server"

project_dir = Path(os.environ.get("MCPIZE_PROJECT_DIR", "."))
project_name = os.environ.get("MCPIZE_PROJECT_NAME", TEMPLATE_HYPHEN)

# Derive underscore variant: my-cool-project -> my_cool_project
pkg_underscore = project_name.replace("-", "_")


def replace_in_file(file_path: Path, replacements: list[tuple[str, str]]) -> bool:
    """Replace strings in a file. Returns True if any changes were made."""
    if not file_path.exists():
        return False
    content = file_path.read_text()
    original = content
    for old, new in replacements:
        content = content.replace(old, new)
    if content != original:
        file_path.write_text(content)
        return True
    return False


def relock() -> None:
    """Refresh uv.lock after the rename so `uv sync --frozen` keeps working."""
    hint = f"run `uv lock` in {project_dir} before `uv sync --frozen` or `mcpize deploy`"
    uv = shutil.which("uv")
    if uv is None:
        print(f"  Warning: uv not found, uv.lock still has the old name; install uv and {hint}")
        return
    result = subprocess.run(
        [uv, "lock", "--quiet"], cwd=project_dir, capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"  Warning: `uv lock` failed: {result.stderr.strip()}")
        print(f"  To fix: {hint}")
        return
    print("  Updated uv.lock")


def main():
    if project_name == TEMPLATE_HYPHEN:
        return

    print(f"Renaming project: {TEMPLATE_HYPHEN} -> {project_name}")

    # Order matters: replace underscore variant first (longer match),
    # then hyphen variant
    replacements = [
        (TEMPLATE_UNDERSCORE, pkg_underscore),
        (TEMPLATE_HYPHEN, project_name),
    ]

    # 1. Rename source directory
    old_src = project_dir / "src" / TEMPLATE_UNDERSCORE
    new_src = project_dir / "src" / pkg_underscore
    if old_src.exists() and old_src != new_src:
        shutil.move(str(old_src), str(new_src))
        print(f"  Renamed src/{TEMPLATE_UNDERSCORE}/ -> src/{pkg_underscore}/")

    # 2. Update file contents
    files_to_update = [
        "pyproject.toml",
        "mcpize.yaml",
        "Dockerfile",
        "Makefile",
        f"src/{pkg_underscore}/__init__.py",
        f"src/{pkg_underscore}/server.py",
        "tests/test_tools.py",
        "tests/test_server.py",
        "README.md",
        "CLAUDE.md",
        ".cursor/rules",
    ]

    for rel_path in files_to_update:
        file_path = project_dir / rel_path
        if replace_in_file(file_path, replacements):
            print(f"  Updated {rel_path}")

    # 3. Regenerate lock file after pyproject.toml name change
    relock()

    print(f"Done! Project renamed to {project_name}")


if __name__ == "__main__":
    main()
