// Budget + input validation for the comments actor. Pure, no network.
export const MAX_POSTS_PER_RUN = 100;
export const MAX_COMMENTS_PER_POST = 1000;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 10;
export const MAX_REPLY_EXPANSIONS_PER_POST = 20;
export const DEFAULT_REPLY_EXPANSIONS = 0;
export const DEFAULT_PAGE_DELAY_MS = 1000;
export const MIN_PAGE_DELAY_MS = 200;
export const MAX_PAGE_DELAY_MS = 10000;
export const DEFAULT_MAX_PAGES_PER_POST = 60;
export const MAX_PAGES_PER_POST = 200;
export const DEFAULT_MAX_REPLY_THREADS = 20;
export const MAX_REPLY_THREADS_PER_POST = 200;
export const DEFAULT_MAX_REPLIES_PER_POST = 200;
export const DEFAULT_MAX_CONCURRENCY = 5;
export const MAX_CONCURRENCY = 20;
export const DOC_COMMENTS_PAGER = '28885531661053404';
export const OP_COMMENTS_PAGER = 'CometUFIInfiniteScrollTopLevelCommentsPager';
// Live triple (Playwright intercept + direct walks 2026-09-29/30):
// CommentsListComponentsPaginationQuery + Depth1 + Depth2 replies.
// Verified 2026-09-30: public posts paginate 10/page with no ceiling
// (400 distinct in 40 pages, has_next still true), replies paginate to the end
// (81/83 in 9 pages), groups stop at ~45% of the thread. No cookies involved.
export const DOC_COMMENTS_LIST = '38580553541588665';
export const OP_COMMENTS_LIST = 'CommentsListComponentsPaginationQuery';
export const DOC_REPLIES_DEPTH1 = '39246134745000506';
export const OP_REPLIES_DEPTH1 = 'Depth1CommentsListPaginationQuery';
export const DOC_REPLIES_DEPTH2 = '28907335732287199';
export const OP_REPLIES_DEPTH2 = 'Depth2CommentsListPaginationQuery';
export const QUERY_MODES = ['LEGACY_TOPLEVEL', 'FRESH_LIST', 'FRESH_LIST_WITH_REPLIES'];

// Sort intents. Verified 2026-09-30 on a public post: null and
// RECENT_ACTIVITY_INTENT_V1 returned 40 ids each with ZERO overlap, so walking
// both (union) multiplies coverage per request budget. Groups ignore the
// difference and return the same window for every intent.
export const RECENT_ACTIVITY_INTENT = 'RECENT_ACTIVITY_INTENT_V1';
export const RANKED_UNFILTERED_INTENT = 'RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1';
export const DEFAULT_TOP_INTENTS = [null, RECENT_ACTIVITY_INTENT];

// Explicit sort order for comments, mirroring the Facebook UI and the
// `commentsSortOrder` / `viewOption` fields competitors expose.
export const COMMENT_SORT_ORDERS = ['MOST_RELEVANT', 'NEWEST', 'ALL_COMMENTS'];
export const SORT_INTENT_BY_ORDER = {
  // null = whatever Facebook serves by default, the window the browser shows.
  MOST_RELEVANT: null,
  NEWEST: 'REVERSE_CHRONOLOGICAL_UNFILTERED_INTENT_V1',
  ALL_COMMENTS: 'RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1',
};
export const MAX_KNOWN_COMMENT_IDS = 100000;

// Relay-provider flags the live browser sends on every comment query.
// Missing flags = forged look (probes 2026-09-29: 1357054/1675012).
export const RELAY_PROVIDERS = {
  '__relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider': 'AUTO_TRANSLATE',
  '__relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider': false,
  '__relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider': false,
  '__relay_internal__pv__IsWorkUserrelayprovider': false,
};

// Verified 2026-09-30: GROUP_PERMALINK returns 3 comments per page on a group,
// while POST_PERMALINK_DIALOG/GROUP/PERMALINK/NEWSFEED return 10 on the very
// same post and cursor. The dialog surface is safe for posts, reels, photos
// and groups, so it is the only one we send now.
export function feedLocationForUrl(url) {
  void url;
  return 'POST_PERMALINK_DIALOG';
}

