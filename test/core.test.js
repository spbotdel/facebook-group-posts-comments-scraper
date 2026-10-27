import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildCommentsInput,
    buildGroupInput,
    buildPageInput,
    buildProfileInput,
    calculateCommentLimit,
    calculatePostBudget,
    applyPostSelection,
    chunk,
    dateBoundaryToIso,
    filterComments,
    filterPosts,
    filterPostsByEngagement,
    flattenNestedRows,
    filterPostsByDate,
    mergePostsAndComments,
    normalizeStartUrl,
    readSettings,
    truncateNestedComments,
} from '../src/core.js';

test('normalizes surface URLs', () => {
    assert.deepEqual(
        normalizeStartUrl('https://www.facebook.com/groups/123/'),
        { url: 'https://www.facebook.com/groups/123', surfaceType: 'group' },
    );
    assert.deepEqual(
        normalizeStartUrl('https://www.facebook.com/example/'),
        { url: 'https://www.facebook.com/example', surfaceType: 'page' },
    );
    assert.deepEqual(
        normalizeStartUrl({ url: 'https://www.facebook.com/example/', userData: { surfaceType: 'profile' } }),
        { url: 'https://www.facebook.com/example', surfaceType: 'profile' },
    );
    assert.throws(
        () => normalizeStartUrl('https://user:pass@www.facebook.com/groups/123/'),
        /must not contain credentials/,
    );
    assert.throws(
        () => normalizeStartUrl('http://www.facebook.com/groups/123/'),
        /must use HTTPS/,
    );
    assert.throws(
        () => normalizeStartUrl('https://l.facebook.com/l.php?u=https://example.com'),
        /Invalid Facebook URL/,
    );
    assert.throws(
        () => normalizeStartUrl('https://www.facebook.com/l.php?u=https://example.com'),
        /redirect and login URLs/,
    );
    assert.deepEqual(
        normalizeStartUrl('https://m.facebook.com/groups/123/?ref=bookmarks'),
        { url: 'https://www.facebook.com/groups/123', surfaceType: 'group' },
    );
});

test('reads settings and applies inline cap', () => {
    const settings = readSettings({
        startUrls: ['https://www.facebook.com/groups/123/'],
        commentsMode: 'inline',
        maxCommentsPerPost: 50,
    });
    assert.equal(settings.startUrls.length, 1);
    assert.equal(buildCommentsInput(settings, ['https://facebook.test/p/1']).maxCommentsPerPost, 3);
    assert.equal(buildCommentsInput(settings, ['https://facebook.test/p/1']).dedupeStoreName, undefined);
    assert.equal(
        buildCommentsInput(settings, ['https://facebook.test/p/1'], 'scoped-store').dedupeStoreName,
        'scoped-store',
    );
    assert.equal(
        buildCommentsInput(readSettings({
            startUrls: [{ url: 'https://www.facebook.com/groups/123/' }],
            onlyCommentsNewerThan: '12 hours',
            includePostTextInCommentRows: true,
        }), ['https://facebook.test/p/1']).includePostText,
        true,
    );
    assert.equal(buildProfileInput(readSettings({
        startUrls: [{ url: 'https://www.facebook.com/zuck', userData: { surfaceType: 'profile' } }],
    })).sinceDate, undefined);
    assert.equal(readSettings({
        startUrls: ['https://www.facebook.com/groups/123/'],
        unionSorts: 'false',
        failOnEmpty: 'false',
    }).unionSorts, false);
    assert.throws(
        () => readSettings({
            startUrls: ['https://www.facebook.com/groups/123/'],
            proxyCountry: 'usa',
        }),
        /two-letter country code/,
    );
});

test('builds group worker input', () => {
    const settings = readSettings({
        startUrls: ['https://www.facebook.com/groups/123/'],
        sortMode: 'RECENT_ACTIVITY',
        maxPostsPerGroup: 10,
        onlyPostsNewerThan: '30 days',
    });
    assert.equal(buildGroupInput(settings).sortMode, 'RECENT_ACTIVITY');
    assert.equal(buildGroupInput(settings).expandAllPhotos, false);
    assert.match(buildGroupInput(settings).onlyPostsNewerThan, /^\d{4}-\d{2}-\d{2}T/);
});

