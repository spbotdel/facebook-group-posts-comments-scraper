import { Actor, log } from 'apify';
import crypto from 'node:crypto';
import {
    DEFAULT_COMMENT_PRICE_USD,
    DEFAULT_POST_PRICE_USD,
    DEFAULT_START_PRICE_USD,
    GROUP_BATCH_SIZE,
    GROUP_ACTOR_ID,
    PROFILE_BATCH_SIZE,
    buildCommentsInput,
    buildGroupInput,
    buildPageInput,
    buildProfileInput,
    calculateCommentLimit,
    calculatePostBudget,
    chunk,
    commentPostIdOf,
    commentPostUrlOf,
    applyPostSelection,
    filterComments,
    filterPostsByDate,
    flattenNestedRows,
    mergePostsAndComments,
    normalizeSurfacePost,
    postIdOf,
    postUrlOf,
    readSettings,
    truncateNestedComments,
} from './core.js';
import { runCommentsEngine } from './engines/comments/engine.js';
import { runGroupEngine } from './engines/group/engine.js';
import { runProfileEngine } from './engines/profile/engine.js';
import { createEngineContext } from './engineContext.js';

const COMMENT_BATCH_SIZE = 100;
const DATASET_WRITE_BATCH_SIZE = 1000;

async function setRunStatus(message) {
    try {
        await Actor.setStatusMessage(message);
    } catch (error) {
        log.debug('Could not update Actor status message', { message: error?.message });
    }
}

await Actor.init();

const startedAt = new Date().toISOString();
const input = (await Actor.getInput()) || {};
const requestedSettings = readSettings(input);
const chargingManager = Actor.getChargingManager();
const pricingInfo = chargingManager.getPricingInfo();
const chargeableEvents = pricingInfo?.perEventPrices || {};
const postPriceUsd = Number(chargeableEvents.post || DEFAULT_POST_PRICE_USD);
const commentPriceUsd = Number(chargeableEvents.comment || DEFAULT_COMMENT_PRICE_USD);
const startPriceUsd = Number(chargeableEvents['apify-actor-start'] || DEFAULT_START_PRICE_USD);
if (pricingInfo?.isPayPerEvent && (!(postPriceUsd > 0) || !(commentPriceUsd > 0))) {
    throw new Error('Pay-per-event pricing is enabled but post/comment event prices are missing.');
}
const configuredMaxTotalChargeUsd = chargingManager.getMaxTotalChargeUsd();
const configuredSafetyMax = Number(process.env.ACTOR_B_SAFETY_MAX_CHARGE_USD);
const safetyMaxTotalChargeUsd = Number.isFinite(configuredSafetyMax) && configuredSafetyMax > 0
    ? configuredSafetyMax
    : Infinity;
const maxTotalChargeUsd = Number.isFinite(configuredMaxTotalChargeUsd)
    ? configuredMaxTotalChargeUsd
    : safetyMaxTotalChargeUsd;

function chargedCount(eventName) {
    return Math.max(0, Number(chargingManager.getChargedEventCount(eventName) || 0));
}

function currentSpentUsd() {
    return chargedCount('apify-actor-start') * startPriceUsd
        + chargedCount('post') * postPriceUsd
        + chargedCount('comment') * commentPriceUsd;
}

const spentBeforeRunUsd = currentSpentUsd();
const requestedPostsPerSurface = requestedSettings.searchMode === 'HISTORY_SCAN'
    ? requestedSettings.searchMaxPostsPerSurface
    : requestedSettings.maxPostsPerGroup;
const requestedCommentsPerPostForBudget = requestedSettings.commentsMode === 'inline'
    ? Math.min(3, requestedSettings.maxCommentsPerPost)
    : requestedSettings.commentsMode === 'full'
        ? requestedSettings.maxCommentsPerPost
        : 0;
