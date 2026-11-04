# Changelog

## 0.1.19 - 2026-11-04

- All 26 dataset fields now carry agent-facing descriptions; runtime code unchanged.
- Build `0.1.19` smoke run `F7gRcOGWZTLQdzuXM` succeeded with two posts.

## 0.1.18 - 2026-11-04

- README: added the public GitHub source badge for `spbotdel/facebook-group-posts-comments-scraper`. No runtime code changed.
- Build `0.1.18` published the README to the Apify store page; smoke run `o9n4Xav7hd5xI4ScO` succeeded with two posts.

## 0.1.17 - 2026-10-27

- Hardened the vendored group date parser with bounded relative dates, overflow protection, UTC handling for offsetless ISO timestamps, and rejection of invalid numeric boundaries.
- Guarded every Actor status-message update so diagnostics cannot abort otherwise valid collection.
- Added an early run status message before feed collection starts.
- Corrected billing documentation: the `$0.010` start event covers the 2 GB platform allocation, and the developer-paid event price includes platform usage.
- Added the group date parser to the package syntax check.

### Verification

- Local syntax check passed; 17 of 17 tests passed.
- Apify build `0.1.17` succeeded; smoke run `3qYI8khcnRvP00Ndv` returned two posts.

## 0.1.0 - 2026-10-04

- Initial combined group/page/profile posts and comments Actor snapshot.