export function feedbackId(postId, parentCommentId) {
  const base = parentCommentId ? `feedback:${postId}_${parentCommentId}` : `feedback:${postId}`;
  return Buffer.from(base).toString('base64');
}

// Live CLCPQ top vars: full browser shape, cursor-only paging.
// afterCursor null on page 1, opaque server cursor afterwards. Count stays -1:
// the server picks the page size (~10 observed).
export function buildFreshTopVars(idB64, afterCursor, postUrl, intent = null, feedLocationOverride = null) {
  return {
    commentsAfterCount: -1,
    commentsAfterCursor: afterCursor ?? null,
    commentsBeforeCount: null,
    commentsBeforeCursor: null,
    commentsIntentToken: intent ?? null,
    feedLocation: feedLocationOverride || feedLocationForUrl(postUrl),
    focusCommentID: null,
    scale: 1,
    targetDialect: null,
    useDefaultActor: false,
    id: idB64,
    ...RELAY_PROVIDERS,
  };
}

// Live Depth1 reply vars: per-parent expansion, id = feedback POST_parent.
// First fetch carries null count/cursor; deeper reply pages send -1 + cursor
// (mirrors the browser: null on first Depth1, -1 once subReplies paginate).
export function buildDepth1Vars(postId, parentCommentId, expansionToken, postUrl, repliesAfterCursor = null, feedLocationOverride = null) {
  return {
    clientKey: null,
    expansionToken: expansionToken ?? null,
    feedLocation: feedLocationOverride || feedLocationForUrl(postUrl),
    focusCommentID: null,
    repliesAfterCount: repliesAfterCursor ? -1 : null,
    repliesAfterCursor: repliesAfterCursor ?? null,
    repliesBeforeCount: null,
    repliesBeforeCursor: null,
    scale: 1,
    useDefaultActor: false,
    id: feedbackId(postId, parentCommentId),
    ...RELAY_PROVIDERS,
  };
}

// Live Depth2 sub-reply vars: id = feedback POST_comment, subReplies paging
// triple. Same null-first, -1-after discipline as Depth1.
export function buildDepth2Vars(postId, commentId, expansionToken, postUrl, subAfterCursor = null) {
  return {
    clientKey: null,
    expansionToken: expansionToken ?? null,
    feedLocation: feedLocationForUrl(postUrl),
    scale: 1,
    subRepliesAfterCount: subAfterCursor ? -1 : null,
    subRepliesAfterCursor: subAfterCursor ?? null,
    subRepliesBeforeCount: null,
    subRepliesBeforeCursor: null,
    useDefaultActor: false,
    id: feedbackId(postId, commentId),
    ...RELAY_PROVIDERS,
  };
}

