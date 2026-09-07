# PRD-oriented discovery

Composes the complete RPI graph in order: `request`, `research_questions`, `research`, `prd`, and `tdd`. It validates `problemFolder`, compiles each workflow skill, preserves explicit owner handoffs, and gates all four artifacts.

Run with `bun adws/run.ts prd-oriented-discovery "request" --problem-folder .rpi/problems/request`.