test('rejects group and profile batches above child engine limits', () => {
    const groupSettings = readSettings({
        startUrls: ['https://www.facebook.com/groups/123/'],
    });
    assert.throws(
        () => buildGroupInput(groupSettings, Array.from({ length: 11 }, (_, index) => `https://facebook.test/g/${index}`)),
        /cannot exceed 10/,
    );

    const profileSettings = readSettings({
        startUrls: [{ url: 'https://www.facebook.com/zuck', userData: { surfaceType: 'profile' } }],
    });
    assert.throws(
        () => buildProfileInput(
            profileSettings,
            Array.from({ length: 21 }, (_, index) => `https://facebook.test/p/${index}`),
        ),
        /cannot exceed 20/,
    );
});

test('builds history scan input and start cursor', () => {
    const settings = readSettings({
        startUrls: [{ url: 'https://www.facebook.com/groups/123/' }],
        search: 'rent',
        searchMode: 'HISTORY_SCAN',
        searchMaxPostsPerSurface: 450,
        maxSearchResults: 20,
        startCursor: 'cursor-token',
    });
    const input = buildGroupInput(settings);
    assert.equal(input.maxPostsPerGroup, 450);
    assert.equal(input.startCursor, 'cursor-token');
    assert.deepEqual(input.knownPostIds, []);
});

test('routes pages through the owned profile engine', () => {
    const settings = readSettings({
        startUrls: [
            { url: 'https://www.facebook.com/humansofnewyork/', userData: { surfaceType: 'page' } },
            { url: 'https://www.facebook.com/zuck', userData: { surfaceType: 'profile' } },
        ],
        maxPostsPerGroup: 7,
        onlyPostsNewerThan: '30 days',
        proxyCountry: 'de',
    });
    const pageInput = buildPageInput(settings);
    const profileInput = buildProfileInput(settings);
    assert.deepEqual(pageInput.profileUrls, ['https://www.facebook.com/humansofnewyork']);
    assert.deepEqual(profileInput.profileUrls, ['https://www.facebook.com/zuck']);
    assert.equal(pageInput.maxPostsPerProfile, 7);
    assert.equal(pageInput.proxyCountry, 'DE');
    assert.match(pageInput.sinceDate, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(pageInput.expandAllPhotos, false);
});

test('normalizes relative and ISO date boundaries', () => {
    const now = Date.parse('2026-10-03T12:00:00.000Z');
    assert.equal(dateBoundaryToIso('12 hours', now), '2026-10-03T00:00:00.000Z');
    assert.equal(dateBoundaryToIso('2026-09-01', now), '2026-09-01T00:00:00.000Z');
});

test('filters posts by date range', () => {
    const posts = [
        { created_at: '2026-10-03T00:00:00.000Z' },
        { created_at: '2026-09-15T00:00:00.000Z' },
        { created_at: '2026-07-01T00:00:00.000Z' },
    ];
    const filtered = filterPostsByDate(posts, '30 days', '2026-10-02', Date.parse('2026-10-03T12:00:00Z'));
    assert.deepEqual(filtered, [posts[1]]);
});

test('treats the upper post date boundary as exclusive', () => {
    const posts = [
        { created_at: '2026-10-02T00:00:00.000Z' },
        { created_at: '2026-10-01T23:59:59.999Z' },
        { raw_text: 'undated post' },
        { created_at: Date.parse('2026-10-01T12:00:00.000Z') },
    ];
    const filtered = filterPostsByDate(posts, null, '2026-10-02');
    assert.deepEqual(filtered, [posts[1], posts[3]]);
});

test('calculates post and comment budgets conservatively', () => {
    const postBudget = calculatePostBudget({
        maxTotalChargeUsd: 0.02,
        spentUsd: 0.005,
        postPriceUsd: 0.003,
        surfaceCount: 1,
        requestedPostsPerSurface: 30,
    });
    assert.equal(postBudget.postsPerSurface, 5);
    assert.equal(postBudget.remainingAfterPostsUsd, 0);
    assert.equal(postBudget.limited, true);

    const commentBudget = calculateCommentLimit({
        maxTotalChargeUsd: 0.02,
        spentUsd: 0.005,
        postCount: 3,
        postPriceUsd: 0.003,
        commentPriceUsd: 0.001,
        requestedCommentsPerPost: 50,
    });
    assert.equal(commentBudget.commentsPerPost, 2);
    assert.equal(commentBudget.affordableTotal, 6);
    assert.equal(commentBudget.limited, true);
});

test('reserves comment budget and rejects a zero charge cap', () => {
    const reserved = calculatePostBudget({
        maxTotalChargeUsd: 0.02,
        spentUsd: 0.005,
        postPriceUsd: 0.003,
        commentPriceUsd: 0.001,
        requestedCommentsPerPost: 50,
        surfaceCount: 1,
        requestedPostsPerSurface: 30,
    });
    assert.equal(reserved.postsPerSurface, 2);
    assert.equal(reserved.commentsReserveUsd, 0.0075);
    assert.equal(reserved.limited, true);

    const blocked = calculatePostBudget({
        maxTotalChargeUsd: 0,
        spentUsd: 0,
        postPriceUsd: 0.003,
        surfaceCount: 1,
        requestedPostsPerSurface: 30,
    });
    assert.equal(blocked.acceptedSurfaces, 0);
    assert.equal(blocked.postsPerSurface, 0);
    assert.equal(blocked.limited, true);
});

test('filters posts by text', () => {
    const posts = [{ raw_text: 'House for rent' }, { raw_text: 'Cars' }];
    assert.equal(filterPosts(posts, 'house').length, 1);
});

test('filters posts by engagement and author', () => {
    const posts = [
        { raw_text: 'a', stats: { comments: 10, reactions: 50 }, author: { name: 'Alice' } },
        { raw_text: 'b', stats: { comments: 2, reactions: 5 }, author: { name: 'Bob' } },
        { raw_text: 'c' },
    ];
    assert.deepEqual(
        filterPostsByEngagement(posts, { minComments: 5, minReactions: 40 }),
        [posts[0], posts[2]],
    );
    assert.deepEqual(
        filterPostsByEngagement(posts, { filterAuthor: 'bob' }),
        [posts[1]],
    );
});

test('applies history scan selection limit', () => {
    const posts = [
        { raw_text: 'rent one' },
        { raw_text: 'rent two' },
        { raw_text: 'other' },
    ];
    const settings = readSettings({
        startUrls: [{ url: 'https://www.facebook.com/groups/123/' }],
        search: 'rent',
        searchMode: 'HISTORY_SCAN',
        maxSearchResults: 1,
    });
    assert.deepEqual(applyPostSelection(posts, settings), [posts[0]]);
});

test('filters comments by text and reactions while keeping summary rows', () => {
    const comments = [
        { record_type: 'summary', pushed: 3 },
        { raw_text: 'excellent service', reactions: 5 },
        { raw_text: 'bad service', reactions: 1 },
    ];
    const filtered = filterComments(comments, {
        commentTextSearch: 'excellent',
        minCommentReactions: 2,
    });
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].record_type, 'summary');
    assert.equal(filtered[1].raw_text, 'excellent service');
});

