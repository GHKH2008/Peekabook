# Multi-source book search flow

## Architecture

- `lib/book-search/types.ts`: normalized result contract + debug payload.
- `lib/book-search/providers/*`: one provider per source, all implementing `BookSearchProvider`.
- `lib/book-search/normalize.ts`: Hebrew-first normalization utilities (`normalizeHebrewText`, `tokenizeTitle`, `buildSearchVariants`).
- `lib/book-search/orchestrator.ts`: executes providers with per-provider timeout, tolerant partial failures, cache, merge + rank.
- `lib/book-search/merge.ts`: confidence-based duplicate merge using ISBN/title/author/cover/publisher/year/page-count signals.
- `lib/book-search/ranker.ts`: ranking with Hebrew and Israeli source boosts.

`lib/google-books.ts` now delegates search to the orchestrator and converts normalized results back to the existing `GoogleBook` app model.

## Provider enable/disable

- Google Books and Open Library are always enabled.
- HTML metadata providers (for non-public APIs) are disabled by default and can be enabled via env vars:
  - `BOOK_PROVIDER_STEIMATZKY_ENABLED=true`
  - `BOOK_PROVIDER_BOOKNET_ENABLED=true`
  - `BOOK_PROVIDER_INDIEBOOK_ENABLED=true`
  - `BOOK_PROVIDER_SIMANIA_ENABLED=true`

Additional controls:
- `BOOK_PROVIDER_TIMEOUT_MS=4500` (default timeout per provider request)
- `BOOK_SEARCH_DEBUG=true` (enables debug logs for provider responses, merge/rank details)

## Scraping safety notes

The Israeli/community adapters are implemented as isolated HTML metadata scrapers. Keep them disabled unless terms and robots policies explicitly allow your usage.

### TODOs for fragile/non-API sources

- Replace metadata-only scrape with robust structured extraction when allowed.
- Add robots.txt checks before issuing provider requests.
- Add fallback parser variants per provider layout changes.
- Add source-specific lookup-by-id endpoints when official APIs become available.
