export const GROUP_ACTOR_ID = 'XDc1k7IiQDXscg6Ua';
export const COMMENTS_ACTOR_ID = 'HQBqPtJysSNempWbU';
export const PROFILE_ACTOR_ID = 'TOCoIcvomaY7wczw7';
export const GROUP_BATCH_SIZE = 10;
export const PROFILE_BATCH_SIZE = 20;
export const DEFAULT_POST_PRICE_USD = 0.003;
export const DEFAULT_COMMENT_PRICE_USD = 0.001;
export const DEFAULT_START_PRICE_USD = 0.005;

// Defaults copied from the vendored engines' Apify input schemas. In child-Actor
// mode the platform injected them; in-process mode must pass them explicitly
// to keep scraping behavior identical.
export const GROUP_ENGINE_DEFAULTS = {
    expandAllPhotos: true,
    includeRawPayload: false,
    paginationMode: 'ranked_snapshot',
    maxCandidates: 0,
    maxPages: 0,
    bootstrapRetries: 4,
    graphqlPageRetries: 2,
    proxyCountry: 'US',
    mediaSetRetries: 1,
    mediaSetRetryDelayMs: 800,
    mediaExpansionConcurrency: 3,
    mediaExpansionAdaptive: true,
    mediaDeferredRetry: true,
    mediaDeferredRetryConcurrency: 2,
    mediaDeferredRetryExtraRetries: 2,
    mediaDeferredRetryDelayMs: 1500,
    debug: false,
    discoverBundles: false,
};
export const PROFILE_ENGINE_DEFAULTS = {
    expandAllPhotos: true,
    omitPinnedPosts: true,
    includeRawPayload: false,
    includeUnavailablePosts: false,
    bootstrapRetries: 4,
    graphqlPageRetries: 4,
    proxyCountry: 'US',
    fallbackProxyCountries: ['DE', 'GB', 'NL'],
    mediaExpansionConcurrency: 3,
    mediaSetRetries: 1,
    debug: false,
};
export const COMMENTS_ENGINE_DEFAULTS = {
    queryMode: 'FRESH_LIST',
    failOnEmpty: false,
    maxPagesPerPost: 60,
    introDelayMs: 1500,
    proxyCountry: 'US',
    proxyGroups: ['RESIDENTIAL'],
    minCommentsPerPost: 0,
};

const COMMENT_MODES = new Set(['none', 'inline', 'full']);
const OUTPUT_MODES = new Set(['nested', 'separate']);
const SORT_MODES = new Set(['CHRONOLOGICAL', 'RECENT_ACTIVITY', 'TOP_POSTS', 'CHRONOLOGICAL_LISTINGS']);
const SEARCH_MODES = new Set(['LOCAL', 'HISTORY_SCAN']);

function integer(input, name, fallback, min, max) {
    const raw = input?.[name];
    if (raw === undefined || raw === null || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`Invalid ${name}: expected an integer.`);
    }
    if (value < min || value > max) {
        throw new Error(`Invalid ${name}: ${value}. Supported range is ${min}..${max}.`);
    }
    return value;
}

function enumValue(input, name, fallback, allowed) {
    const value = input?.[name] || fallback;
    if (!allowed.has(value)) throw new Error(`Invalid ${name}: ${value}.`);
    return value;
}

function booleanValue(input, name, fallback) {
    const value = input?.[name];
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
    throw new Error(`Invalid ${name}: expected a boolean.`);
}

function relativeDateToIso(value, now = Date.now()) {
    const match = String(value || '').trim().match(
        /^(\d+(?:\.\d+)?)\s*(minute|minutes|hour|hours|day|days|week|weeks|month|months)$/i,
    );
    if (!match) return null;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = {
        minute: 60 * 1000,
        minutes: 60 * 1000,
        hour: 60 * 60 * 1000,
        hours: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        days: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        weeks: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        months: 30 * 24 * 60 * 60 * 1000,
    };
    if (!Number.isFinite(amount) || amount < 0) return null;
    return new Date(now - amount * multipliers[unit]).toISOString();
}

