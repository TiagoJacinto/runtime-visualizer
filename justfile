# SSSF starter recipes. Stamped by install.ts, then yours to edit.
#
# Deliberately small. These are the handful you need on day one: run something,
# watch it, and open the trace. Add your own as your chains grow, and see the
# example branch for the fuller set (orchestrator agents, kill, rosters, ipi).

# `.env` reaches every ADW through this, so keys work without exporting them.
set dotenv-load
set positional-arguments

# Every recipe passes this through, so `SSSF_CONFIG=other.yaml just sdlc "..."`
# swaps the whole roster for one run.
config := env_var_or_default("SSSF_CONFIG", "adws/adw_sssf_config/sssf.config.yaml")
db     := "adws/adw_data/sssf.db"

# list every recipe
default:
    @just --list

# ── first run ───────────────────────────────────────────────────────────────

# Proves the whole path works: config validated, session minted, agent ran,
# envelope parsed, gates checked, trace written. Costs a few cents and changes
# nothing in your repo, because both workflows are read-only.
#
# (`just --list` shows only the LAST comment line, so that one is the summary.)

# start here: two cheap read-only runs, end to end
demo:
    @echo "1/2  adw_prompt: one agent, one prompt"
    bun adws/run.ts prompt --config {{config}} --agent scout "reply with a one-line summary of this repo"
    @echo "\n2/2  adw_scout: read-only recon"
    bun adws/run.ts scout --config {{config}} "list the top-level directories in this repo and what each is for. change nothing."
    @echo "\nboth done. now run:  just sessions    (or: just obs)"

# ── run a workflow ──────────────────────────────────────────────────────────
# Args pass straight through: "<prompt or path/to/prompt.md>" [--adw-id X] [--problem-folder .rpi/problems/<slug>]
# Composition examples are documented in the factory repository and are not
# stamped into target repositories.

# one agent, one prompt: just prompt "summarize this repo"
prompt *ARGS:
    bun adws/run.ts prompt --config {{config}} "$@"

# read-only recon: just scout "where is auth handled"
scout *ARGS:
    bun adws/run.ts scout --config {{config}} "$@"

# research questions then codebase research (requires --problem-folder)
research *ARGS:
    bun adws/run.ts research --config {{config}} "$@"

# plan only: just plan "add a /health endpoint"
plan *ARGS:
    bun adws/run.ts plan --config {{config}} "$@"

# ── watch it ────────────────────────────────────────────────────────────────
# Reads never block a running workflow, the db is WAL. Poll as hard as you like.

# the last 10 runs (canonical Factory traces are persisted by the runtime)
sessions:
    @true

# phase status in sequence: just phases <adw_id>
phases ADW_ID:
    @command -v sqlite3 >/dev/null 2>&1 || { echo 'Error: sqlite3 is required for phase monitoring. Install it with: sudo apt update && sudo apt install sqlite3' >&2; exit 127; }
    @sqlite3 {{db}} "select seq, name, kind, owner, status, attempt from phases where adw_id='{{ADW_ID}}' order by seq;"

# the live event tail: just tail <adw_id>
tail ADW_ID:
    @command -v sqlite3 >/dev/null 2>&1 || { echo 'Error: sqlite3 is required for event monitoring. Install it with: sudo apt update && sudo apt install sqlite3' >&2; exit 127; }
    @sqlite3 {{db}} "select rowid, type, name, started_at from events where adw_id='{{ADW_ID}}' order by rowid desc limit 25;"

# what a run has alive right now, with pids: just procs <adw_id>
procs ADW_ID:
    @command -v sqlite3 >/dev/null 2>&1 || { echo 'Error: sqlite3 is required for process monitoring. Install it with: sudo apt update && sudo apt install sqlite3' >&2; exit 127; }
    @sqlite3 {{db}} "select kind, name, pid, command, started_at from processes where adw_id='{{ADW_ID}}' and ended_at is null order by id;"

# ── observability UI ────────────────────────────────────────────────────────

# Needs bun. The db path is passed explicitly because the server runs from the
# app dir and would otherwise look for a trace db sitting next to itself.

# boot the trace UI, http://localhost:4601 (api on :4600)
obs:
    cd .pi/skills/sssf/apps/visualizer && bun install && (SSSF_DB={{justfile_directory()}}/{{db}} bun run server/index.ts &) && bunx vite

# expose the trace UI to other devices on the local network
obs-host:
    cd .pi/skills/sssf/apps/visualizer && bun install && (SSSF_DB={{justfile_directory()}}/{{db}} bun run server/index.ts &) && bunx vite --host 0.0.0.0
