"""Guards the Clean Architecture dependency rule (see .specs/architecture.md).

If this test fails, a module imports something from a layer it must not
depend on. Move the code to the right layer instead of loosening the rule.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "src" / "twinjokers"

# layer -> import prefixes it must never use
FORBIDDEN: dict[str, tuple[str, ...]] = {
    "domain": (
        "pyxel",
        "random",
        "twinjokers.application",
        "twinjokers.infrastructure",
        "twinjokers.presentation",
    ),
    "application": (
        "pyxel",
        "random",
        "twinjokers.infrastructure",
        "twinjokers.presentation",
    ),
    "infrastructure": ("pyxel", "twinjokers.presentation"),
}


def _imports(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            names.append(node.module)
    return names


def _modules(layer: str) -> list[Path]:
    return sorted((PACKAGE_ROOT / layer).rglob("*.py"))


@pytest.mark.parametrize("layer", sorted(FORBIDDEN))
def test_layer_does_not_import_outer_layers(layer: str) -> None:
    violations = [
        f"{path.relative_to(PACKAGE_ROOT)} imports {name}"
        for path in _modules(layer)
        for name in _imports(path)
        if any(name == bad or name.startswith(bad + ".") for bad in FORBIDDEN[layer])
    ]
    assert not violations, "\n".join(violations)


def test_every_layer_has_modules() -> None:
    for layer in (*FORBIDDEN, "presentation"):
        assert _modules(layer), f"layer {layer} is empty"
