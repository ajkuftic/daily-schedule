# Brainstorm: Quoting System to Confluence Product Sync

**Date:** 2026-02-16
**Status:** Complete

## What We're Building

A Python script that watches for product changes in an in-house quoting system (web app with REST API) and automatically updates related Confluence Cloud documents.

The system polls the quoting API on a schedule, detects changes by diffing against a local state file, finds Confluence pages that reference the changed product's SKU, and applies the appropriate update.

### Change Handling Rules

| Change Type | Action |
|---|---|
| Pricing (prices, rates, discounts) | Auto-update the relevant sections on the Confluence page |
| Product details (descriptions, specs, features) | Auto-update the relevant sections on the Confluence page |
| Availability/status (active, discontinued) | Flag the page for human review (comment or banner) |

### SKU-to-Page Mapping

- **Primary:** Each product record has a Description and Support Description field; one of these contains a direct Confluence link (e.g., `https://expedient-cloud.atlassian.net/wiki/x/3ABQB`). Check both fields.
- **Fallback:** Products without a link use CQL search for the SKU number, scoped to the IKB Confluence space
- **Missing:** Products with no link and no CQL results are logged to a `missing_skus.txt` file for manual review

## Why This Approach

**Chosen approach: Simple Polling Script with State File**

- Single Python script, minimal moving parts
- Polls quoting API, diffs against a local JSON state file
- Searches Confluence Cloud (CQL) for pages containing the changed SKU
- Runs locally for now (cron or manual), deployable later
- YAGNI — no queue, no database, no event system until proven necessary

**Rejected alternatives:**
- Event-driven with SQLite queue — more resilient but overkill for a local-first tool
- File-watch with manual trigger — fragile and adds unnecessary export step

## Key Decisions

- **Tech stack:** Python
- **Change detection:** Polling the quoting API + local JSON state file for diffing
- **Confluence discovery:** Direct link from product record (primary), CQL search in IKB space (fallback)
- **Confluence auth:** Cloud API with email + API token
- **Update strategy:** Auto-replace for pricing/details; flag/comment for status changes
- **Deployment:** Local machine initially, can move to cron/server/cloud later
- **Polling frequency:** Daily
- **Confluence page format:** Consistent template structure across pages
- **Notifications:** Confluence comments only (no Slack/email)

## Resolved Questions

1. **Quoting API specifics:** User will provide API docs during planning/implementation phase.
2. **Confluence page structure:** Pages follow a consistent template with predictable headings/tables — auto-updating will be reliable.
3. **Polling frequency:** Daily (once per day).
4. **Notification on flag:** Confluence comment only — no Slack or email notifications needed.