export function dateBoundaryToTimestamp(value, now = Date.now()) {
    if (value === undefined || value === null || value === '') return null;
    const relative = relativeDateToIso(value, now);
    const timestamp = Date.parse(relative || String(value));
    if (!Number.isFinite(timestamp)) throw new Error(`Invalid date boundary: ${value}`);
    return timestamp;
}

export function dateBoundaryToIso(value, now = Date.now()) {
    const timestamp = dateBoundaryToTimestamp(value, now);
    return timestamp === null ? null : new Date(timestamp).toISOString();
}

export function normalizeStartUrl(value) {
    const raw = typeof value === 'string' ? value : value?.url;
    if (!raw || typeof raw !== 'string') throw new Error('startUrls must contain strings or { url } objects.');
    const url = new URL(raw);
    const allowedHosts = new Set(['facebook.com', 'www.facebook.com', 'web.facebook.com', 'm.facebook.com']);
    if (!allowedHosts.has(url.hostname.toLowerCase())) throw new Error(`Invalid Facebook URL: ${raw}`);
    if (url.protocol !== 'https:') throw new Error(`Facebook URLs must use HTTPS: ${raw}`);
    if (url.username || url.password) throw new Error(`Facebook URLs must not contain credentials: ${raw}`);
    if (['/l.php', '/share.php', '/login.php', '/checkpoint'].includes(url.pathname.toLowerCase())) {
        throw new Error(`Facebook redirect and login URLs are not supported: ${raw}`);
    }
    url.hostname = 'www.facebook.com';
    url.hash = '';
    for (const key of ['__cft__', '__tn__', 'mibextid', 'ref', 'refid', 'sfnsn', 'rdid']) {
        url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    const normalizedUrl = url.toString();
    const explicit = value?.surfaceType
        || value?.userData?.surfaceType
        || value?.userData?.type
        || value?.type
        || null;
    const inferred = url.pathname.startsWith('/groups/')
        ? 'group'
        : (/\/people\//i.test(url.pathname) || /profile\.php/i.test(url.pathname) ? 'profile' : 'page');
    const surfaceType = explicit || inferred;
    if (!['group', 'page', 'profile'].includes(surfaceType)) {
        throw new Error(`Invalid surfaceType for ${raw}: ${surfaceType}.`);
    }
    return { url: normalizedUrl, surfaceType };
}

export function readSettings(input) {
    const startUrls = [];
    const seenUrls = new Set();
    for (const value of input?.startUrls || []) {
        const normalized = normalizeStartUrl(value);
        if (seenUrls.has(normalized.url)) continue;
        seenUrls.add(normalized.url);
        startUrls.push(normalized);
    }
    if (!startUrls.length) throw new Error('startUrls is required.');
    const commentsMode = enumValue(input, 'commentsMode', 'full', COMMENT_MODES);
    const commentsOutput = enumValue(input, 'commentsOutput', 'nested', OUTPUT_MODES);
    const sortMode = enumValue(input, 'sortMode', 'CHRONOLOGICAL', SORT_MODES);
    const searchMode = enumValue(input, 'searchMode', 'LOCAL', SEARCH_MODES);
    const search = String(input?.search || '').trim().toLowerCase();
    const startCursor = input?.startCursor ? String(input.startCursor).trim() : null;
    if (searchMode === 'HISTORY_SCAN' && !search) {
        throw new Error('search is required when searchMode=HISTORY_SCAN.');
    }
    if (startCursor && startUrls.length !== 1) {
        throw new Error('startCursor can be used only when startUrls contains exactly one URL.');
    }
    const proxyCountry = String(input?.proxyCountry || 'US').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(proxyCountry)) {
        throw new Error(`Invalid proxyCountry: ${input?.proxyCountry}. Expected a two-letter country code.`);
    }
    return {
        startUrls,
        groupUrls: startUrls.filter((item) => item.surfaceType === 'group').map((item) => item.url),
        pageUrls: startUrls.filter((item) => item.surfaceType === 'page').map((item) => item.url),
        profileUrls: startUrls.filter((item) => item.surfaceType === 'profile').map((item) => item.url),
        maxPostsPerGroup: integer(input, 'maxPostsPerGroup', 30, 1, 1000),
        sortMode,
        onlyPostsNewerThan: input?.onlyPostsNewerThan || null,
        onlyPostsOlderThan: input?.onlyPostsOlderThan || null,
        knownPostIds: Array.isArray(input?.knownPostIds) ? input.knownPostIds.map(String) : [],
        search,
        searchMode,
        searchMaxPostsPerSurface: integer(input, 'searchMaxPostsPerSurface', 300, 1, 1000),
        maxSearchResults: integer(input, 'maxSearchResults', 100, 1, 1000),
        minComments: integer(input, 'minComments', 0, 0, 1000000),
        minReactions: integer(input, 'minReactions', 0, 0, 1000000),
        filterAuthor: String(input?.filterAuthor || '').trim().toLowerCase(),
        startCursor,
        commentsMode,
        maxCommentsPerPost: integer(input, 'maxCommentsPerPost', 50, 1, 1000),
        includeReplies: booleanValue(input, 'includeReplies', true),
        maxReplyThreadsPerPost: integer(input, 'maxReplyThreadsPerPost', 20, 0, 200),
        maxRepliesPerPost: integer(input, 'maxRepliesPerPost', 100, 0, 1000),
        commentsConcurrency: integer(input, 'commentsConcurrency', 5, 1, 20),
        commentsSortOrder: enumValue(
            input,
            'commentsSortOrder',
            'MOST_RELEVANT',
            new Set(['MOST_RELEVANT', 'NEWEST', 'ALL_COMMENTS']),
        ),
        unionSorts: booleanValue(input, 'unionSorts', true),
        onlyCommentsNewerThan: input?.onlyCommentsNewerThan || null,
        commentTextSearch: String(input?.commentTextSearch || '').trim().toLowerCase(),
        minCommentReactions: integer(input, 'minCommentReactions', 0, 0, 1000000),
        includePostTextInCommentRows: booleanValue(input, 'includePostTextInCommentRows', false),
        commentsOutput,
        proxyTier: enumValue(input, 'proxyTier', 'auto', new Set(['auto', 'datacenter', 'residential'])),
        proxyCountry,
        dedupeStoreName: input?.dedupeStoreName ? String(input.dedupeStoreName) : null,
        failOnEmpty: booleanValue(input, 'failOnEmpty', false),
    };
}

export function buildGroupInput(settings, groupUrls = settings.groupUrls) {
    if (groupUrls.length > GROUP_BATCH_SIZE) {
        throw new Error(`Group batches cannot exceed ${GROUP_BATCH_SIZE} URLs.`);
    }
    const maxPosts = settings.searchMode === 'HISTORY_SCAN'
        ? settings.searchMaxPostsPerSurface
        : settings.maxPostsPerGroup;
    const input = {
        ...GROUP_ENGINE_DEFAULTS,
        groupUrls,
        maxGroupsPerRun: groupUrls.length,
        maxPostsPerGroup: maxPosts,
        onlyPostsNewerThan: dateBoundaryToIso(settings.onlyPostsNewerThan),
        onlyPostsOlderThan: dateBoundaryToIso(settings.onlyPostsOlderThan),
        knownPostIds: settings.searchMode === 'HISTORY_SCAN' ? [] : settings.knownPostIds,
        startCursor: settings.startCursor,
        paginationMode: 'cursor_page',
        expandAllPhotos: false,
        proxyTier: settings.proxyTier,
    };
    if (settings.sortMode !== 'CHRONOLOGICAL_LISTINGS') input.sortMode = settings.sortMode;
    else input.sortingSetting = 'CHRONOLOGICAL_LISTINGS';
    return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null && value !== ''));
}

