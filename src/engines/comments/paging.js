// Paging helpers: pure logic, no network. Keeps GraphQL loop polite and bounded.
export const MAX_PAGES_PER_POST = 25;

export function commentKey(c, fallback) {
  if (!c || typeof c !== 'object') return String(fallback);
  return c.source_comment_id || c.raw_id || String(fallback);
}

// Adds unseen comments to `seen` (a Map used as a set), returns only fresh rows.
export function dedupeComments(seen, comments) {
  const fresh = [];
  if (!Array.isArray(comments)) return fresh;
  for (let i = 0; i < comments.length; i += 1) {
    const c = comments[i];
    const key = commentKey(c, 'idx:' + i);
    if (seen.has(key)) continue;
    fresh.push(c);
  }
  return fresh;
}

// Decides whether the GraphQL loop should fetch another page.
export function shouldFetchMore({ pushed, max, hasNext, pages, maxPages = MAX_PAGES_PER_POST }) {
  if (pushed >= max) return false;
  if (pages >= maxPages) return false;
  if (hasNext === false) return false;
  return true;
}

// Run-budget: retries cost compute (each 90-120s backoff burns CU while
// sleeping). Cap throttle retries per post so a hostile thread cannot eat
// the whole run budget one backoff at a time.
export const MAX_THROTTLE_RETRIES_PER_POST = 2;

export function throttleRetryAllowed(retriesUsed, maxRetries = MAX_THROTTLE_RETRIES_PER_POST) {
  return Number(retriesUsed || 0) < maxRetries;
}

// Migration-safe push filter: after an Apify host migration the container
// restarts mid-post and re-pushes the same comments. Skip keys already
// pushed in THIS run so the dataset holds unique rows (billing stays honest).
export function filterUnpushed(pushedKeys, comments) {
  const fresh = [];
  if (!Array.isArray(comments)) return fresh;
  for (const c of comments) {
    const key = commentKey(c, null);
    if (key == null || key === 'null') { fresh.push(c); continue; }
    if (pushedKeys.has(key)) continue;
    fresh.push(c);
  }
  return fresh;
}

// Stall detector: same page content repeated -> stop instead of burning 25 pages.
export function stallStatus(seen, comments, stalledPages) {
  const fresh = dedupeComments(seen, comments);
  const stalledNow = Array.isArray(comments) && comments.length > 0 && fresh.length === 0;
  const next = stalledNow ? stalledPages + 1 : 0;
  return { fresh, stalled: next >= 2, stalledPages: next };
}
