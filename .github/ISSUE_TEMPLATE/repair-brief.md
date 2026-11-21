---
name: Repair brief
about: An automated failure, filed so a worker can fix it from this issue alone
title: "Repair brief: <stable key>"
labels: ["mode:afk", "type:bug"]
---

<!--
Automated jobs file this through scripts/repair-brief/repair-brief.mjs, which fills the
sections below and deduplicates on the title. Fill them the same way by hand.
The title key is stable: no run id, timestamp or moving version in it.
Leave the wave to the orchestrator's wave check; do not add a wave label.
-->

A check failed. This issue is the brief a worker picks up; it holds everything needed.

## Run

<!-- Link to the failing run. -->

## What changed

<!-- What moved upstream, or in this repo, since the last green run. -->

## Failing check

<!-- Which check failed, and at which step. -->

## Output

<!-- The failing output, fenced. Keep the end of the log: the failing line is at the bottom. -->

## Repro

<!-- Exact commands, one per line, from a fresh checkout. -->