function buildProfileEngineInput(settings, urls) {
    if (urls.length > PROFILE_BATCH_SIZE) {
        throw new Error(`Page/profile batches cannot exceed ${PROFILE_BATCH_SIZE} URLs.`);
    }
    const maxPosts = settings.searchMode === 'HISTORY_SCAN'
        ? settings.searchMaxPostsPerSurface
        : settings.maxPostsPerGroup;
    return Object.fromEntries(Object.entries({
        ...PROFILE_ENGINE_DEFAULTS,
        profileUrls: urls,
        maxProfilesPerRun: urls.length,
        maxPostsPerProfile: maxPosts,
        expandAllPhotos: false,
        omitPinnedPosts: true,
        knownPostIds: settings.searchMode === 'HISTORY_SCAN' ? [] : settings.knownPostIds,
        sinceDate: dateBoundaryToIso(settings.onlyPostsNewerThan),
        startCursor: settings.startCursor,
        proxyCountry: settings.proxyCountry,
        bootstrapRetries: 4,
        graphqlPageRetries: 4,
    }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

export function buildPageInput(settings, pageUrls = settings.pageUrls) {
    return buildProfileEngineInput(settings, pageUrls);
}

export function buildProfileInput(settings, profileUrls = settings.profileUrls) {
    return buildProfileEngineInput(settings, profileUrls);
}

export function buildCommentsInput(settings, postUrls, dedupeStoreName = settings.dedupeStoreName) {
    const commentLimit = settings.commentsMode === 'inline'
        ? Math.min(3, settings.maxCommentsPerPost)
        : settings.maxCommentsPerPost;
    return Object.fromEntries(Object.entries({
        ...COMMENTS_ENGINE_DEFAULTS,
        postUrls,
        maxPostsPerRun: postUrls.length,
        maxConcurrency: settings.commentsConcurrency,
        maxCommentsPerPost: commentLimit,
        includeReplies: settings.commentsMode === 'full' && settings.includeReplies,
        maxReplyThreadsPerPost: settings.maxReplyThreadsPerPost,
        maxRepliesPerPost: Math.min(settings.maxRepliesPerPost, commentLimit),
        commentsSortOrder: settings.commentsSortOrder,
        unionSorts: settings.unionSorts,
        onlyCommentsNewerThan: settings.onlyCommentsNewerThan,
        pageDelayMs: 1000,
        proxyTier: settings.proxyTier,
        dedupeStoreName,
        includePostText: settings.includePostTextInCommentRows,
    }).filter(([, value]) => value !== null && value !== undefined && value !== ''));
}

export function postUrlOf(row) {
    return row?.source_url || row?.post_url || row?.url || null;
}

export function postIdOf(row) {
    return row?.source_post_id || row?.post_id || null;
}

export function commentPostUrlOf(row) {
    return row?.source_post_url || row?.input_url || null;
}

export function commentPostIdOf(row) {
    return row?.source_post_id || null;
}

export function normalizeSurfacePost(row, surfaceType) {
    if (!row || typeof row !== 'object') return null;
    if (row.source_post_id || row.source_url) {
        return { ...row, record_type: row.record_type || 'post', surface_type: surfaceType };
    }
    const sourceUrl = row.url || row.postUrl || row.topLevelUrl || row.inputUrl || row.post_url || null;
    const sourcePostId = row.postId || row.post_id || row.id || null;
    const author = row.user || row.author || null;
    return {
        record_type: 'post',
        source_platform: 'facebook',
        surface_type: surfaceType,
        source_post_id: sourcePostId ? String(sourcePostId) : null,
        source_url: sourceUrl,
        created_at: row.time || row.created_at || null,
        raw_text: row.text || row.raw_text || '',
        author: author ? {
            id: author.id || author.profileId || null,
            name: author.name || author.profileName || null,
            url: author.profileUrl || author.url || null,
            picture: author.profilePic || author.picture || null,
        } : null,
        stats: {
            reactions: row.likes ?? row.reactions ?? row.stats?.reactions ?? null,
            comments: row.comments ?? row.stats?.comments ?? null,
            shares: row.shares ?? row.stats?.shares ?? null,
        },
        media: row.media || row.attachments || [],
    };
}

export function groupComments(comments) {
    const byUrl = new Map();
    const byId = new Map();
    for (const comment of comments || []) {
        const url = commentPostUrlOf(comment);
        const id = commentPostIdOf(comment);
        if (url) {
            if (!byUrl.has(url)) byUrl.set(url, []);
            byUrl.get(url).push(comment);
        }
        if (id) {
            if (!byId.has(id)) byId.set(id, []);
            byId.get(id).push(comment);
        }
    }
    return { byUrl, byId };
}

export function commentsForPost(post, grouped) {
    const byUrl = postUrlOf(post);
    const byId = postIdOf(post);
    return (byUrl && grouped.byUrl.get(byUrl)) || (byId && grouped.byId.get(byId)) || [];
}

export function filterPosts(posts, search) {
    if (!search) return posts;
    return posts.filter((post) => String(post?.raw_text || '').toLowerCase().includes(search));
}

export function filterPostsByDate(posts, newerThan, olderThan, now = Date.now()) {
    const lower = dateBoundaryToTimestamp(newerThan, now);
    const upper = dateBoundaryToTimestamp(olderThan, now);
    if (lower === null && upper === null) return posts;
    return posts.filter((post) => {
        const value = post?.created_at
            || post?.creation_time
            || post?.time
            || post?.timestamp
            || null;
        const numericValue = value === null || value === undefined || value === '' ? NaN : Number(value);
        const timestamp = Number.isFinite(numericValue)
            ? (numericValue < 100000000000 ? numericValue * 1000 : numericValue)
            : Date.parse(String(value || ''));
        if (!Number.isFinite(timestamp)) return false;
        if (lower !== null && timestamp < lower) return false;
        if (upper !== null && timestamp >= upper) return false;
        return true;
    });
}

export function calculatePostBudget({
    maxTotalChargeUsd,
    spentUsd = 0,
    postPriceUsd = DEFAULT_POST_PRICE_USD,
    commentPriceUsd = DEFAULT_COMMENT_PRICE_USD,
    requestedCommentsPerPost = 0,
    surfaceCount,
    requestedPostsPerSurface,
}) {
    const surfaces = Math.max(0, Math.floor(Number(surfaceCount) || 0));
    const requestedPerSurface = Math.max(0, Math.floor(Number(requestedPostsPerSurface) || 0));
    const totalRequested = surfaces * requestedPerSurface;
    const maxCharge = Number(maxTotalChargeUsd);
    const price = Number(postPriceUsd);
    const alreadySpent = Math.max(0, Number(spentUsd) || 0);

    if (!surfaces || !requestedPerSurface) {
        return {
            limited: false,
            acceptedSurfaces: surfaces,
            skippedSurfaces: 0,
            postsPerSurface: requestedPerSurface,
            requestedTotal: totalRequested,
            affordableTotal: 0,
            remainingAfterPostsUsd: Math.max(0, maxCharge - alreadySpent),
        };
    }

    if (!Number.isFinite(maxCharge)) {
        return {
            limited: false,
            acceptedSurfaces: surfaces,
            skippedSurfaces: 0,
            postsPerSurface: requestedPerSurface,
            requestedTotal,
            affordableTotal: totalRequested,
            remainingAfterPostsUsd: Number.isFinite(maxCharge)
                ? Math.max(0, maxCharge - alreadySpent - totalRequested * price)
                : Infinity,
        };
    }

    const remaining = Math.max(0, maxCharge - alreadySpent);
    if (maxCharge <= 0 || !Number.isFinite(price) || price <= 0) {
        return {
            limited: true,
            acceptedSurfaces: 0,
            skippedSurfaces: surfaces,
            postsPerSurface: 0,
            requestedTotal: totalRequested,
            affordableTotal: 0,
            commentsReserveUsd: 0,
            remainingAfterPostsUsd: remaining,
        };
    }

    const requestedComments = Math.max(0, Math.floor(Number(requestedCommentsPerPost) || 0));
    const commentsReserveUsd = requestedComments && Number.isFinite(Number(commentPriceUsd))
        ? Math.min(
            remaining / 2,
            totalRequested * requestedComments * Math.max(0, Number(commentPriceUsd)),
        )
        : 0;
    const postSpendBudget = Math.max(0, remaining - commentsReserveUsd);
    const affordableTotal = Math.min(
        totalRequested,
        Math.floor((postSpendBudget + Number.EPSILON) / price),
    );
    const acceptedSurfaces = Math.min(surfaces, affordableTotal);
    const postsPerSurface = acceptedSurfaces
        ? Math.min(requestedPerSurface, Math.floor(affordableTotal / acceptedSurfaces))
        : 0;
    const plannedPosts = acceptedSurfaces * postsPerSurface;

    return {
        limited: acceptedSurfaces < surfaces || postsPerSurface < requestedPerSurface,
        acceptedSurfaces,
        skippedSurfaces: surfaces - acceptedSurfaces,
        postsPerSurface,
        requestedTotal: totalRequested,
        affordableTotal,
        commentsReserveUsd,
        remainingAfterPostsUsd: Math.max(0, remaining - plannedPosts * price),
    };
}

export function calculateCommentLimit({
    maxTotalChargeUsd,
    spentUsd = 0,
    postCount,
    postPriceUsd = DEFAULT_POST_PRICE_USD,
    commentPriceUsd = DEFAULT_COMMENT_PRICE_USD,
    requestedCommentsPerPost,
}) {
    const posts = Math.max(0, Math.floor(Number(postCount) || 0));
    const requestedPerPost = Math.max(0, Math.floor(Number(requestedCommentsPerPost) || 0));
    const price = Number(commentPriceUsd);
    const maxCharge = Number(maxTotalChargeUsd);
    const alreadySpent = Math.max(0, Number(spentUsd) || 0);
    const postReserve = posts * Math.max(0, Number(postPriceUsd) || 0);

    if (!posts || !requestedPerPost) {
        return {
            limited: false,
            requestedTotal: posts * requestedPerPost,
            affordableTotal: 0,
            commentsPerPost: requestedPerPost,
        };
    }

    if (!Number.isFinite(maxCharge)) {
        return {
            limited: false,
            requestedTotal: posts * requestedPerPost,
            affordableTotal: posts * requestedPerPost,
            commentsPerPost: requestedPerPost,
        };
    }

    if (maxCharge <= 0 || !Number.isFinite(price) || price <= 0) {
        return {
            limited: true,
            requestedTotal: posts * requestedPerPost,
            affordableTotal: 0,
            commentsPerPost: 0,
        };
    }

    const remaining = Math.max(0, maxCharge - alreadySpent - postReserve);
    const affordableTotal = Math.min(
        posts * requestedPerPost,
        Math.floor((remaining + Number.EPSILON) / price),
    );
    const commentsPerPost = Math.min(requestedPerPost, Math.floor(affordableTotal / posts));

    return {
        limited: commentsPerPost < requestedPerPost,
        requestedTotal: posts * requestedPerPost,
        affordableTotal,
        commentsPerPost,
    };
}

function postCommentsCount(post) {
    const value = post?.stats?.comments
        ?? post?.comments_count
        ?? post?.commentsCount
        ?? post?.feedback?.comment_count
        ?? null;
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function postReactionsCount(post) {
    const value = post?.stats?.reactions
        ?? post?.reactions_count
        ?? post?.reactions
        ?? post?.likes
        ?? null;
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function filterPostsByEngagement(posts, {
    minComments = 0,
    minReactions = 0,
    filterAuthor = '',
} = {}) {
    const authorNeedle = String(filterAuthor || '').trim().toLowerCase();
    return posts.filter((post) => {
        const commentsCount = postCommentsCount(post);
        const reactionsCount = postReactionsCount(post);
        if (minComments > 0 && commentsCount !== null && commentsCount < minComments) {
            return false;
        }
        if (minReactions > 0 && reactionsCount !== null && reactionsCount < minReactions) {
            return false;
        }
        if (authorNeedle) {
            const authorText = [
                post?.author?.name,
                post?.author?.url,
                post?.author_name,
                post?.author_url,
            ].filter(Boolean).join(' ').toLowerCase();
            if (!authorText.includes(authorNeedle)) return false;
        }
        return true;
    });
}

function commentReactionsCount(comment) {
    const direct = Number(comment?.reactions ?? comment?.likes ?? comment?.reaction_count ?? 0);
    if (Number.isFinite(direct) && direct > 0) return direct;
    const breakdown = comment?.reactions_breakdown;
    if (!breakdown || typeof breakdown !== 'object') return 0;
    return Object.values(breakdown).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function filterComments(comments, {
    commentTextSearch = '',
    minCommentReactions = 0,
} = {}) {
    const textNeedle = String(commentTextSearch || '').trim().toLowerCase();
    return comments.filter((comment) => {
        if (comment?.record_type === 'summary') return true;
        if (textNeedle) {
            const text = String(comment?.raw_text || comment?.text || '').toLowerCase();
            if (!text.includes(textNeedle)) return false;
        }
        if (minCommentReactions > 0 && commentReactionsCount(comment) < minCommentReactions) {
            return false;
        }
        return true;
    });
}

export function applyPostSelection(posts, settings) {
    let selected = filterPosts(posts, settings.search);
    selected = filterPostsByEngagement(selected, settings);
    if (settings.searchMode === 'HISTORY_SCAN') {
        selected = selected.slice(0, settings.maxSearchResults);
    }
    return selected;
}

export function mergePostsAndComments(posts, comments, outputMode = 'nested') {
    const grouped = groupComments(comments);
    const nested = posts.map((post) => {
        const postComments = commentsForPost(post, grouped);
        const summary = postComments.find((item) => item.record_type === 'summary') || null;
        const actualComments = postComments.filter((item) => item.record_type !== 'summary');
        const collected = actualComments.length;
        const announcedValue = summary?.announcedComments;
        const announced = announcedValue === null || announcedValue === undefined || announcedValue === ''
            ? null
            : Number(announcedValue);
        return {
            ...post,
            record_type: post.record_type || 'post',
            comments: actualComments,
            comments_collected: collected,
            comments_collected_before_filters: Number.isFinite(Number(summary?.pushed))
                ? Number(summary.pushed)
                : actualComments.length,
            comments_announced: Number.isFinite(announced) ? announced : null,
            comments_coverage_percent: summary?.coveragePercent ?? (
                Number.isFinite(announced) && announced > 0
                    ? Number(((actualComments.length / announced) * 100).toFixed(2))
                    : null
            ),
            comments_blocked: summary?.blocked || null,
        };
    });
    if (outputMode === 'nested') return nested;

    const rows = [];
    for (const post of nested) {
        const { comments: postComments, ...postRow } = post;
        rows.push(postRow);
        for (const comment of postComments.filter((item) => item.record_type !== 'summary')) {
            rows.push({
                ...comment,
                record_type: 'comment',
                source_post_id: comment.source_post_id || post.source_post_id || null,
                source_url: comment.source_post_url || post.source_url || null,
            });
        }
    }
    return rows;
}

export function truncateNestedComments(nestedPosts, commentBudget) {
    let remaining = Math.max(0, Math.floor(Number(commentBudget) || 0));
    return nestedPosts.map((post) => {
        const comments = Array.isArray(post.comments) ? post.comments : [];
        const keep = Math.min(comments.length, remaining);
        remaining -= keep;
        const keptComments = comments.slice(0, keep);
        return {
            ...post,
            comments: keptComments,
            comments_collected: keptComments.length,
            comments_truncated_by_budget: comments.length - keptComments.length,
            comments_coverage_percent_before_budget: post.comments_coverage_percent ?? null,
            comments_coverage_percent: Number.isFinite(post.comments_announced) && post.comments_announced > 0
                ? Number(((keptComments.length / post.comments_announced) * 100).toFixed(2))
                : null,
        };
    });
}

export function flattenNestedRows(nestedPosts) {
    const rows = [];
    for (const post of nestedPosts) {
        const { comments: postComments, ...postRow } = post;
        rows.push(postRow);
        for (const comment of postComments || []) {
            rows.push({
                ...comment,
                record_type: 'comment',
                source_post_id: comment.source_post_id || post.source_post_id || null,
                source_url: comment.source_post_url || post.source_url || null,
            });
        }
    }
    return rows;
}

export function chunk(items, size) {
    const output = [];
    for (let index = 0; index < items.length; index += size) {
        output.push(items.slice(index, index + size));
    }
    return output;
}