const postBudget = calculatePostBudget({
    maxTotalChargeUsd,
    spentUsd: spentBeforeRunUsd,
    postPriceUsd,
    commentPriceUsd,
    requestedCommentsPerPost: requestedCommentsPerPostForBudget,
    surfaceCount: requestedSettings.startUrls.length,
    requestedPostsPerSurface,
});
if (!postBudget.acceptedSurfaces) {
    throw new Error(
        `The run charge limit $${maxTotalChargeUsd} is too low to collect even one post. `
        + 'Increase maxTotalChargeUsd and retry.',
    );
}

const budgetedStartUrls = requestedSettings.startUrls.slice(0, postBudget.acceptedSurfaces);
const settings = {
    ...requestedSettings,
    startUrls: budgetedStartUrls,
    groupUrls: budgetedStartUrls.filter((item) => item.surfaceType === 'group').map((item) => item.url),
    pageUrls: budgetedStartUrls.filter((item) => item.surfaceType === 'page').map((item) => item.url),
    profileUrls: budgetedStartUrls.filter((item) => item.surfaceType === 'profile').map((item) => item.url),
    maxPostsPerGroup: postBudget.postsPerSurface,
    searchMaxPostsPerSurface: requestedSettings.searchMode === 'HISTORY_SCAN'
        ? postBudget.postsPerSurface
        : requestedSettings.searchMaxPostsPerSurface,
};

function eventChargeEnabled(eventName) {
    return Boolean(pricingInfo?.isPayPerEvent && Number(chargeableEvents[eventName] || 0) > 0);
}

async function chargeEvent(eventName, requested) {
    const count = Math.max(0, Math.floor(Number(requested) || 0));
    if (!count || !eventChargeEnabled(eventName)) {
        if (count && pricingInfo?.isPayPerEvent) {
            throw new Error(`Pay-per-event event "${eventName}" is not configured.`);
        }
        return {
            eventName,
            enabled: false,
            requested: count,
            charged: count,
            limitReached: false,
        };
    }

    let charged = 0;
    let limitReached = false;
    const batchSize = 200;
    for (let offset = 0; offset < count; offset += batchSize) {
        const batch = Math.min(batchSize, count - offset);
        const result = await Actor.charge({ eventName, count: batch });
        const batchCharged = Math.max(0, Math.floor(Number(result?.chargedCount) || 0));
        charged += batchCharged;
        if (batchCharged < batch || result?.eventChargeLimitReached) {
            limitReached = true;
            break;
        }
    }

    return {
        eventName,
        enabled: true,
        requested: count,
        charged,
        limitReached,
    };
}

// Engines now run in-process under the caller's own run: one Apify run, one
// token, one bill. The ctx adapter collects rows and KV values for the parent.
async function runEngine(label, runner, engineInput, summaryKey) {
    log.info(`Starting ${label}`);
    const ctx = createEngineContext({ onStatus: (message) => setRunStatus(message) });
    await runner(engineInput, ctx);
    const childSummary = ctx.values[summaryKey] ?? null;
    log.info(`${label} finished`, { items: ctx.rows.length });
    return { items: ctx.rows, childSummary };
}

const surfaceCalls = [];
let groupInput = null;
let groupCall = null;
await setRunStatus('Starting posts-and-comments run');

async function collectGroupBatch(groupUrls) {
    const batchInput = buildGroupInput(settings, groupUrls);
    try {
        const call = await runEngine('group feed', runGroupEngine, batchInput, 'SUMMARY');
        return { call, input: batchInput };
    } catch (error) {
        if (settings.sortMode === 'CHRONOLOGICAL_LISTINGS' && /input|validation|sort/i.test(error.message)) {
            log.warning('Listings sort is not accepted by the group engine; falling back to chronological.');
            const fallbackInput = { ...batchInput, sortMode: 'CHRONOLOGICAL' };
            delete fallbackInput.sortingSetting;
            const call = await runEngine(
                'group feed chronological fallback',
                runGroupEngine,
                fallbackInput,
                'SUMMARY',
            );
            return { call, input: fallbackInput };
        }
        throw error;
    }
}

for (const [index, groupUrls] of chunk(settings.groupUrls, GROUP_BATCH_SIZE).entries()) {
    await setRunStatus(`Collecting Facebook group posts batch ${index + 1}`);
    const result = await collectGroupBatch(groupUrls);
    groupInput ||= result.input;
    groupCall ||= result.call;
    surfaceCalls.push({
        surfaceType: 'group',
        call: result.call,
        sourceUrls: groupUrls,
        batchIndex: index + 1,
    });
}