test('merges comments into post rows', () => {
    const posts = [{
        source_post_id: '1',
        source_url: 'https://facebook.com/groups/1/posts/1',
        raw_text: 'post',
    }];
    const comments = [
        { source_post_id: '1', source_post_url: posts[0].source_url, raw_text: 'comment' },
        { record_type: 'summary', source_post_id: '1', source_post_url: posts[0].source_url, pushed: 1 },
    ];
    const nested = mergePostsAndComments(posts, comments, 'nested');
    assert.equal(nested.length, 1);
    assert.equal(nested[0].comments.length, 1);
    assert.equal(nested[0].comments_collected, 1);
    assert.equal(nested[0].comments_collected_before_filters, 1);
    assert.equal(mergePostsAndComments(posts, comments, 'separate').length, 2);
    assert.deepEqual(chunk([1, 2, 3], 2), [[1, 2], [3]]);
});

test('truncates comments for charge budget and flattens output', () => {
    const nested = [{
        source_post_id: '1',
        source_url: 'https://facebook.test/p/1',
        comments_announced: 10,
        comments: [
            { source_comment_id: 'c1' },
            { source_comment_id: 'c2' },
            { source_comment_id: 'c3' },
        ],
    }];
    const limited = truncateNestedComments(nested, 2);
    assert.equal(limited[0].comments.length, 2);
    assert.equal(limited[0].comments_truncated_by_budget, 1);
    assert.equal(limited[0].comments_coverage_percent, 20);
    const rows = flattenNestedRows(limited);
    assert.equal(rows.length, 3);
    assert.equal(rows.filter((row) => row.record_type === 'comment').length, 2);
});
