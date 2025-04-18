# Cube A2A for CrewAI

This repository contains a sample CrewAI project that illustrates how to call a **remote A2A agent** from a local CrewAI crew.  It showcases:

* A custom `SendTaskTool` that talks to a remote agent using the [A2A](https://github.com/google/A2A/) specification.
* A minimal **CrewAI** setup (one agent & one task) defined in YAML.
* A fully‑declarative `pyproject.toml` so you can install everything with **[uv](https://github.com/astral-sh/uv)** – a super‑fast Python package manager.

---

## 1. Prerequisites

| Requirement | Recommended version |
|-------------|---------------------|
| Python      | 3.10 – 3.12         |
| uv          | 0.1.36 or newer     |

Install `uv` (it is a single, static binary — no `sudo` required):

```bash
curl -Ls https://astral.sh/uv/install | bash
# or use Homebrew
brew install astral-sh/uv/uv
```

---

## 2. Clone & boot‑strap the project

```bash
# 1) Clone
git clone https://github.com/cubedevinc/d3_examples.git
cd d3_examples/a2a/crewai

# 2) Create a virtual environment to isolate project dependencies.
#    While `uv run` can operate in your current environment,
#    creating a dedicated venv is best practice.
python -m venv .venv
source .venv/bin/activate

# 3) Install all runtime dependencies using uv
uv pip install -e .
```

`uv pip` is a **drop‑in replacement** for `pip`, but it is typically 10–100× faster because it uses a built‑in resolver and a shared package cache.

> **Tip:** The `-e .` flag installs the project in *editable* (development) mode so that any changes you make to the source code are immediately reflected when you run it.

---

## 3. Running the crew

The entry‑point is exposed as the [**console‑script**] `run_crew` in `pyproject.toml`.

```bash
OPENAI_API_KEY="<your‑openai‑key>" \
A2A_SECRET="<your‑jwt‑secret>" \
A2A_AGENT_ADDRESS="https://ai-engineer.cubecloud.dev/api/a2a/..." \
uv run run_crew
```