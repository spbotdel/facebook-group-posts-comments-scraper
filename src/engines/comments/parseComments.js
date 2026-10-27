// Pure parser: GraphQL comment payload -> flat comment rows. No network.
// Two-step pagination: root returns commentsIntentToken + commentsAfterCursor,
// next pages use after/expansion_token. Also captures per-comment expansion_token
// + replies_fields.total_count (GitHub c1/dz_omar shape: commentsIntentToken,
// commentsAfterCursor, expansion_token).
// Fresh CLCPQ shape (fbscrape hybrid, 2026): same Relay connection, but the
// parent post feedback id lives at data.node.id (top-level) and each comment
// carries legacy_fbid + comment_direct_parent + feedback.expansion_info.
// Reaction edges ship {node:{id}, reaction_count} without localized_name,
// so we map FB canonical reaction ids to names like fbscrape does.
export function decodeId(b64) {
  if (typeof b64 !== 'string' || !b64) return null;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(b64)) return null;
  try {
    const s = Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    if (!s || !/[\w:.-]/.test(s)) return null;
    return s;
  } catch { return null; }
}

// FB canonical reaction ids -> names (fbscrape response.py). Comment endpoints
// ship only node.id + reaction_count, no localized_name. Unknown ids pass
// through under reactions_other so we never silently zero the breakdown.
export const REACTION_ID_TO_NAME = {
  1635855486666999: 'like',
  1678524932434102: 'love',
  115940658764963: 'haha',
  1885436228231891: 'wow',
  1538317126927996: 'sad',
  478547315650144: 'angry',
  613557422527858: 'care',
};

export function decodeB64Legacy(b64Id) {
  const dec = decodeId(b64Id);
  if (!dec || dec.indexOf(':') < 0) return null;
  const tail = dec.split(':')[1];
  return tail || null;
}