for (const [index, pageUrls] of chunk(settings.pageUrls, PROFILE_BATCH_SIZE).entries()) {
    await setRunStatus(`Collecting Facebook page posts batch ${index + 1}`);
    const pageCall = await runEngine('page feed', runProfileEngine, buildPageInput(settings, pageUrls), 'SUMMARY');
    surfaceCalls.push({
        surfaceType: 'page',
        call: pageCall,
        sourceUrls: pageUrls,
        batchIndex: index + 1,
    });
}

for (const [index, profileUrls] of chunk(settings.profileUrls, PROFILE_BATCH_SIZE).entries()) {
    await setRunStatus(`Collecting Facebook profile posts batch ${index + 1}`);
    const profileCall = await runEngine(
        'profile feed',
        runProfileEngine,
        buildProfileInput(settings, profileUrls),
        'SUMMARY',
    );
    surfaceCalls.push({
        surfaceType: 'profile',
        call: profileCall,
        sourceUrls: profileUrls,
        batchIndex: index + 1,
    });
}

const rawPosts = surfaceCalls.flatMap(({ surfaceType, call }) => call.items
    .map((item) => normalizeSurfacePost(item, surfaceType))
    .filter(Boolean));
const datedPosts = filterPostsByDate(rawPosts, settings.onlyPostsNewerThan, settings.onlyPostsOlderThan);
let posts = applyPostSelection(datedPosts, settings);
posts = posts.slice(0, postBudget.affordableTotal);
const seenPostKeys = new Set();
posts = posts.filter((post) => {
    const key = postIdOf(post) || postUrlOf(post);
    if (!key) return true;
    const normalizedKey = String(key);
    if (seenPostKeys.has(normalizedKey)) return false;
    seenPostKeys.add(normalizedKey);
    return true;
});

if (!posts.length && settings.failOnEmpty) {
    throw new Error('No posts were collected.');
}

let comments = [];
const commentRuns = [];
let commentBudget = null;
const dedupeScope = crypto
    .createHash('sha256')
    .update(`${process.env.APIFY_USER_ID || 'anonymous'}:${settings.dedupeStoreName || ''}`)
    .digest('hex')
    .slice(0, 16);
const scopedDedupeStoreName = settings.dedupeStoreName
    ? `actor-b-dedupe-${dedupeScope}`
    : null;
if (settings.commentsMode !== 'none' && posts.length) {
    commentBudget = calculateCommentLimit({
        maxTotalChargeUsd,
        spentUsd: spentBeforeRunUsd,
        postCount: posts.length,
        postPriceUsd,
        commentPriceUsd,
        requestedCommentsPerPost: requestedCommentsPerPostForBudget,
    });
    const effectiveCommentLimit = settings.commentsMode === 'inline'
        ? Math.min(3, commentBudget.commentsPerPost)
        : commentBudget.commentsPerPost;

    if (effectiveCommentLimit < 1) {
        log.warning(
            'The run charge limit leaves no budget for comments; returning posts without comment enrichment.',
        );
    } else {
        const commentSettings = {
            ...settings,
            maxCommentsPerPost: effectiveCommentLimit,
        };
        const postUrls = posts.map(postUrlOf).filter(Boolean);
        for (const [index, urls] of chunk(postUrls, COMMENT_BATCH_SIZE).entries()) {
            await setRunStatus(`Collecting comments batch ${index + 1}`);
            const result = await runEngine(
                `comments batch ${index + 1}`,
                runCommentsEngine,
                buildCommentsInput(commentSettings, urls, scopedDedupeStoreName),
                'OUTPUT',
            );
            comments.push(...result.items);
            comments.push(...(result.childSummary?.summaries || []));
            commentRuns.push({
                postUrls: urls.length,
                rows: result.items.length,
            });
        }
    }
}

