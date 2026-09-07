# Research

Runs the RPI research graph through the canonical Factory: `request`, `research_questions`, and `research`.

The controller requires `problemFolder`, compiles the two workflow skills from the operator repository, hands the questions artifact into research, and gates both declared artifacts. Agent ownership is explicit (`research_questions` then `research`).

Run with `bun adws/run.ts research "question" --problem-folder .rpi/problems/question`.
