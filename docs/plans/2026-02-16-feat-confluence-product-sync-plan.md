---
title: "feat: Confluence Product Sync from Quoting System"
type: feat
status: active
date: 2026-02-16
brainstorm: docs/brainstorms/2026-02-16-confluence-product-sync-brainstorm.md
---

# feat: Confluence Product Sync from Quoting System

## Overview

A Python CLI tool that polls an in-house quoting system API daily, detects product changes by diffing against a local state file, resolves each SKU's Confluence page via the direct link stored in the product record, and either auto-updates page content (pricing/details) or flags pages for human review (status changes).

## Problem Statement / Motivation

Product information lives in two places: the quoting system (source of truth) and Confluence (documentation consumed by teams). When products change — prices, specs, availability — the Confluence docs go stale. Today this is a manual process. Automating it ensures docs stay current without human effort for routine changes, while still flagging status changes that need human judgment.

## Proposed Solution

A single Python script with four stages:

1. **Poll** — Fetch all products from the quoting API
2. **Diff** — Compare against a local JSON state file to identify changes
3. **Resolve** — For each changed product, extract the Confluence page link from its Description or Support Description field (format: `https://expedient-cloud.atlassian.net/wiki/x/XXXXX`)
4. **Act** — Based on change type:
   - Pricing/details changes: parse the page's storage-format XHTML, update the relevant sections, write back
   - Status changes: add a footer comment flagging the page for review

```
┌─────────────┐     ┌───────────┐     ┌──────────────────┐     ┌──────────────┐
│ Quoting API │────▶│   Diff    │────▶│ Extract Page Link│────▶│ Update/Flag  │
│  (poll)     │     │ (state)   │     │ (from product)   │     │  (act)       │
└─────────────┘     └───────────┘     └──────────────────┘     └──────────────┘
```

**Primary: Direct links.** Each product record in the quoting system contains a direct link to its Confluence page in either the Description or Support Description field. This is the most reliable lookup method.

**Fallback: CQL search.** Products without a Confluence link fall back to CQL search for the SKU number. If no page is found by either method, the SKU is logged to a missing SKUs file for manual review.

## Technical Considerations

### Confluence Cloud API

- **Page link resolution**: Product records contain tiny links (e.g., `https://expedient-cloud.atlassian.net/wiki/x/3ABQB`). These contain a base64-encoded content ID. Resolve to a page ID by following the redirect or decoding the tiny link path
- **Page read/update** uses v2 API: `GET/PUT /wiki/api/v2/pages/{id}?body-format=storage`
- **Comments** use v2 API: `POST /wiki/api/v2/footer-comments`
- **Auth**: Basic auth with email + API token (base64 encoded)
- **Page updates are full-body replacements** — must read current content, modify the target section, then PUT the entire body back with `version.number` incremented by 1
- **Content format**: Storage format (XHTML) — parse with Python's `lxml` or `BeautifulSoup` to find and replace sections by heading/table structure
- **Rate limits**: Points-based system effective March 2, 2026. Add retry logic with exponential backoff for HTTP 429 responses
- **CQL search as fallback only** — primary page discovery is via direct links in product records; CQL search (`space = "IKB" AND text ~ "SKU-12345"`) is used only when no link is present, scoped to the IKB space
- **Missing SKUs** — products with no link and no CQL results are logged to a `missing_skus.txt` file for manual review

### Change Detection

- Use `deepdiff` library to compare current API response against saved state
- Categorize changes into pricing, details, and status based on which fields changed (field-to-category mapping defined in config)
- State file written atomically (write to temp file, then rename) to prevent corruption

### Page Section Updates

Since Confluence pages follow a consistent template:
- Parse storage-format XHTML to locate sections by heading text (e.g., "Pricing", "Specifications")
- Replace the content between the target heading and the next heading of equal or higher level
- Preserve surrounding content and formatting

## Acceptance Criteria