const commentsBeforeFilters = comments.filter((comment) => comment.record_type !== 'summary').length;
comments = filterComments(comments, settings);
const commentsAfterFilters = comments.filter((comment) => comment.record_type !== 'summary').length;
const matchKeys = new Set(
    [...posts.map(postUrlOf), ...posts.map(postIdOf)]
        .filter(Boolean)
        .map(String),
);
const commentsUnmatched = comments.filter((comment) => {
    if (comment.record_type === 'summary') return false;
    const keys = [commentPostUrlOf(comment), commentPostIdOf(comment)].filter(Boolean).map(String);
    return !keys.some((key) => matchKeys.has(key));
}).length;

let nestedRows = mergePostsAndComments(posts, comments, 'nested').map((row) => {
    if ((row.record_type || 'post') !== 'post') return row;
    const announced = row?.comments_announced ?? null;
    const collected = Number(row.comments_collected || 0);
    return {
        ...row,
        comments_announced: Number.isFinite(announced) ? announced : null,
        comments_coverage_percent: Number.isFinite(announced) && announced > 0
            ? Number(((collected / announced) * 100).toFixed(2))
            : null,
    };
});

const commentsCollectedBeforeBudget = nestedRows.reduce(
    (sum, row) => sum + (row.comments?.length || 0),
    0,
);
if (commentBudget && commentBudget.affordableTotal < commentsCollectedBeforeBudget) {
    nestedRows = truncateNestedComments(nestedRows, commentBudget.affordableTotal);
}
const plannedCommentRows = nestedRows.reduce((sum, row) => sum + (row.comments?.length || 0), 0);

const rows = settings.commentsOutput === 'separate'
    ? flattenNestedRows(nestedRows)
    : nestedRows;
const collectedCommentRows = nestedRows.reduce((sum, row) => sum + (row.comments?.length || 0), 0);
const commentSummaryRows = comments.filter((comment) => comment.record_type === 'summary').length;
const commentsSkippedKnown = comments
    .filter((comment) => comment.record_type === 'summary')
    .reduce((sum, comment) => sum + Number(comment.skippedKnown || 0), 0);

if (!rows.length && settings.failOnEmpty) {
    throw new Error('No output rows were produced.');
}

await setRunStatus(`Writing ${rows.length} rows`);
for (const batch of chunk(rows, DATASET_WRITE_BATCH_SIZE)) {
    await Actor.pushData(batch);
}

// Charge only after all requested rows are safely committed to the dataset.
const postCharge = await chargeEvent('post', nestedRows.length);
const commentCharge = await chargeEvent('comment', plannedCommentRows);
if (postCharge.charged < nestedRows.length || commentCharge.charged < plannedCommentRows) {
    throw new Error(
        'Charge limit prevented billing for all committed rows. '
        + 'Increase maxTotalChargeUsd and retry.',
    );
}