export function numSetting(input, name, def, min, max, { integer = true } = {}) {
  const raw = input?.[name];
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Invalid ${name}: expected a number.`);
  if (integer && !Number.isInteger(n)) throw new Error(`Invalid ${name}: expected an integer.`);
  if (n < min || n > max) throw new Error(`Invalid ${name}: ${n}. Supported range is ${min}..${max}.`);
  return n;
}

// Date filter for comments: accepts ISO/date strings or relative values like
// "30 days", "12 hours", "2 weeks". Returns a millisecond cutoff or null.
export function parseDateFilter(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const text = String(raw).trim();
  const rel = text.match(/^(\d+)\s*(hour|hours|day|days|week|weeks|month|months)$/i);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const step = unit.startsWith('hour') ? 3600000 : unit.startsWith('day') ? 86400000 : unit.startsWith('week') ? 604800000 : 2592000000;
    return Date.now() - n * step;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function readRunSettings(input) {
  return {
    maxPostsPerRun: numSetting(input, 'maxPostsPerRun', 5, 1, MAX_POSTS_PER_RUN),
    maxCommentsPerPost: numSetting(input, 'maxCommentsPerPost', 300, 1, MAX_COMMENTS_PER_POST),
    // Density guard: skip thin threads before burning proxy+compute.
    // 0 = off (default, back-compat). N > 0 = stop paging a post once it is
    // clear it will never reach N comments (totalCount known and < N).
    minCommentsPerPost: numSetting(input, 'minCommentsPerPost', 0, 0, MAX_COMMENTS_PER_POST),
    includeReplies: input?.includeReplies !== false,
    // ALL_COMMENTS = RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1 (c1 shape):
    // unfiltered chronological, the most complete dataset with no filtering.
    sortMode: (input?.sortMode === 'NEWEST_FIRST' || input?.sortMode === 'ALL_COMMENTS' || input?.sortMode === 'TOP_COMMENTS') ? input.sortMode : 'TOP_COMMENTS',
    // Query mode: FRESH_LIST is the default now (live CLCPQ walks 10/page with
    // no ceiling). LEGACY_TOPLEVEL stays available for the dusty TopLevel pager.
    queryMode: QUERY_MODES.includes(input?.queryMode) ? input.queryMode : 'FRESH_LIST',
    // Page size probe: FB accepted count 10 (was 5). Larger pages = fewer
    // round-trips per comment. Range 5..50, default 10.
    pageSize: numSetting(input, 'pageSize', DEFAULT_PAGE_SIZE, 5, MAX_PAGE_SIZE),
    // Replies deep-fetch: after top-level paging, expand up to N comments'
    // expansion_tokens to pull nested replies as extra billable rows.
    // 0 = off. Each expansion costs one GraphQL call + polite sleep.
    maxReplyExpansionsPerPost: numSetting(input, 'maxReplyExpansionsPerPost', 0, 0, MAX_REPLY_EXPANSIONS_PER_POST),
    // Reply walk: how many reply-bearing parents to expand and how many reply
    // rows to keep per post. Replies are paged to the end (verified 81/83).
    maxReplyThreadsPerPost: numSetting(input, 'maxReplyThreadsPerPost', DEFAULT_MAX_REPLY_THREADS, 0, MAX_REPLY_THREADS_PER_POST),
    maxRepliesPerPost: numSetting(input, 'maxRepliesPerPost', DEFAULT_MAX_REPLIES_PER_POST, 0, MAX_COMMENTS_PER_POST),
    // Pacing. Verified 2026-09-30: 0.7-1.5s between pages keeps the walk alive
    // on public posts; the old 35-55s sleeps were treating a wrong request shape.
    pageDelayMs: numSetting(input, 'pageDelayMs', DEFAULT_PAGE_DELAY_MS, MIN_PAGE_DELAY_MS, MAX_PAGE_DELAY_MS),
    introDelayMs: numSetting(input, 'introDelayMs', 1500, 0, 60000),
    maxPagesPerPost: numSetting(input, 'maxPagesPerPost', DEFAULT_MAX_PAGES_PER_POST, 1, MAX_PAGES_PER_POST),
    // Union of sort intents: doubles/triples distinct coverage per request.
    unionSorts: input?.unionSorts !== false,
    // Explicit Facebook-style order. MOST_RELEVANT keeps the default window,
    // NEWEST and ALL_COMMENTS switch the intent token (verified shapes).
    commentsSortOrder: COMMENT_SORT_ORDERS.includes(input?.commentsSortOrder)
      ? input.commentsSortOrder
      : 'MOST_RELEVANT',
    // Cross-run dedupe: skip comment ids already delivered. Accepts an explicit
    // list and/or a dataset id from a previous run.
    knownCommentIds: Array.isArray(input?.knownCommentIds)
      ? input.knownCommentIds.map(String).slice(0, MAX_KNOWN_COMMENT_IDS)
      : [],
    knownDatasetId: typeof input?.knownDatasetId === 'string' && input.knownDatasetId ? input.knownDatasetId : null,
    // Named key-value store that persists seen comment ids BETWEEN runs of this
    // actor. Reading another run's dataset needs full permissions, so the store
    // is the reliable way to do incremental monitoring.
    dedupeStoreName: typeof input?.dedupeStoreName === 'string' && input.dedupeStoreName ? input.dedupeStoreName : null,
    // Monitoring helper: fail the run instead of silently returning nothing.
    failOnEmpty: input?.failOnEmpty === true,
    // Copy the post caption into every comment row (one HTML parse, no extra requests).
    includePostText: input?.includePostText === true,
    // Escape hatch for research: force a feedLocation value.
    feedLocation: typeof input?.feedLocation === 'string' && input.feedLocation ? input.feedLocation : null,
    // Bulk runs: process this many posts in parallel. The verified per-post
    // walk is polite (>=200 ms between pages), and posts do not share cursors,
    // so a small pool cuts wall time ~Nx without touching the pacing.
    maxConcurrency: numSetting(input, 'maxConcurrency', DEFAULT_MAX_CONCURRENCY, 1, MAX_CONCURRENCY),
    // Proxy: country code + groups (the walk works logged-out, RESIDENTIAL is
    // what survived repeated cloud runs).
    proxyCountry: typeof input?.proxyCountry === 'string' && input.proxyCountry ? input.proxyCountry : 'US',
    // Empty array = let Apify pick the default (datacenter) group, which is
    // orders of magnitude cheaper per GB than residential.
    proxyGroups: Array.isArray(input?.proxyGroups)
      ? input.proxyGroups.map(String).slice(0, 5)
      : ['RESIDENTIAL'],
    // auto = start on datacenter, fall back to residential when Facebook
    // blocks it. Measured 2026-09-30: datacenter served 400 public comments for
    // $0.011 vs $0.045 on residential, and a group permalink walk too.
    proxyTier: ['auto', 'datacenter', 'residential'].includes(String(input?.proxyTier || '').toLowerCase())
      ? String(input.proxyTier).toLowerCase()
      : 'auto',
    // Only keep comments newer than this date (absolute or relative).
    onlyCommentsNewerThan: input?.onlyCommentsNewerThan ?? null,
    // Continuation cursors: { postId: { endCursor, afterCursor } } from a
    // previous run's OUTPUT summaries. Never mix cursors across posts.
    startCursorByPost: readCursorMap(input?.startCursorByPost),
  };
}

export function readCursorMap(raw) {
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { throw new Error('Invalid startCursorByPost: expected a JSON object.'); }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid startCursorByPost: expected a JSON object.');
  const out = {};
  for (const [postId, cur] of Object.entries(raw)) {
    if (!/^\d{8,25}$/.test(postId)) throw new Error(`Invalid startCursorByPost: bad post id ${postId}.`);
    if (cur === null || cur === undefined) continue;
    if (typeof cur !== 'object' || Array.isArray(cur)) throw new Error(`Invalid startCursorByPost[${postId}]: expected an object.`);
    const endCursor = cur.endCursor ?? cur.end_cursor ?? null;
    const afterCursor = cur.afterCursor ?? cur.after_cursor ?? null;
    if ((endCursor !== null && typeof endCursor !== 'string') || (afterCursor !== null && typeof afterCursor !== 'string')) {
      throw new Error(`Invalid startCursorByPost[${postId}]: cursors must be strings.`);
    }
    if (endCursor || afterCursor) out[postId] = { endCursor: endCursor || null, afterCursor: afterCursor || null };
  }
  return out;
}

export function postIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/permalink\/(\d{8,25})/) || url.match(/posts\/(\d{8,25})/) || url.match(/pfbid([A-Za-z0-9]{10,80})/) || url.match(/(\d{12,25})/);
  return m ? m[1] : null;
}

// Which Facebook surface an input URL points at. Used for diagnostics: Reels
// and photo pages render for logged-out visitors but do not serve the comment
// list, and we want that reported instead of a silent zero.
export function surfaceOfUrl(url) {
  const value = String(url || '');
  if (/\/reel\//i.test(value)) return 'reel';
  if (/\/watch\//i.test(value) || /[?&]v=\d{6,}/i.test(value)) return 'watch';
  if (/\/photo(?:\.php)?\/?\?/i.test(value) || /[?&]fbid=/i.test(value)) return 'photo';
  if (/story\.php/i.test(value)) return 'story';
  if (/\/groups\//i.test(value)) return 'group';
  if (/\/videos\//i.test(value)) return 'video';
  if (/\/posts\//i.test(value)) return 'post';
  return 'unknown';
}