// Pull http(s) links out of comment text. Competitors (crowdpull) expose this
// for lead generation; cheap to compute, no extra requests.
export function extractUrls(text) {
  if (typeof text !== 'string' || !text) return null;
  const matches = text.match(/https?:\/\/[^\s<>"'\])]+/gi);
  if (!matches || !matches.length) return null;
  const cleaned = matches.map((u) => u.replace(/[.,;:!?]+$/, ''));
  const unique = [...new Set(cleaned)];
  return unique.length ? unique : null;
}

// Unescape a JSON string fragment captured without its surrounding quotes.
export function decodeJsonString(raw) {
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(`"${raw}"`); } catch { return null; }
}

export function decodeHtmlEntities(text) {
  return String(text ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// Post caption straight from the permalink HTML. Feed-style pages carry
// "message":{"text":...}; older surfaces only have the og:description meta.
export function extractPostText(html) {
  if (typeof html !== 'string' || !html) return null;
  const message = html.match(/"message":\{"text":"((?:[^"\\]|\\.){20,})"/);
  if (message) {
    const decoded = decodeJsonString(message[1]);
    if (decoded && decoded.trim().length > 10) return decoded;
  }
  const og = html.match(/<meta property="og:description" content="([^"]{20,})"/);
  if (og) {
    const decoded = decodeHtmlEntities(og[1]);
    if (decoded && decoded.trim().length > 10) return decoded;
  }
  return null;
}

// Sum id-keyed reaction edges: [{node:{id}, reaction_count}] -> {total, byName, other}.
export function sumIdKeyedReactions(node) {
  try {
    const edges = node?.feedback?.top_reactions?.edges;
    if (!Array.isArray(edges) || !edges.length) return null;
    let total = 0;
    const byName = {};
    const other = {};
    for (const e of edges) {
      const rid = String(e?.node?.id ?? e?.node ?? '');
      const cnt = Number(e?.reaction_count ?? 0) || 0;
      if (!rid || cnt <= 0) continue;
      total += cnt;
      const name = REACTION_ID_TO_NAME[rid] || REACTION_ID_TO_NAME[Number(rid)];
      if (name) byName[name] = (byName[name] || 0) + cnt;
      else other[rid] = (other[rid] || 0) + cnt;
    }
    if (total <= 0) return null;
    return { total, byName, other };
  } catch { return null; }
}

export function pickText(node) {
  if (!node || typeof node !== 'object') return null;
  const cands = [
    node?.body?.text,
    node?.comment?.body?.text,
    node?.text,
  ];
  for (const c of cands) if (typeof c === 'string' && c.length) return c;
  return null;
}

export function pickAuthor(node) {
  const a = node?.author || node?.commenter || node?.comment?.author || null;
  if (!a || typeof a !== 'object') return { id: null, name: null, url: null };
  return {
    id: a.id ?? null,
    name: a.name ?? null,
    url: a.url ?? a.profile_url ?? null,
    picture: a.profile_picture_depth_0?.uri ?? a.profile_picture?.uri ?? a.profile_picture ?? a.picture ?? null,
  };
}

export function pickTime(node) {
  return node?.created_time ?? node?.comment?.created_time ?? node?.created_at ?? node?.created_time_unix ?? null;
}

// Real like totals live in feedback.top_reactions edges (sum) or reactors count.
export function sumTopReactions(node) {
  try {
    const edges = node?.feedback?.top_reactions?.edges;
    if (Array.isArray(edges) && edges.length) {
      let t = 0;
      for (const e of edges) {
        // Fresh CLCPQ edges ship reaction_count at edge level (no localized
        // names); legacy pager ships it the same way. Sum either.
        t += Number(e?.reaction_count ?? e?.node?.reaction_count ?? 0) || 0;
      }
      if (t > 0) return t;
    }
  } catch { /* ignore */ }
  const rc = node?.feedback?.reactors?.count ?? node?.feedback?.reactors?.count_reduced ?? null;
  const n = Number(rc);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function pickReactions(node) {
  const r = node?.reaction_count ?? node?.comment?.reaction_count ?? node?.feedback?.reaction_count ?? node?.like_count ?? node?.total_reactions ?? sumTopReactions(node);
  if (r == null) return { total: null, count: null };
  const n = Number(r);
  if (Number.isFinite(n)) return { total: n, count: n };
  if (typeof r === 'object') return { total: Number(r.count ?? r.total_count ?? NaN) || null, count: Number(r.count ?? NaN) || null };
  return { total: null, count: null };
}

// commentUrl like the leaders: postUrl?comment_id=ID (+ &reply_comment_id= for replies).
export function buildCommentUrl(postUrl, commentId, parentId) {
  if (!postUrl || !commentId) return null;
  const base = String(postUrl).split('?')[0].replace(/\/$/, '');
  if (parentId && parentId !== commentId) return `${base}?comment_id=${parentId}&reply_comment_id=${commentId}`;
  return `${base}?comment_id=${commentId}`;
}

export function toIso(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  try { return new Date(n * 1000).toISOString(); } catch { return null; }
}

export function parseCommentEdges(payload) {
  const comments = [];
  const root = payload?.data?.node ?? null;
  const inst = root?.comment_rendering_instance_for_feed_location ?? root?.comment_rendering_instance ?? null;
  // Depth1/Depth2 reply pages put the connection straight on the node:
  // data.node.replies_connection.edges (verified on public posts 2026-09-30).
  const bag = inst?.comments ?? root?.replies_connection ?? root?.comments ?? null;
  if (!bag || typeof bag !== 'object') {
    return {
      comments, pageInfo: null, totalCount: null, count: null, pageSize: null,
      intentToken: null, afterCursor: null, expansionToken: null,
    };
  }
  const edges = Array.isArray(bag.edges) ? bag.edges : [];
  for (const e of edges) {
    const node = e?.node ?? e;
    if (!node || typeof node !== 'object') continue;
    if (node.id == null && node.body == null && node.comment == null && node.text == null && node.author == null) continue;
    const rawId = node.id ?? null;
    const decoded = decodeId(rawId);
    let commentId = null;
    let parentHint = null;
    if (decoded) {
      const m = decoded.match(/comment:(\d+)_(\d+)/);
      if (m) { parentHint = m[1]; commentId = m[2]; }
      else { const n = decoded.match(/(\d{8,25})/); if (n) commentId = n[1]; }
    }
    const author = pickAuthor(node);
    const rx = pickReactions(node);
    // Per-type reaction split (like/love/haha/wow/sad/angry/care). Only the
    // id-keyed fresh payload carries it; legacy pages fall back to null.
    const rxBreakdown = sumIdKeyedReactions(node)?.byName ?? null;
    const created = pickTime(node);
    const commentText = pickText(node);
    const replyCount = Number(node?.reply_count ?? node?.comment?.reply_count ?? node?.feedback?.replies_fields?.total_count ?? node?.replies_fields?.total_count ?? node?.commentsCount ?? NaN) || null;
    const expansionToken = node?.expansion_token ?? node?.comment?.expansion_token ?? node?.feedback?.expansion_info?.expansion_token ?? e?.expansion_token ?? e?.node?.feedback?.expansion_info?.expansion_token ?? null;
    // Nested replies embedded in the same payload (feedback.replies_connection
    // or comment.replies edges). Flattened with parent linkage, like c1 output.
    const replyEdges = node?.feedback?.replies_connection?.edges
      ?? node?.comment?.replies?.edges ?? node?.replies?.edges ?? [];
    // comment_direct_parent.id usually ships base64 ("comment:POST_PARENT");
    // decode it so parent_comment_id matches the numeric ids we push.
    let parentCommentId = node?.comment_direct_parent?.id ?? null;
    if (parentCommentId) {
      const decParent = decodeId(parentCommentId);
      if (decParent) {
        // "comment:POST_PARENT" -> PARENT is the last numeric run.
        const pm = decParent.match(/(\d+)$/);
        if (pm) parentCommentId = pm[1];
      }
    }
    comments.push({
      source_comment_id: commentId || (node?.legacy_fbid ? String(node.legacy_fbid) : null),
      raw_id: rawId,
      decoded_id: decoded,
      post_hint: parentHint,
      parent_comment_id: parentCommentId,
      depth: Number.isFinite(Number(node?.depth)) ? Number(node?.depth) : 0,
      author_id: author.id,
      author_name: author.name,
      author_url: author.url,
      author_picture: author.picture ?? null,
      created_time: created,
      created_at: toIso(created),
      raw_text: commentText,
      extracted_urls: extractUrls(commentText),
      reactions: rx.total,
      likes: rx.total,
      reactions_breakdown: rxBreakdown,
      reply_count: replyCount,
      comments_count: replyCount,
      expansion_token: expansionToken,
      feedback_url: node?.feedback?.url ?? null,
    });
    if (Array.isArray(replyEdges)) {
      for (const re of replyEdges) {
        const rn = re?.node ?? re;
        if (!rn || typeof rn !== 'object') continue;
        const rRaw = rn.id ?? null;
        const rDec = decodeId(rRaw);
        let rId = null;
        if (rDec) {
          const m = rDec.match(/comment:(\d+)_(\d+)/);
          if (m) rId = m[2];
          else { const n = rDec.match(/(\d{8,25})/); if (n) rId = n[1]; }
        }
        const rAuthor = pickAuthor(rn);
        const rRx = pickReactions(rn);
        const rBreakdown = sumIdKeyedReactions(rn)?.byName ?? null;
        const rCreated = pickTime(rn);
        const replyText = pickText(rn);
        comments.push({
          source_comment_id: rId || (rn?.legacy_fbid ? String(rn.legacy_fbid) : null),
          raw_id: rRaw,
          decoded_id: rDec,
          post_hint: parentHint,
          parent_comment_id: commentId || (node?.legacy_fbid ? String(node.legacy_fbid) : null),
          depth: (Number.isFinite(Number(node?.depth)) ? Number(node?.depth) : 0) + 1,
          author_id: rAuthor.id,
          author_name: rAuthor.name,
          author_url: rAuthor.url,
          author_picture: rAuthor.picture ?? null,
          created_time: rCreated,
          created_at: toIso(rCreated),
          raw_text: replyText,
          extracted_urls: extractUrls(replyText),
          reactions: rRx.total,
          likes: rRx.total,
          reactions_breakdown: rBreakdown,
          reply_count: null,
          comments_count: null,
          expansion_token: rn?.feedback?.expansion_info?.expansion_token ?? re?.expansion_token ?? null,
          feedback_url: rn?.feedback?.url ?? null,
        });
      }
    }
  }
  return {
    comments,
    pageInfo: bag.page_info ?? bag.pageInfo ?? null,
    totalCount: bag.total_count ?? bag.totalCount ?? null,
    count: bag.count ?? null,
    pageSize: bag.page_size ?? bag.pageSize ?? null,
    intentToken: bag.selected_intent?.intent_token ?? inst?.selected_intent?.intent_token
      ?? bag.comments_intent_token ?? inst?.comments_intent_token ?? null,
    afterCursor: bag.comments_after_cursor ?? inst?.comments_after_cursor ?? null,
    expansionToken: inst?.expansion_token ?? bag?.expansion_token ?? null,
  };
}

export function summarizePayload(payload) {
  const p = parseCommentEdges(payload);
  return {
    totalCount: p.totalCount,
    count: p.count,
    pageSize: p.pageSize,
    intentToken: p.intentToken,
    afterCursor: p.afterCursor ?? null,
    expansionToken: p.expansionToken ?? null,
    hasNextPage: p.pageInfo?.has_next_page ?? p.pageInfo?.hasNextPage ?? null,
    endCursor: p.pageInfo?.end_cursor ?? p.pageInfo?.endCursor ?? null,
    commentCount: p.comments.length,
  };
}
