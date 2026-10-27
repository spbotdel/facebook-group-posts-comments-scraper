// facebook-comments actor: live CLCPQ walk, cookieless by design.
//
// Verified 2026-09-30 (direct walks, no cookies, no Apify):
// - public posts/reels/photos: 10 comments per page, no ceiling (400 distinct
//   in 40 pages, has_next still true) and replies page to the end (81/83).
// - groups: same 10/page but the thread stops at ~45% of the announced count;
//   replies come back as a 2-4 item teaser. That is a Facebook limit for
//   logged-out sessions, not our bug.
// - the old TopLevel pager 28885531661053404 is a museum piece: it keeps
//   rotating the cursor and keeps returning the same 10 comments.
// - GROUP_PERMALINK returns 3/page on groups; POST_PERMALINK_DIALOG returns 10
//   on the very same post, so the dialog surface is the only one we send.
import { Actor, log } from 'apify';
import { gotScraping } from 'got-scraping';
import { buildCommentUrl, extractPostText, parseCommentEdges, summarizePayload } from './parseComments.js';
import { throttleRetryAllowed } from './paging.js';
import {
  DOC_COMMENTS_LIST, OP_COMMENTS_LIST, DOC_REPLIES_DEPTH1, OP_REPLIES_DEPTH1,
  RECENT_ACTIVITY_INTENT, SORT_INTENT_BY_ORDER, buildDepth1Vars,
  buildFreshTopVars as buildLiveTopVars, parseDateFilter, postIdFromUrl, readRunSettings, surfaceOfUrl,
} from './settings.js';
import { createResultChargeBudget } from './charging.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));
const THROTTLE_CODES = /1675004|1357054|1675005|Rate limit/i;

const isThrottle = (payload) => {
  const errs = Array.isArray(payload?.errors) ? payload.errors : [];
  return errs.some((e) => THROTTLE_CODES.test(`${e?.code ?? ''} ${e?.message ?? ''}`));
};

await Actor.init();
const input = (await Actor.getInput()) ?? {};
const settings = readRunSettings(input);
log.info(`queryMode=${settings.queryMode} feedLocation=${settings.feedLocation || 'POST_PERMALINK_DIALOG'} pageDelayMs=${settings.pageDelayMs} unionSorts=${settings.unionSorts} concurrency=${settings.maxConcurrency}`);

// Pay-per-event budget: caps paid comment rows before fetch, like the posts
// actors. Default dataset-item event bills per comment; the summary stays in KV.
const chargeBudget = createResultChargeBudget(Actor.getChargingManager());
const affordableComments = chargeBudget.capRequestedRows(settings.maxPostsPerRun * settings.maxCommentsPerPost);
if (affordableComments <= 0 && chargeBudget.resultEventEnabled) {
  log.warning('Charge limit exhausted before fetch: pushing empty OUTPUT');
  await Actor.setValue('OUTPUT', { pushed: 0, posts: 0, summaries: [], stopReason: 'charge_limit' });
  await Actor.exit();
}

const postUrls = Array.isArray(input.postUrls) && input.postUrls.length ? input.postUrls.slice(0, settings.maxPostsPerRun) : [];
if (!postUrls.length) throw new Error('Provide at least one public post URL in postUrls.');
const uniquePostUrls = [...new Set(postUrls)];
if (uniquePostUrls.length !== postUrls.length) log.info(`Skipped ${postUrls.length - uniquePostUrls.length} duplicate post URL(s)`);