const summary = {
    provider: 'facebook_group_posts_comments_orchestrator',
    startedAt,
    finishedAt: new Date().toISOString(),
    requestedSourceUrlCount: requestedSettings.startUrls.length,
    sourceUrlCount: settings.startUrls.length,
    surfaceUrlCounts: {
        group: settings.groupUrls.length,
        page: settings.pageUrls.length,
        profile: settings.profileUrls.length,
    },
    budget: {
        maxTotalChargeUsd: Number.isFinite(maxTotalChargeUsd) ? maxTotalChargeUsd : null,
        configuredMaxTotalChargeUsd: Number.isFinite(configuredMaxTotalChargeUsd)
            ? configuredMaxTotalChargeUsd
            : null,
        safetyCapApplied: !Number.isFinite(configuredMaxTotalChargeUsd)
            && Number.isFinite(safetyMaxTotalChargeUsd),
        optionalSafetyCapUsd: Number.isFinite(safetyMaxTotalChargeUsd)
            ? safetyMaxTotalChargeUsd
            : null,
        spentBeforeRunUsd,
        postPriceUsd,
        commentPriceUsd,
        startPriceUsd,
        postPlan: postBudget,
        commentPlan: commentBudget,
        limited: Boolean(postBudget.limited || commentBudget?.limited),
        skippedSurfaceUrlCount: postBudget.skippedSurfaces,
        skippedSurfaceUrls: requestedSettings.startUrls
            .slice(postBudget.acceptedSurfaces)
            .map((item) => item.url),
    },
    postsCollected: posts.length,
    postsCollectedBeforeFilters: datedPosts.length,
    commentsCollected: collectedCommentRows,
    newComments: collectedCommentRows,
    commentsCollectedBeforeFilters: commentsBeforeFilters,
    commentsTruncatedByBudget: Math.max(0, commentsCollectedBeforeBudget - collectedCommentRows),
    commentsFilteredOut: Math.max(0, commentsBeforeFilters - commentsAfterFilters),
    commentsUnmatched,
    commentsNotCharged: Math.max(0, plannedCommentRows - commentCharge.charged),
    charging: {
        pricingModel: pricingInfo?.pricingModel || null,
        post: postCharge,
        comment: commentCharge,
    },
    commentSummaryRows,
    commentsSkippedKnown,
    dedupeEnabled: Boolean(settings.dedupeStoreName),
    dedupeStoreScoped: Boolean(scopedDedupeStoreName),
    dedupeStoreEffective: scopedDedupeStoreName,
    datasetRows: rows.length,
    commentsMode: settings.commentsMode,
    commentsOutput: settings.commentsOutput,
    postsWithComments: nestedRows.filter((row) => (row.comments?.length || 0) > 0).length,
    postsWithCoverage: nestedRows.filter((row) => Number.isFinite(row.comments_announced)).length,
    commentsAnnouncedTotal: nestedRows.reduce((sum, row) => (
        Number.isFinite(row.comments_announced)
            ? sum + row.comments_announced
            : sum
    ), 0),
    sortMode: groupInput?.sortMode || groupInput?.sortingSetting || settings.sortMode,
    search: settings.search || null,
    searchMode: settings.searchMode,
    searchScan: settings.searchMode === 'HISTORY_SCAN' ? {
        searchMaxPostsPerSurface: settings.searchMaxPostsPerSurface,
        maxSearchResults: settings.maxSearchResults,
    } : null,
    postFilters: {
        minComments: settings.minComments,
        minReactions: settings.minReactions,
        filterAuthor: settings.filterAuthor || null,
    },
    commentFilters: {
        onlyCommentsNewerThan: settings.onlyCommentsNewerThan || null,
        commentTextSearch: settings.commentTextSearch || null,
        minCommentReactions: settings.minCommentReactions,
        includePostTextInCommentRows: settings.includePostTextInCommentRows,
    },
    startCursorUsed: Boolean(settings.startCursor),
    surfaceRuns: surfaceCalls.map(({ surfaceType, call, sourceUrls, batchIndex }) => ({
        surfaceType,
        batchIndex,
        sourceUrls,
        rows: call.items.length,
        feed: call.childSummary ? {
            coverageStatus: call.childSummary.coverageStatus || null,
            stopReason: call.childSummary.stopReason || null,
            nextCursor: call.childSummary.nextCursor || null,
            outputCheckpoint: call.childSummary.outputCheckpoint || null,
            pointer: call.childSummary.pointer || null,
        } : null,
    })),
    commentRuns,
    groupFeed: groupCall?.childSummary ? {
        coverageStatus: groupCall.childSummary.coverageStatus || null,
        stopReason: groupCall.childSummary.stopReason || null,
        nextCursor: groupCall.childSummary.nextCursor || null,
        outputCheckpoint: groupCall.childSummary.outputCheckpoint || null,
        pointer: groupCall.childSummary.pointer || null,
    } : null,
    monitoring: settings.commentsMode === 'none'
        ? null
        : {
            newComments: collectedCommentRows,
            empty: collectedCommentRows === 0,
            reason: collectedCommentRows === 0
                ? 'No new public comments matched the configured filters or dedupe store.'
                : null,
        },
    postIds: posts.map(postIdOf).filter(Boolean),
};

await Actor.setValue('SUMMARY', summary);
await setRunStatus(`Finished: ${posts.length} posts, ${collectedCommentRows} comments`);
await Actor.exit();
