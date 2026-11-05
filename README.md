# Facebook Group, Page & Profile Posts Scraper with Comments

[![Source on GitHub](https://img.shields.io/badge/source-GitHub-24292f)](https://github.com/spbotdel/facebook-group-posts-comments-scraper)

**Collect public Facebook group, page, and personal profile posts with their public comments and replies in one run, without cookies or login.**

This Actor returns structured post rows with optional nested comments, or separate post and comment rows. It is built for community analysis, brand and competitor monitoring, lead research, social listening, AI datasets, and scheduled incremental pipelines.

The output includes post text, author, timestamp, engagement, media metadata, stable URLs, comments, replies, parent-child thread relationships, and per-post public coverage diagnostics. Data is available through the Apify API, MCP, schedules, webhooks, JSON, CSV, and Excel.

## Supported surfaces

| Surface | Input | Notes |
|---|---|---|
| Public group | `/groups/<id>/` | Group sorting, date boundaries, cursor continuation, known-post monitoring, and comments. |
| Public page | `facebook.com/<page>/` with `userData.surfaceType: "page"` | Newest-first public page feed plus comments. Date range is enforced locally after collection. |
| Public personal profile | `facebook.com/<username>` with `userData.surfaceType: "profile"` | Newest-first public profile feed plus comments. Private and friends-only content is not accessed. |

Group URLs and `/people/.../<id>` profile URLs are auto-detected. Use `userData.surfaceType` for ambiguous vanity handles.

## Use cases

- Community research and group activity monitoring.
- Brand, competitor, product, and campaign social listening.
- Lead discovery from publicly available posts and comment threads. Contact fields are not guaranteed and depend on what users publish.
- Scheduled monitoring of only new comments.
- Structured datasets for AI, RAG, analytics, and agent workflows.

## How it works

The Actor accepts groups, pages, and public personal profiles, collects the requested feed window, and optionally enriches matching posts with public comments and replies. Results are returned in one dataset, either as nested post rows or as separate post and comment rows. All feed and comment engines run in-process inside this single Apify run, so there are no child-Actor charges. Platform compute and proxy usage are included in the developer-paid event price, not passed through as a separate user charge.

## Example input

```json
{
  "startUrls": [
    {
      "url": "https://www.facebook.com/groups/2333220550043074/"
    },
    {
      "url": "https://www.facebook.com/humansofnewyork/",
      "userData": {
        "surfaceType": "page"
      }
    },
    {
      "url": "https://www.facebook.com/zuck",
      "userData": {
        "surfaceType": "profile"
      }
    }
  ],
  "maxPostsPerGroup": 10,
  "commentsMode": "full",
  "maxCommentsPerPost": 20,
  "includeReplies": true,
  "commentsConcurrency": 5,
  "commentsOutput": "nested",
  "proxyTier": "auto"
}
```

## Input

| Field | Type | Default | Description |
|---|---|---:|---|
| `startUrls` | array | required | Facebook group, page, or profile objects. Use `userData.surfaceType` when auto-detection is ambiguous. |
| `maxPostsPerGroup` | integer | 30 | Posts collected from each group, page, or profile before comments. A run charge limit can reduce this value. |
| `sortMode` | enum | `CHRONOLOGICAL` | Group-only sorting: `CHRONOLOGICAL`, `RECENT_ACTIVITY`, `TOP_POSTS`, or `CHRONOLOGICAL_LISTINGS`. Pages and profiles are newest-first. |
| `onlyPostsNewerThan` | string | off | Inclusive lower date boundary. Supports ISO dates and relative values such as `30 days`, `12 hours`, or `2 weeks`. |
| `onlyPostsOlderThan` | string | off | Exclusive upper date boundary for group feeds and a local post-collection filter for page/profile feeds. |
| `knownPostIds` | array | off | Post IDs already delivered. Chronological group and newest-first page/profile feeds can stop at a known post. |
| `search` | string | off | Case-insensitive post text filter before comments are collected. |
| `searchMode` | enum | `LOCAL` | `LOCAL` filters the current feed snapshot. `HISTORY_SCAN` walks backward through public history up to `searchMaxPostsPerSurface`. |
| `searchMaxPostsPerSurface` | integer | 300 | Maximum history depth per group, page, or profile in `HISTORY_SCAN` mode. |
| `maxSearchResults` | integer | 100 | Maximum matching posts returned by `HISTORY_SCAN`. |
| `minComments` | integer | 0 | Keep posts with at least this many feed-reported comments. Unknown engagement is kept. |
| `minReactions` | integer | 0 | Keep posts with at least this many feed-reported reactions. Unknown engagement is kept. |
| `filterAuthor` | string | off | Case-insensitive substring match on public post author name or URL. |
| `startCursor` | string | off | Cursor from a previous `SUMMARY` for older-history continuation. Supported for exactly one URL. |
| `commentsMode` | enum | `full` | `none`, `inline` (up to 3 comments per post), or `full`. |
| `maxCommentsPerPost` | integer | 50 | Maximum comment and reply rows per post in full mode. |
| `includeReplies` | boolean | true | Expand public reply threads. |
| `maxReplyThreadsPerPost` | integer | 20 | Maximum reply-bearing top-level comments to expand per post. |
| `maxRepliesPerPost` | integer | 100 | Reply row cap per post. |
| `commentsConcurrency` | integer | 5 | Posts processed in parallel by the comment engine. |
| `commentsSortOrder` | enum | `MOST_RELEVANT` | `MOST_RELEVANT`, `NEWEST`, or `ALL_COMMENTS`. |
| `unionSorts` | boolean | true | Walk multiple comment sort windows to improve public coverage. Set false for strict newest-first monitoring. |
| `onlyCommentsNewerThan` | string | off | Keep comments newer than an absolute date or relative value such as `30 days` or `12 hours`. |
| `commentTextSearch` | string | off | Case-insensitive local filter over returned comment and reply text. |
| `minCommentReactions` | integer | 0 | Keep comments and replies with at least this many reactions. |
| `includePostTextInCommentRows` | boolean | false | Include `post_text` in each comment row, including separate output mode. |
| `commentsOutput` | enum | `nested` | Keep comments inside each post row, or emit post and comment rows separately. |
| `proxyTier` | enum | `auto` | `auto`, `datacenter`, or `residential` proxy behavior used during collection. |
| `proxyCountry` | string | `US` | Two-letter residential proxy country for page/profile feeds. |
| `dedupeStoreName` | string | off | Stable logical store name used to return only new comment IDs across scheduled runs. It is namespaced per Apify user internally. |
| `failOnEmpty` | boolean | false | Fail when no posts or output rows are produced. |

Before collection starts, the Actor checks the user's `maxTotalChargeUsd` against the configured post and comment prices. If the cap is too low for the requested volume, it reduces the number of processed surfaces, posts, or comments before expensive collection begins, reserving a fair share of the available budget for comments when enrichment is enabled. If no user cap is supplied, no artificial low default is applied. The applied plan and skipped surface count are reported in `SUMMARY.budget`.

## Output

With `commentsOutput: "nested"`, one row is returned per post:

| Field | Description |
|---|---|
| `surface_type` | `group`, `page`, or `profile`, based on the input. |
| `source_post_id`, `source_url` | Stable post identifier and link. |
| `group_id`, `group_url`, `group_name` | Source group when applicable. |
| `source_profile_id`, `source_profile_url`, `source_profile_name` | Source page or profile when applicable. |
| `created_at`, `creation_time` | Publish time. |
| `raw_text` | Post text. |
| `author` | Public author metadata. |
| `stats` | Reactions, comments, and shares as exposed by the feed. |
| `media` | Public media URLs and metadata. |
| `comments` | Public comment and reply rows. |
| `comments_collected` | Number of public comment rows collected. |
| `comments_collected_before_filters` | Comment rows delivered by the engine before local comment filters. |
| `comments_announced` | Facebook announced count when exposed. |
| `comments_coverage_percent` | Collected public rows divided by announced count. |
| `comments_blocked` | Login, Reel, or public-access block marker when present. |

With `commentsOutput: "separate"`, post and comment rows are emitted separately with `record_type` set to `post` or `comment`.

The `SUMMARY` Key-Value Store record contains feed cursors and checkpoints, per-surface row counts, comment coverage, budget-plan details, and `commentsSkippedKnown` for monitoring. Dedupe stores are namespaced per Apify user, so scheduled monitors cannot collide across customers.

## Monitoring and deduplication

For scheduled comment monitoring:

1. Keep `dedupeStoreName` stable across runs.
2. Set `commentsSortOrder` to `NEWEST`.
3. Set `unionSorts` to false.
4. Optionally set `failOnEmpty` to make broken schedules visible.

The comment engine stores seen comment IDs in the named logical Key-Value Store. A repeated run returns only new public comments and reports `newComments: 0` plus `commentsSkippedKnown`.

## Competitive positioning

The adjacent posts-and-comments market charges roughly `$1-10 per 1,000 dataset items`, but the unit differs: some competitors charge per post, some include only top comments, and some route full comments to a separate Actor. Our pricing separates posts and comments explicitly. Most competitors either require cookies for depth, omit comments entirely, or charge comment enrichment as a separate premium. This Actor's differentiators are:

- groups, pages, and personal profiles in one input model;
- no cookies or login;
- full comment cursor traversal with reply expansion;
- explicit coverage diagnostics instead of pretending a logged-out thread is complete;
- nested and separate output;
- cross-run comment deduplication;
- history scan, engagement filters, author filters, comment text filters, and cursor continuation;
- one user-facing price for the combined workflow;
- API, MCP, schedule, and webhook friendly schemas.

Marketplace enrichment is intentionally excluded and remains a separate product.

## FAQ

### Do I need a Facebook login or cookies?
No. The Actor reads only public content visible to signed-out visitors. It never asks for cookies, passwords, or sessions, and it cannot access private, friends-only, or login-gated groups, pages, and profiles.

### Can I scrape groups, pages, and profiles in one run?
Yes. Put public group, page, and profile URLs together in startUrls. Group and /people/ profile URLs are auto-detected; for ambiguous vanity handles set userData.surfaceType to page or profile.

### How much does it cost to scrape posts and comments?
On paid Apify plans you pay $3 per 1000 posts and $1 per 1000 comments, plus a $0.005 start fee. On the FREE plan the post and comment event prices are doubled to $6 per 1000 posts and $2 per 1000 comments; the $0.005 start fee is the same on all plans. Posts scanned are billed even if they have no new comments, so narrow date and post limits for monitoring.

### How do I monitor a page or group for only new comments?
Keep the same dedupeStoreName across scheduled runs, with commentsSortOrder NEWEST and unionSorts false. Each run returns only new public comments and replies. Scanned posts are still billed even when no new comments appear.

### Can I backfill an older date range?
Yes for public groups. Combine onlyPostsNewerThan with onlyPostsOlderThan to bound the window, and continue with startCursor taken from SUMMARY.groupFeed.nextCursor. Page and profile feeds are newest-first, so older backfills are limited by maxPostsPerGroup.

### Why does Facebook show more comments than the Actor returns?
Facebook's counter includes hidden, filtered, private, and login-only replies that signed-out visitors cannot open. The Actor reports what was actually accessible instead of guessing.

### How do I check coverage after a run?
Open the SUMMARY record in the run key-value store. It shows posts scanned, comments announced versus collected, and comments_coverage_percent per surface, so you can compare expected and collected counts.

### Can I collect posts without comments?
Yes. Set commentsMode to none. You are billed for posts plus the $0.005 start fee and no comment events, which is best for feed snapshots, content audits, and low-cost monitoring.

### How does historical keyword search work without login?
Facebook search requires login, so searchMode HISTORY_SCAN walks backward through the public feed up to searchMaxPostsPerSurface and returns up to maxSearchResults matches. It is a bounded feed scan, not full Facebook search.

### How do AI agents call this Actor over MCP?
Agents discover the Actor, start it with the call-actor tool with input and callOptions, wait for completion, then read rows and the SUMMARY record with the get-dataset-items tool. The AI agents and MCP section defines the compact input and output contract.

### Should I use nested or separate comments output?
Use commentsOutput nested for AI and RAG pipelines where comments stay with their post. Use separate for CSV, Excel, BI, and Google Sheets, where posts, comments, and SUMMARY are easier to filter. Comment events are billed the same regardless of output shape.

## Public limits

- Public content only. Private, friends-only, and login-only content is not accessed.
- Facebook can hide, filter, or private-gate comments from signed-out visitors.
- Comment counts displayed by Facebook may include hidden or private rows that are not publicly served.
- Reels, photo permalinks, and Watch pages can expose a count while withholding the signed-out comment list.
- Page and profile feeds through the owned profile engine are newest-first. Older-date backfills are bounded by `maxPostsPerGroup`.
- Facebook's signed-out group search page requires login for results. `HISTORY_SCAN` is the no-cookie equivalent: it pages backward through the public feed and filters matching posts locally, bounded by `searchMaxPostsPerSurface`.
- Marketplace enrichment and profile-level contact discovery are out of scope.

## Pricing

- `post`: `$0.003` each on BRONZE+, `$0.006` on FREE.
- `comment`: `$0.001` each on BRONZE+, `$0.002` on FREE.
- `apify-actor-start`: `$0.005` per started GB; at the default 2 GB this is `$0.010` per run.
- Minimum user max charge: `$0.02`.

Nested and separate output cost the same because the Actor charges for logical posts and comments, not dataset row shape. Dataset rows are committed before the Actor charges for them.

## Current status

- Published in the Apify Store: https://apify.com/spbotdel/facebook-group-posts-comments-scraper
- Local package version `0.1.0` maps to Apify Actor version `0.1`; Apify appends the build patch automatically.
- Pricing and custom event charging are configured and cloud-tested.
- Groups, public pages, public personal profiles, comments, replies, coverage diagnostics, and cross-run comment deduplication are implemented.
- Marketplace remains a separate product.

## Task presets

| Preset | Best for |
|---|---|
| `facebook-group-posts-comments-demo` | First-run demo and schema inspection |
| `scrape-facebook-group-posts-comments` | Full group discussions with replies |
| `scrape-facebook-posts-and-comments` | Generic posts-and-comments search intent |
| `scrape-facebook-page-posts-comments` | Public page posts and comment threads |
| `scrape-facebook-profile-posts-comments` | Public personal-profile posts and comments |
| `backfill-facebook-group-posts-by-date` | Historical date-range backfills |
| `facebook-comment-monitoring` | Generic scheduled comment monitoring |
| `export-facebook-posts-comments-to-csv` | CSV, Excel, and BI-ready exports |
| `build-ai-ready-facebook-post-dataset` | AI, RAG, and agent datasets |

## AI agents and MCP

Compact contract for agents calling this Actor through the [Apify MCP server](https://mcp.apify.com) or the Apify API.

Actor ID:

```text
spbotdel/facebook-group-posts-comments-scraper
```

Choose this Actor when the task needs public Facebook posts and their public comments together, without cookies. It accepts groups, pages, and personal profiles in one run, returns stable URLs, authors, dates, reactions, media, replies, and per-post coverage diagnostics.

Do not choose it for private groups, cookie login, Marketplace listings, sentiment scoring, or a comments-only job where the post URLs are already known. For known post URLs, use `spbotdel/facebook-comments-scraper`.

### MCP setup

```json
{
  "mcpServers": {
    "apify": {
      "url": "https://mcp.apify.com"
    }
  }
}
```

OAuth opens on first connection. Token-based clients should send `Authorization: Bearer <APIFY_TOKEN>`.

Useful MCP tools:

1. `search-actors`
2. `fetch-actor-details`
3. `call-actor`
4. `get-dataset-items`

Search queries that should rank this Actor: `facebook group posts comments scraper`, `facebook page comments no cookies`, `facebook profile posts and replies`, `facebook comment monitoring`, `facebook posts comments csv`, and `ai-ready facebook comments dataset`.

### Minimal input

```json
{
  "startUrls": [
    { "url": "https://www.facebook.com/groups/2333220550043074/" }
  ],
  "maxPostsPerGroup": 10,
  "commentsMode": "full",
  "maxCommentsPerPost": 50,
  "includeReplies": true
}
```

For a page or profile with an ambiguous handle, add `"userData": { "surfaceType": "page" }` or `"profile"`.

### Agent decision rules

- Use `commentsMode: "none"` for posts only. Use `inline` for a cheap sample of up to 3 comments. Use `full` for public thread collection.
- Keep `includeReplies: true` unless the user explicitly wants top-level comments only.
- Set `unionSorts: true` for maximum public coverage. Set it to `false` with `commentsSortOrder: "NEWEST"` for scheduled monitoring.
- Use `commentsOutput: "nested"` for LLM, RAG, and agent context. Use `separate` for CSV, Excel, BI, and joins.
- Always set `maxPostsPerGroup` and `maxCommentsPerPost`. Also set a run `maxTotalChargeUsd` for unattended jobs.
- Use `onlyPostsNewerThan` and `onlyPostsOlderThan` for a closed date window. Relative values such as `30 days` are supported.
- Use `searchMode: "HISTORY_SCAN"` only when the user needs older matching posts. It scans public history; it does not access Facebook's logged-in search.
- Keep `dedupeStoreName` identical across scheduled runs. The store is namespaced per Apify user.
- Read `SUMMARY` after every run. Do not infer success from HTTP status alone.

### Output contract

Nested mode returns one dataset row per post. Separate mode returns `record_type: "post"` and `record_type: "comment"` rows. Important fields:

- Post: `source_url`, `created_at`, `raw_text`, `author`, `stats`, `media`, `surface_type`, `group_url`, `source_profile_url`.
- Comments: `comments[]` in nested mode, or separate rows with `source_post_id`, `post_text`, parent-child thread fields, author, timestamp, reactions, and stable URL.
- Coverage: `comments_announced`, `comments_collected`, `comments_coverage_percent`, `comments_truncated_by_budget`, `comments_blocked`.

The Key-Value Store record `SUMMARY` reports `postsCollected`, `commentsCollected`, `newComments`, `commentsSkippedKnown`, `commentsUnmatched`, `budget`, `charging`, `surfaceRuns`, `commentRuns`, and `groupFeed.nextCursor`.

### Billing behavior agents must not ignore

- BRONZE+: `$0.003` per post, `$0.001` per collected comment, `$0.005` start per started GB (`$0.010` at the 2 GB default).
- FREE: event prices are doubled.
- Platform compute and residential proxy usage are included in the developer-paid event price; they are not charged separately to the user.
- A post with zero public comments is still a successful post result.
- A lower `comments_coverage_percent` means Facebook withheld signed-out rows or a configured limit stopped collection. It is not a reason to rerun blindly.
- If `comments_truncated_by_budget` is non-zero, raise `maxCommentsPerPost` or the run charge cap and continue from the returned cursor when available.

### Direct API call

```bash
curl -X POST \
  "https://api.apify.com/v2/acts/spbotdel~facebook-group-posts-comments-scraper/runs?token=<APIFY_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"startUrls":[{"url":"https://www.facebook.com/groups/2333220550043074/"}],"maxPostsPerGroup":10,"commentsMode":"full","maxCommentsPerPost":50}'
```

Read dataset items from the returned `defaultDatasetId`. Read `SUMMARY` from the run's default Key-Value Store. Public task presets cover demo, generic posts-and-comments, group comments, page comments, profile comments, date-range backfill, generic comment monitoring, new-comment monitoring, CSV export, and AI-ready JSON. Posts-only runs remain available through `commentsMode: "none"`.

## Search keywords

facebook group posts scraper, facebook group comments scraper, facebook page posts and comments, facebook profile posts scraper, scrape facebook comments without cookies, facebook comment monitoring, facebook posts csv export, ai-ready facebook dataset, facebook social listening scraper, public facebook comments api, no login facebook scraper