// Proxy tiers. Datacenter is ~4x cheaper and served 400 public comments plus a
// group permalink walk in tests, but Facebook blocks it intermittently, so
// 'auto' falls back to residential the moment a page comes back empty.
const proxyTier = settings.proxyTier;
let client = null;
let switchedToResidential = false;
const buildClient = async (tier) => {
  const configuration = await Actor.createProxyConfiguration(
    tier === 'residential'
      ? { groups: ['RESIDENTIAL'], countryCode: settings.proxyCountry }
      : { countryCode: settings.proxyCountry },
  );
  const url = await configuration.newUrl('cmactor' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
  return gotScraping.extend({ proxyUrl: url, retry: { limit: 0 }, timeout: { request: 45000 } });
};
client = await buildClient(proxyTier === 'residential' ? 'residential' : 'datacenter');
const switchToResidential = async (reason) => {
  if (proxyTier !== 'auto' || switchedToResidential) return false;
  switchedToResidential = true;
  log.warning(`Datacenter blocked (${reason}), switching to residential proxy`);
  client = await buildClient('residential');
  return true;
};
log.info(`Proxy tier: ${proxyTier}`);
const headers = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' };
// The permalink GET must look like a document navigation, otherwise Facebook
// returns a smaller HTML variant without the embedded comment payload (measured
// 475 KB vs 788 KB on the same story.php URL, 2026-10-01).
const htmlHeaders = {
  ...headers,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
};
const minCreatedMs = parseDateFilter(settings.onlyCommentsNewerThan);
if (minCreatedMs) log.info(`Date filter: keeping comments newer than ${new Date(minCreatedMs).toISOString()}`);

// Cross-run dedupe: comment ids the caller already has, from an explicit list
// and/or a previous dataset. Keeps monitoring runs from re-delivering rows.
const knownCommentIds = new Set(settings.knownCommentIds.map(String));
let dedupeStore = null;
if (settings.dedupeStoreName) {
  try {
    dedupeStore = await Actor.openKeyValueStore(settings.dedupeStoreName);
    const saved = await dedupeStore.getValue('seenCommentIds');
    for (const id of (Array.isArray(saved) ? saved : [])) knownCommentIds.add(String(id));
    log.info(`Dedupe store ${settings.dedupeStoreName}: ${knownCommentIds.size} known comment ids`);
  } catch (e) {
    log.warning(`Could not open dedupe store ${settings.dedupeStoreName}: ${e?.message || e}`);
    dedupeStore = null;
  }
}
if (settings.knownDatasetId) {
  try {
    const source = await Actor.openDataset(settings.knownDatasetId);
    const { items } = await source.getData({ fields: ['source_comment_id'], limit: 100000 });
    for (const item of (items || [])) {
      if (item?.source_comment_id != null) knownCommentIds.add(String(item.source_comment_id));
    }
    log.info(`Loaded ${knownCommentIds.size} known comment ids from dataset ${settings.knownDatasetId}`);
  } catch (e) {
    log.warning(`Could not load knownDatasetId ${settings.knownDatasetId}: ${e?.message || e}`);
  }
} else if (knownCommentIds.size) {
  log.info(`Cross-run dedupe: ${knownCommentIds.size} known comment ids`);
}
let skippedKnown = 0;
const first = (patterns, text) => { for (const p of patterns) { const m = text.match(p); if (m?.[1]) return m[1]; } return null; };

// pfbid / share URLs carry an opaque token instead of the numeric post id, but
// the GraphQL feedback id must be numeric. The permalink HTML always exposes it
// as base64("feedback:<id>") (verified on public posts 2026-09-30).
const resolvePostId = (html, fallback) => {
  if (/^\d{8,25}$/.test(String(fallback || ''))) return fallback;
  const b64Token = html.match(/ZmVlZGJhY2s6[A-Za-z0-9+/=_-]{8,}/);
  if (b64Token) {
    try {
      const decoded = Buffer.from(b64Token[0], 'base64').toString('utf8');
      const m = decoded.match(/(\d{8,25})/);
      if (m) return m[1];
    } catch { /* fall through to the plain-text probes */ }
  }
  const plain = first([
    /"post_id":"(\d{8,25})"/,
    /"legacy_fbid":"(\d{8,25})"/,
    /"story_fbid":"?(\d{8,25})"?/,
    /"feedback_id":"(\d{8,25})"/,
  ], html);
  return plain || fallback;
};

const readBoot = (html) => ({
  lsd: first([/"LSD",\[\],\{"token":"([^"]+)"/, /name="lsd"\s+value="([^"]+)"/], html),
  jazoest: first([/&jazoest=(\d+)"/, /name="jazoest"\s+value="([^"]+)"/], html),
  spinR: first([/"__spin_r":(\d+)/], html),
  spinB: first([/"__spin_b":"([^"]+)"/], html),
  spinT: first([/"__spin_t":(\d+)/], html),
  rev: first([/"__spin_r":(\d+)/, /\{"rev":(\d+)\}/], html),
  hsi: first([/"hsi":"([^"]+)"/], html),
  hs: first([/"haste_session":"([^"]+)"/], html),
});

const buildForm = (boot, postUrl, vars, docId, friendly, reqId) => new URLSearchParams({
  av: '0', __aaid: '0', __user: '0', __a: '1', __req: reqId, dpr: '1', __ccg: 'EXCELLENT',
  __rev: boot.rev || '', __hsi: boot.hsi || '', __comet_req: '15',
  ...(boot.hs ? { __hs: boot.hs } : {}),
  lsd: boot.lsd || '', jazoest: boot.jazoest || '',
  __spin_r: boot.spinR || '', __spin_b: boot.spinB || 'trunk',
  __spin_t: boot.spinT || String(Math.floor(Date.now() / 1000)),
  fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: friendly,
  variables: JSON.stringify(vars), server_timestamps: 'true', doc_id: docId,
});

let reqCounter = 0;
const nextReqId = () => (reqCounter += 1).toString(36);

const fetchGraphql = async ({ boot, postUrl, vars, docId, friendly }) => {
  const form = buildForm(boot, postUrl, vars, docId, friendly, nextReqId());
  const g = await client('https://www.facebook.com/api/graphql/', {
    method: 'POST',
    body: form.toString(),
    throwHttpErrors: false,
    headers: {
      ...headers,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '*/*',
      Origin: 'https://www.facebook.com',
      Referer: postUrl,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-origin',
      'x-fb-friendly-name': friendly,
      ...(boot.lsd ? { 'x-fb-lsd': boot.lsd } : {}),
    },
  });
  return String(g.body || '');
};

let runPushed = 0;
let chargeStopped = false;
const runSummaries = [];
const runPushedKeys = new Set();
// Migration-safe: after an Apify host migration the container re-runs a chunk
// and would re-push the same rows. Keys pushed in THIS run are skipped.

const processPost = async (postUrl, postIndex) => {
  if (chargeStopped) return;
  const urlId = postIdFromUrl(postUrl);
  if (!urlId) { log.warning('Skip bad URL: ' + postUrl); return; }
  log.info(`Post ${postIndex}/${postUrls.length}: ${urlId}`);

  let hres = await client(postUrl, { throwHttpErrors: false, followRedirect: true, headers: htmlHeaders });
  let html = String(hres.body || '');
  if (hres.statusCode !== 200 || html.length < 100000) {
    const switched = await switchToResidential(`permalink status=${hres.statusCode} len=${html.length}`);
    if (switched) {
      hres = await client(postUrl, { throwHttpErrors: false, followRedirect: true, headers: htmlHeaders });
      html = String(hres.body || '');
    }
  }
  if (hres.statusCode !== 200 || html.length < 100000) {
    log.warning(`Post page blocked: status=${hres.statusCode} len=${html.length}`);
    runSummaries.push({ source_post_url: postUrl, source_post_id: urlId, blocked: true, status: hres.statusCode, pushed: 0 });
    return;
  }
  // Opaque pfbid/share URLs get their numeric id resolved from the HTML.
  const postId = resolvePostId(html, urlId);
  if (postId !== urlId) log.info(`Resolved numeric post id: ${urlId} -> ${postId}`);
  // Facebook embeds the announced comment count in the permalink HTML, so we
  // can report coverage before walking a single page.
  // Facebook renders this field with different spacing/order across surfaces.
  const announcedComments = Number(
    first([
      /"comments"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/,
      /"comment_count"\s*:\s*\{\s*"total_count"\s*:\s*(\d+)/,
      /"total_comment_count"\s*:\s*(\d+)/,
      /"total_count"\s*:\s*(\d+)\s*,\s*"[a-z_]*has_only_low_quality_comments/i,
    ], html),
  ) || null;
  log.info(`Permalink HTML: ${html.length} bytes, announced comments: ${announcedComments ?? 'not found'}`);
  if (announcedComments) log.info(`Post announces ${announcedComments} comments`);
  const postText = settings.includePostText ? extractPostText(html) : null;
  if (settings.includePostText) log.info(`Post text: ${postText ? postText.slice(0, 80) + '…' : 'not found'}`);
  const boot = readBoot(html);
  const fbB64 = Buffer.from('feedback:' + postId).toString('base64');

  const seen = new Map();
  const postPushedRows = [];
  const feedLocation = settings.feedLocation || undefined;
  let pushed = 0;
  let topPages = 0;
  let replyPages = 0;
  let replyThreads = 0;
  let replyPushed = 0;
  let blocked = null;
  let throttles = 0;
  let totalCount = null;
  let lastCursor = null;

  // Reserve headroom so the reply walk still has budget after the top-level
  // walk: without it the top fills maxCommentsPerPost and replies never run.
  const repliesEnabled = settings.includeReplies && settings.maxRepliesPerPost > 0 && settings.maxReplyThreadsPerPost > 0;
  const replyReserve = repliesEnabled
    ? Math.min(settings.maxRepliesPerPost, Math.max(1, Math.floor(settings.maxCommentsPerPost / 2)))
    : 0;
  const topCap = Math.max(1, settings.maxCommentsPerPost - replyReserve);

  const pushRow = async (row, parentId, limit) => {
    if (pushed >= limit) return false;
    // Date filter: created_time is unix seconds; rows without a timestamp are
    // kept (Facebook omits it on some comments).
    if (minCreatedMs && Number(row.created_time) > 0 && Number(row.created_time) * 1000 < minCreatedMs) return false;
    if (runPushed >= affordableComments) { blocked = blocked || 'charge_limit'; chargeStopped = true; return false; }
    const key = row.source_comment_id || row.raw_id || `${postId}:${pushed}`;
    if (runPushedKeys.has(key)) return false;
    if (knownCommentIds.has(String(key))) { skippedKnown += 1; return false; }
    // Reserve the key BEFORE awaiting the push: parallel workers on the same
    // post would otherwise both pass the check and double-push (seen in the
    // 4-post parallel test 2026-09-30).
    runPushedKeys.add(key);
    seen.set(key, true);
    const commentUrl = row.comment_url || buildCommentUrl(postUrl, row.source_comment_id, row.parent_comment_id || parentId || null);
    const chargeResult = await Actor.pushData({
      source_post_url: postUrl,
      source_post_id: postId,
      input_url: postUrl,
      ...row,
      ...(postText ? { post_text: postText } : {}),
      parent_comment_id: row.parent_comment_id || parentId || null,
      comment_url: commentUrl,
    });
    const written = chargeBudget.pushedRows(1, chargeResult);
    if (written < 1 || chargeBudget.limitReached(chargeResult)) {
      runPushedKeys.delete(key);
      blocked = blocked || 'charge_limit';
      chargeStopped = true;
      log.warning('Charge limit reached during push, stopping run');
      return false;
    }
    postPushedRows.push({
      source_comment_id: row.source_comment_id,
      expansion_token: row.expansion_token,
      reply_count: row.reply_count,
      comments_count: row.comments_count,
    });
    pushed += 1;
    runPushed += 1;
    return true;
  };

  // Small settle after the permalink GET; the old 35-80s "polite cooldown"
  // was compensating for a wrong request shape, not for Facebook.
  if (settings.introDelayMs > 0) await sleep(rnd(settings.introDelayMs, settings.introDelayMs + 800));

  // ── Top-level walk ───────────────────────────────────────────────────
  // Sort union: on public posts null and RECENT_ACTIVITY_INTENT_V1 returned
  // zero-overlapping windows (40+40 -> 80 distinct from 8 requests).
  // Explicit order picks the intent; unionSorts additionally walks NEWEST so
  // sample-heavy runs get two non-overlapping windows.
  const sortIntent = SORT_INTENT_BY_ORDER[settings.commentsSortOrder] ?? null;
  const intents = settings.queryMode === 'LEGACY_TOPLEVEL'
    ? [null]
    : (settings.unionSorts
      ? [...new Set([sortIntent, RECENT_ACTIVITY_INTENT])]
      : [sortIntent]);

  for (const intent of intents) {
    if (blocked || chargeStopped || pushed >= topCap) break;
    let cursor = null;
    let emptyStreak = 0;
    // Union sorts are useless when the next intent returns the same window
    // (groups do exactly that). Stop after two duplicate pages instead of
    // paying for a second full walk of ids we already pushed.
    let dryStreak = 0;
    const intentSeen = new Set();
    for (let page = 0; page < settings.maxPagesPerPost; page += 1) {
      if (blocked || chargeStopped || pushed >= topCap) break;
      const vars = buildLiveTopVars(fbB64, cursor, postUrl, intent, feedLocation);
      let raw;
      try {
        raw = await fetchGraphql({ boot, postUrl, vars, docId: DOC_COMMENTS_LIST, friendly: OP_COMMENTS_LIST });
      } catch (e) { blocked = 'network:' + (e?.message || 'err'); break; }
      if (topPages === 0 && intent === intents[0]) await Actor.setValue('RAW-GRAPHQL', raw.slice(0, 900000));

      let payload = {};
      try { payload = JSON.parse(raw); } catch { payload = { parseError: raw.slice(0, 300) }; }
      if (isThrottle(payload)) {
        if (throttleRetryAllowed(throttles)) {
          throttles += 1;
          log.warning(`Throttle on ${postId} page ${topPages + 1}, backing off 20-35s (${throttles}/3)`);
          await sleep(rnd(20000, 35000));
          continue;
        }
        blocked = 'facebook-throttle';
        break;
      }

      const parsed = parseCommentEdges(payload);
      const summary = summarizePayload(payload);
      topPages += 1;
      if (totalCount == null) totalCount = summary.totalCount ?? null;

      // Some surfaces (Reels, photos, watch pages) render for logged-out
      // visitors but never serve the comment list: the page advertises N
      // comments and the query comes back empty. Report that explicitly
      // instead of returning a silent zero.
      const surface = surfaceOfUrl(postUrl);
      if (topPages === 1 && parsed.comments.length === 0 && summary.hasNextPage === false
        && (announcedComments > 0 || ['reel', 'photo', 'watch'].includes(surface))) {
        blocked = blocked || 'comment_list_not_served_without_login';
        log.warning(`Facebook served an empty comment list for surface "${surface}"${announcedComments ? ` although the post advertises ${announcedComments} comments` : ''}`);
      }

      // Datacenter proxies get silently throttled: HTTP 200, a valid JSON
      // envelope, zero edges. One switch to residential fixes it.
      if (parsed.comments.length === 0 && summary.hasNextPage !== false && !switchedToResidential && proxyTier === 'auto') {
        const switched = await switchToResidential(`empty page ${topPages} (edges=0, hasNext=${summary.hasNextPage})`);
        if (switched) {
          topPages -= 1;
          continue;
        }
      }

      let fresh = 0;
      for (const row of parsed.comments) {
        const key = row.source_comment_id || row.raw_id;
        if (key && intentSeen.has(key)) continue;
        if (key) intentSeen.add(key);
        if (await pushRow(row, null, topCap)) fresh += 1;
        if (pushed >= topCap) break;
      }

      lastCursor = summary.endCursor ?? summary.afterCursor ?? null;
      const hasNext = summary.hasNextPage;
      log.info(`  top intent=${intent ?? 'null'} page=${page + 1} edges=${parsed.comments.length} fresh=${fresh} pushed=${pushed} hasNext=${hasNext}`);
      if (!lastCursor || hasNext === false) break;
      cursor = lastCursor;
      emptyStreak = parsed.comments.length === 0 ? emptyStreak + 1 : 0;
      if (emptyStreak >= 2) break;
      dryStreak = fresh === 0 ? dryStreak + 1 : 0;
      if (dryStreak >= 2) break;
      await sleep(settings.pageDelayMs + rnd(0, 300));
    }
  }

  // ── Reply walk ───────────────────────────────────────────────────────
  // Depth1 per parent, cursor-paged to the end. Verified 81/83 replies on a
  // public post in 9 requests, still without cookies.
  if (!blocked && !chargeStopped && settings.includeReplies
    && settings.maxRepliesPerPost > 0 && settings.maxReplyThreadsPerPost > 0
    && pushed < settings.maxCommentsPerPost && runPushed < affordableComments) {
    const candidates = postPushedRows
      .filter((r) => r.expansion_token && (Number(r.reply_count) > 0 || Number(r.comments_count) > 0))
      .sort((a, b) => Number(b.reply_count || b.comments_count || 0) - Number(a.reply_count || a.comments_count || 0))
      .slice(0, settings.maxReplyThreadsPerPost);
    for (const cand of candidates) {
      if (blocked || chargeStopped) break;
      if (replyPushed >= settings.maxRepliesPerPost || pushed >= settings.maxCommentsPerPost) break;
      let cursor = null;
      let emptyStreak = 0;
      for (let page = 0; page < settings.maxPagesPerPost; page += 1) {
        if (blocked || chargeStopped) break;
        if (replyPushed >= settings.maxRepliesPerPost || pushed >= settings.maxCommentsPerPost) break;
        const vars = buildDepth1Vars(postId, cand.source_comment_id, cand.expansion_token, postUrl, cursor, feedLocation);
        let raw;
        try {
          raw = await fetchGraphql({ boot, postUrl, vars, docId: DOC_REPLIES_DEPTH1, friendly: OP_REPLIES_DEPTH1 });
        } catch (e) { blocked = 'network:' + (e?.message || 'err'); break; }
        let payload = {};
        try { payload = JSON.parse(raw); } catch { payload = { parseError: raw.slice(0, 300) }; }
        if (isThrottle(payload)) {
          if (throttleRetryAllowed(throttles)) {
            throttles += 1;
            log.warning(`Throttle on reply ${cand.source_comment_id}, backing off 20-35s (${throttles}/3)`);
            await sleep(rnd(20000, 35000));
            continue;
          }
          blocked = 'facebook-throttle';
          break;
        }
        const parsed = parseCommentEdges(payload);
        const summary = summarizePayload(payload);
        replyPages += 1;
        let fresh = 0;
        for (const row of parsed.comments) {
          if (await pushRow(row, cand.source_comment_id, settings.maxCommentsPerPost)) {
            fresh += 1;
            replyPushed += 1;
          }
          if (pushed >= settings.maxCommentsPerPost || replyPushed >= settings.maxRepliesPerPost) break;
        }
        const cur = summary.endCursor ?? summary.afterCursor ?? null;
        log.info(`  reply ${cand.source_comment_id} page=${page + 1} edges=${parsed.comments.length} fresh=${fresh} replyPushed=${replyPushed} hasNext=${summary.hasNextPage}`);
        if (!cur || summary.hasNextPage === false) break;
        cursor = cur;
        emptyStreak = parsed.comments.length === 0 ? emptyStreak + 1 : 0;
        if (emptyStreak >= 2) break;
        await sleep(settings.pageDelayMs + rnd(0, 300));
      }
      replyThreads += 1;
      if (blocked || chargeStopped) break;
      if (replyPushed < settings.maxRepliesPerPost) await sleep(settings.pageDelayMs + rnd(0, 300));
    }
  }

  const rec = {
    record_type: 'summary',
    source_post_url: postUrl,
    source_post_id: postId,
    announcedComments,
    // How much of the announced thread we actually delivered. null when the
    // post page did not expose the announced count.
    coveragePercent: announcedComments ? Math.round((pushed / announcedComments) * 1000) / 10 : null,
    totalCount,
    pushed,
    topPages,
    replyPages,
    replyThreads,
    replyPushed,
    lastCursor,
    blocked,
    throttles,
    skippedKnown,
    queryMode: settings.queryMode,
    commentsSortOrder: settings.commentsSortOrder,
    feedLocation: settings.feedLocation || 'POST_PERMALINK_DIALOG',
    pageDelayMs: settings.pageDelayMs,
    unionSorts: settings.unionSorts,
  };
  runSummaries.push(rec);
  log.info(`Done post ${postId}: ${pushed} rows (${replyPushed} replies) in ${topPages} top + ${replyPages} reply pages${blocked ? ' blocked=' + blocked : ''}`);
};

// Worker pool: posts are independent, so a small pool cuts wall time without
// changing per-post pacing. Cursors, seen-sets and caps stay per post.
const concurrency = Math.max(1, Math.min(settings.maxConcurrency, uniquePostUrls.length));
if (concurrency > 1) log.info(`Processing ${uniquePostUrls.length} posts with concurrency ${concurrency}`);
let nextPostIndex = 0;
const workers = Array.from({ length: concurrency }, async () => {
  for (;;) {
    if (chargeStopped) return;
    const idx = nextPostIndex;
    nextPostIndex += 1;
    if (idx >= uniquePostUrls.length) return;
    try {
      await processPost(uniquePostUrls[idx], idx + 1);
    } catch (e) {
      log.warning(`Post failed: ${uniquePostUrls[idx]} - ${e?.message || e}`);
      runSummaries.push({ source_post_url: uniquePostUrls[idx], blocked: 'error:' + (e?.message || 'err'), pushed: 0 });
    }
  }
});
await Promise.all(workers);

await Actor.setValue('OUTPUT', { pushed: runPushed, posts: runSummaries.length, summaries: runSummaries });
// Persist the seen ids so the next run with the same store name stays incremental.
if (dedupeStore) {
  try {
    // Persist both what we already knew and everything pushed in this run.
    const ids = [...new Set([...knownCommentIds, ...runPushedKeys])].slice(-200000);
    await dedupeStore.setValue('seenCommentIds', ids);
    log.info(`Dedupe store ${settings.dedupeStoreName}: saved ${ids.length} comment ids`);
  } catch (e) {
    log.warning(`Could not persist dedupe store: ${e?.message || e}`);
  }
}
log.info('Run done: ' + runPushed + ' comments across ' + runSummaries.length + ' posts');
if (settings.failOnEmpty && runPushed === 0) {
  throw new Error('No comments collected and failOnEmpty=true — check the run log and OUTPUT summary.');
}
await Actor.exit();