- [ ] Script polls the quoting API and retrieves all product data
- [ ] Changes are detected by diffing against a local JSON state file
- [ ] Confluence page links are extracted from product Description or Support Description fields
- [ ] Products without a Confluence link are silently skipped
- [ ] Tiny links (`/wiki/x/XXXXX`) are resolved to page IDs
- [ ] Pricing and detail changes auto-update the correct sections on Confluence pages
- [ ] Status/availability changes add a footer comment flagging the page for review
- [ ] SKUs without a Confluence link fall back to CQL search for the SKU number
- [ ] SKUs with no link and no CQL results are logged to a missing SKUs file for review
- [ ] State file is saved atomically after successful processing
- [ ] Credentials are loaded from `.env` file (never hardcoded)
- [ ] Script logs its activity (changes found, pages updated, errors) to stdout
- [ ] Script can be run manually or via cron
- [ ] HTTP 429 responses are retried with exponential backoff

## Dependencies & Risks

**Dependencies:**
- Quoting system API docs (user will provide)
- Confluence Cloud instance with API token access
- Python 3.10+

**Risks:**
- Confluence page structure variations — mitigated by consistent templates, but should log warnings if expected sections aren't found rather than failing
- Rate limiting — mitigated by daily polling (low volume) and retry logic
- Large number of SKUs without direct links — CQL fallback is one request per SKU; if many change at once, could hit rate limits. Mitigated by most SKUs having direct links

## Implementation Phases

### Phase 1: Project Scaffolding & Configuration

Set up the project structure and configuration loading.

```
confluence-product-sync/
├── src/
│   └── confluence_product_sync/
│       ├── __init__.py
│       ├── __main__.py          # CLI entry point
│       ├── config.py            # Load .env and config.yaml
│       ├── quoting_client.py    # Quoting API client
│       ├── confluence_client.py # Confluence API client
│       ├── differ.py            # Change detection with deepdiff
│       ├── updater.py           # Page content parsing and updating
│       ├── link_resolver.py     # Extract/resolve Confluence links from product records
│       └── state.py             # State file read/write (atomic)
├── tests/
│   ├── test_differ.py
│   ├── test_updater.py
│   └── test_state.py
├── config.yaml                  # Field-to-category mapping, section names
├── .env.example                 # Template for credentials
├── .env                         # Local secrets (gitignored)
├── pyproject.toml               # Dependencies and entry point
├── .gitignore
└── README.md
```

**`pyproject.toml` dependencies:**
- `requests` — HTTP client
- `deepdiff` — JSON diffing
- `beautifulsoup4` + `lxml` — XHTML parsing for Confluence storage format
- `python-dotenv` — Load `.env` files
- `pyyaml` — Config file parsing

**`config.yaml` structure:**
```yaml
quoting_api:
  base_url: "https://quoting.internal.example.com/api"
  products_endpoint: "/products"  # Will refine with actual API docs

confluence:
  base_url: "https://expedient-cloud.atlassian.net"
  fallback_space: "IKB"  # Space to search when no direct link exists

field_categories:
  pricing:
    - price
    - discount
    - rate
  details:
    - description
    - specs
    - features
  status:
    - availability
    - active
    - discontinued

section_headings:
  pricing: "Pricing"
  details: "Specifications"
```

**`.env.example`:**
```
CONFLUENCE_EMAIL=user@company.com
CONFLUENCE_API_TOKEN=your_token_here
QUOTING_API_KEY=your_key_here
```

- [ ] Create project directory and `pyproject.toml`
- [ ] Create `config.py` to load `.env` and `config.yaml`
- [ ] Create `.env.example` and `.gitignore`

### Phase 2: Quoting API Client & State Management

- [ ] Create `quoting_client.py` — fetch all products from API (endpoint TBD from API docs)
- [ ] Create `state.py` — read/write JSON state file with atomic writes
- [ ] Create `differ.py` — use `deepdiff` to compare current vs. previous state, categorize changes by field-to-category mapping from `config.yaml`

**`differ.py` output structure:**
```python
# Returns a list of changes grouped by SKU
[
    {
        "sku": "SKU-12345",
        "categories": {"pricing", "details"},  # set of change types
        "changes": { ... }  # deepdiff output for this product
    },
]
```

### Phase 3: Confluence Client & Page Updates

- [ ] Create `confluence_client.py`:
  - `resolve_tiny_link(url)` — resolve `/wiki/x/XXXXX` tiny link to a page ID (decode base64 or follow redirect)
  - `search_pages_by_sku(sku)` — CQL search scoped to IKB space: `space = "IKB" AND text ~ "SKU-12345"`, returns list of page IDs + titles
  - `get_page(page_id)` — fetch page with storage-format body and version number
  - `update_page(page_id, title, body, version)` — PUT with incremented version
  - `add_comment(page_id, message)` — POST footer comment
  - Retry logic with exponential backoff for 429s
- [ ] Create `link_resolver.py`:
  - `extract_confluence_link(product)` — check Description and Support Description fields for Confluence URLs
  - `resolve_page_id(product)` — try direct link first, fall back to CQL search by SKU in IKB space
  - Log unresolvable SKUs to `missing_skus.txt`
- [ ] Create `updater.py`:
  - Parse storage-format XHTML with BeautifulSoup
  - Locate sections by heading text from `config.yaml`
  - Replace section content with new data from quoting system
  - Return modified XHTML string

### Phase 4: Main Loop & CLI

- [ ] Create `__main__.py`:
  1. Load config and credentials
  2. Fetch products from quoting API
  3. Load previous state (or initialize if first run)
  4. Diff to find changes
  5. For each changed SKU:
     - Extract Confluence link from Description or Support Description field
     - If no link, fall back to CQL search for SKU number in IKB space
     - If still no page found, log SKU to `missing_skus.txt` and skip
     - For each page found:
       - If pricing/details changed: read page, update sections, write back
       - If status changed: add a comment flagging for review
  6. Save new state atomically
  7. Log summary (X products changed, Y pages updated, Z pages flagged)
- [ ] Add `--dry-run` flag to preview changes without writing to Confluence
- [ ] Add basic CLI argument parsing (argparse)

### Phase 5: Testing

- [ ] Unit tests for `differ.py` — verify change categorization
- [ ] Unit tests for `updater.py` — verify XHTML section replacement with sample storage-format content
- [ ] Unit tests for `state.py` — verify atomic write behavior
- [ ] Integration test with mocked API responses (use `responses` or `respx` library)

## Success Metrics

- Confluence pages with SKU references stay current with quoting system data within 24 hours
- Status changes are flagged with comments, ensuring human review
- Zero manual effort for routine pricing/detail updates

## References & Research

### Confluence Cloud API

- [CQL Search (v1)](https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/) — `GET /wiki/rest/api/search`
- [Pages (v2)](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/) — `GET/PUT /wiki/api/v2/pages/{id}`
- [Comments (v2)](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-comment/) — `POST /wiki/api/v2/footer-comments`
- [Basic Auth](https://developer.atlassian.com/cloud/confluence/basic-auth-for-rest-apis/)
- [Rate Limiting](https://developer.atlassian.com/cloud/confluence/rate-limiting/) — points-based, effective March 2, 2026
- [Storage Format](https://confluence.atlassian.com/doc/confluence-storage-format-790796544.html)

### Python Libraries

- [requests](https://docs.python-requests.org/) — HTTP client
- [deepdiff](https://pypi.org/project/deepdiff/) — JSON/object comparison
- [BeautifulSoup](https://www.crummy.com/software/BeautifulSoup/) — XHTML parsing
- [python-dotenv](https://pypi.org/project/python-dotenv/) — Environment variable loading

### Brainstorm

- [Brainstorm document](docs/brainstorms/2026-02-16-confluence-product-sync-brainstorm.md)
