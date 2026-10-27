import fs from 'fs';

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) throw new Error('APIFY_TOKEN is required.');
const ACTOR_ID = 'D4fo5uWHFVEb4FYJ2';
const isPublic = process.env.PUBLIC_TASKS !== '0';
const GROUP_URL = 'https://www.facebook.com/groups/2333220550043074/';
const PAGE_URL = 'https://www.facebook.com/humansofnewyork/';
const PROFILE_URL = 'https://www.facebook.com/zuck';
const RUN_SMOKE = process.env.RUN_SMOKE !== '0';
const FORCE_SMOKE = process.env.FORCE_SMOKE === '1';

const definitions = [
  {
    id: 'KORZ1xOwaDCob8lTh',
    name: 'facebook-group-posts-comments-demo',
    title: 'Run a Facebook Group Posts & Comments Demo',
    description:
      'Run a small, low-cost demo on a public Facebook group. Collect a few posts with public comments and replies, nested in one structured dataset, and inspect authors, dates, reactions, engagement, media, and coverage diagnostics. No cookies or login. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Facebook Group Posts & Comments Demo',
    seoDescription:
      'Run a no-cookie demo of public Facebook group posts, comments and replies. Preview authors, dates, reactions, media and coverage diagnostics.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
      'commentsOutput',
    ],
    input: {
      startUrls: [{ url: GROUP_URL }],
      maxPostsPerGroup: 3,
      sortMode: 'CHRONOLOGICAL',
      commentsMode: 'full',
      maxCommentsPerPost: 10,
      includeReplies: true,
      maxReplyThreadsPerPost: 5,
      maxRepliesPerPost: 10,
      commentsConcurrency: 3,
      commentsSortOrder: 'MOST_RELEVANT',
      unionSorts: true,
      commentsOutput: 'nested',
      proxyTier: 'auto',
    },
  },
  {
    id: 'oFYGTGAcLoOAxot34',
    name: 'scrape-facebook-group-posts',
    title: 'Scrape Facebook Group Posts Without Comments',
    description:
      'Scrape public Facebook group posts without comment enrichment. Get text, authors, dates, engagement, reactions, media metadata, and stable post URLs for community research, content analysis, lead discovery, or a low-cost feed snapshot. No Facebook cookies or login. From $3 per 1,000 posts.',
    seoTitle: 'Facebook Group Posts Scraper - No Cookies',
    seoDescription:
      'Scrape public Facebook group posts without cookies or comments. Export text, authors, dates, reactions, media, engagement and stable post URLs.',
    datasetView: 'posts',
    isPublic: false,
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'sortMode',
      'onlyPostsNewerThan',
      'knownPostIds',
      'proxyTier',
    ],
    input: {
      startUrls: [{ url: GROUP_URL }],
      maxPostsPerGroup: 20,
      sortMode: 'CHRONOLOGICAL',
      commentsMode: 'none',
      commentsOutput: 'nested',
      proxyTier: 'auto',
    },
  },
  {
    id: 'n3MfvshfMBULOgSdm',
    name: 'scrape-facebook-group-posts-comments',
    title: 'Scrape Facebook Group Posts With Comments',
    description:
      'Scrape public Facebook group posts and their public comments and replies in one run. Get post context, authors, dates, reactions, media, parent-child thread links, and coverage diagnostics. No cookies or login. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Facebook Group Posts & Comments Scraper',
    seoDescription:
      'Scrape public Facebook group posts, comments and replies without cookies. Get authors, dates, reactions, media, thread links and coverage data.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'sortMode',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
      'commentsConcurrency',
      'commentsOutput',
    ],
    input: {
      startUrls: [{ url: GROUP_URL }],
      maxPostsPerGroup: 10,
      sortMode: 'CHRONOLOGICAL',
      commentsMode: 'full',
      maxCommentsPerPost: 20,
      includeReplies: true,
      maxReplyThreadsPerPost: 10,
      maxRepliesPerPost: 20,
      commentsConcurrency: 5,
      commentsSortOrder: 'MOST_RELEVANT',
      unionSorts: true,
      commentsOutput: 'nested',
      proxyTier: 'auto',
    },
  },
  {
    name: 'scrape-facebook-posts-and-comments',
    title: 'Scrape Facebook Posts and Comments',
    description:
      'Scrape public Facebook posts, comments, and replies from groups, pages, and personal profiles in one run. Collect text, authors, dates, reactions, media, thread links, and coverage diagnostics without cookies or login. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Facebook Posts and Comments Scraper',
    seoDescription:
      'Scrape public Facebook posts, comments and replies from groups, pages and profiles without cookies. Export authors, dates, reactions, media and coverage data.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
      'commentsOutput',
      'proxyCountry',
    ],
    input: {
      startUrls: [
        { url: GROUP_URL },
        { url: PAGE_URL, userData: { surfaceType: 'page' } },
        { url: PROFILE_URL, userData: { surfaceType: 'profile' } },
      ],
      maxPostsPerGroup: 2,
      sortMode: 'CHRONOLOGICAL',
      commentsMode: 'full',
      maxCommentsPerPost: 20,
      includeReplies: true,
      maxReplyThreadsPerPost: 10,
      maxRepliesPerPost: 20,
      commentsConcurrency: 5,
      commentsSortOrder: 'MOST_RELEVANT',
      unionSorts: true,
      commentsOutput: 'nested',
      proxyTier: 'auto',
      proxyCountry: 'US',
    },
  },
  {
    id: 'TBXWgpECHbz5OL3Si',
    name: 'scrape-facebook-page-posts-comments',
    title: 'Scrape Facebook Page Posts With Comments',
    description:
      'Scrape public Facebook page posts and their public comments and replies in one dataset. Collect post text, authors, timestamps, reactions, media, comment threads, and coverage diagnostics without cookies or login. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Facebook Page Posts & Comments Scraper',
    seoDescription:
      'Scrape public Facebook page posts, comments and replies without cookies. Export authors, dates, reactions, media, thread links and coverage data.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
      'commentsConcurrency',
      'proxyCountry',
    ],
    input: {
      startUrls: [{
        url: PAGE_URL,
        userData: { surfaceType: 'page' },
      }],
      maxPostsPerGroup: 5,
      commentsMode: 'full',
      maxCommentsPerPost: 20,
      includeReplies: true,
      maxReplyThreadsPerPost: 10,
      maxRepliesPerPost: 20,
      commentsConcurrency: 5,
      commentsSortOrder: 'MOST_RELEVANT',
      unionSorts: true,
      commentsOutput: 'nested',
      proxyTier: 'auto',
      proxyCountry: 'US',
    },
  },
  {
    id: 'nizYeS7yaeGfpDDaa',
    name: 'scrape-facebook-profile-posts-comments',
    title: 'Scrape Facebook Profile Posts With Comments',
    description:
      'Scrape public personal-profile posts and their public comments and replies in one structured dataset. Get text, authors, dates, reactions, media, thread relationships, and coverage diagnostics without cookies or login. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Facebook Profile Posts & Comments Scraper',
    seoDescription:
      'Scrape public Facebook profile posts, comments and replies without cookies. Get authors, dates, reactions, media, thread links and coverage data.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
      'commentsConcurrency',
      'proxyCountry',
    ],
    input: {
      startUrls: [{
        url: PROFILE_URL,
        userData: { surfaceType: 'profile' },
      }],
      maxPostsPerGroup: 5,
      commentsMode: 'full',
      maxCommentsPerPost: 20,
      includeReplies: true,
      maxReplyThreadsPerPost: 10,
      maxRepliesPerPost: 20,
      commentsConcurrency: 5,
      commentsSortOrder: 'MOST_RELEVANT',
      unionSorts: true,
      commentsOutput: 'nested',
      proxyTier: 'auto',
      proxyCountry: 'US',
    },
  },
  {
    id: 'AjoJbArxC9ZiyZBUg',
    name: 'backfill-facebook-group-posts-by-date',
    title: 'Backfill Facebook Group Posts by Date',
    description:
      'Backfill public Facebook group posts and comments for a specific date range. Choose newer and older cutoffs, preserve authors, reactions, media and stable URLs, then enrich matching posts with public comments and replies. No cookies. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Facebook Group Posts Backfill by Date',
    seoDescription:
      'Backfill public Facebook group posts and comments for a date range without cookies. Export authors, replies, reactions, media and stable URLs.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'onlyPostsNewerThan',
      'onlyPostsOlderThan',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
    ],
    input: {
      startUrls: [{ url: GROUP_URL }],
      maxPostsPerGroup: 30,
      sortMode: 'CHRONOLOGICAL',
      onlyPostsNewerThan: '30 days',
      onlyPostsOlderThan: '1 day',
      commentsMode: 'full',
      maxCommentsPerPost: 20,
      includeReplies: true,
      maxReplyThreadsPerPost: 10,
      maxRepliesPerPost: 20,
      commentsConcurrency: 5,
      commentsOutput: 'nested',
      proxyTier: 'auto',
    },
  },
  {
    id: 'rWdJRA24AigKD27ez',
    name: 'facebook-comment-monitoring',
    title: 'Monitor Facebook Comments Automatically',
    description:
      'Monitor new public comments and replies across Facebook groups, pages, and personal profiles on a schedule. Deduplicate repeated runs and export only new results. No cookies or login. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Facebook Comment Monitoring Tool',
    seoDescription:
      'Monitor new Facebook comments and replies on a schedule. Deduplicate repeated runs and export only new results without cookies.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'commentsMode',
      'maxCommentsPerPost',
      'commentsSortOrder',
      'unionSorts',
      'dedupeStoreName',
      'failOnEmpty',
    ],
    input: {
      startUrls: [{ url: GROUP_URL }],
      maxPostsPerGroup: 3,
      sortMode: 'CHRONOLOGICAL',
      commentsMode: 'full',
      maxCommentsPerPost: 20,
      includeReplies: true,
      maxReplyThreadsPerPost: 10,
      maxRepliesPerPost: 20,
      commentsConcurrency: 3,
      commentsSortOrder: 'NEWEST',
      unionSorts: false,
      commentsOutput: 'nested',
      proxyTier: 'auto',
      dedupeStoreName: 'actor-b-monitor-new-group-comments-v1',
      failOnEmpty: false,
    },
  },
  {
    id: 'XmH9BhLdtsxPC96Vr',
    name: 'export-facebook-posts-comments-to-csv',
    title: 'Export Facebook Posts & Comments to CSV',
    description:
      'Export public Facebook page posts and comment rows into a clean dataset compatible with CSV, Excel, JSON, and Google Sheets workflows. Separate output keeps posts and comments easy to sort, filter, join, and visualize. No cookies or login. From $3 per 1,000 posts plus $1 per 1,000 comments.',
    seoTitle: 'Export Facebook Posts & Comments to CSV',
    seoDescription:
      'Export public Facebook posts and comments to CSV, Excel, JSON or Google Sheets. Get authors, dates, reactions, thread links and stable URLs.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
      'commentsSortOrder',
      'commentsOutput',
    ],
    input: {
      startUrls: [{
        url: PAGE_URL,
        userData: { surfaceType: 'page' },
      }],
      maxPostsPerGroup: 2,
      commentsMode: 'full',
      maxCommentsPerPost: 20,
      includeReplies: true,
      maxReplyThreadsPerPost: 10,
      maxRepliesPerPost: 20,
      commentsConcurrency: 3,
      commentsSortOrder: 'MOST_RELEVANT',
      unionSorts: true,
      commentsOutput: 'separate',
      proxyTier: 'auto',
      proxyCountry: 'US',
    },
  },
  {
    id: 'NYI65ylI8GWbWwFD9',
    name: 'build-ai-ready-facebook-post-dataset',
    title: 'Build an AI-Ready Facebook Post Dataset',
    description:
      'Build a structured Facebook post and comment dataset for AI, RAG, analytics, and agent workflows. Nested output preserves post context, parent-child comment threads, authors, timestamps, reactions, media, and coverage metadata. MCP-ready JSON. No cookies or login.',
    seoTitle: 'AI-Ready Facebook Posts & Comments JSON',
    seoDescription:
      'Build an AI-ready Facebook posts and comments dataset with nested threads, authors, reactions, timestamps, media and MCP-ready JSON rows.',
    datasetView: 'combined',
    inputFields: [
      'startUrls',
      'maxPostsPerGroup',
      'commentsMode',
      'maxCommentsPerPost',
      'includeReplies',
      'unionSorts',
      'commentsOutput',
    ],
    input: {
      startUrls: [{ url: GROUP_URL }],
      maxPostsPerGroup: 5,
      sortMode: 'RECENT_ACTIVITY',
      commentsMode: 'full',
      maxCommentsPerPost: 25,
      includeReplies: true,
      maxReplyThreadsPerPost: 15,
      maxRepliesPerPost: 25,
      commentsConcurrency: 5,
      commentsSortOrder: 'MOST_RELEVANT',
      unionSorts: true,
      commentsOutput: 'nested',
      proxyTier: 'auto',
    },
  },
];

const api = async (pathName, options = {}) => {
  const response = await fetch(`https://api.apify.com/v2/${pathName}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${pathName} failed: ${response.status} ${text}`);
  return body;
};

const existingTasks = (await api('actor-tasks?limit=1000&desc=1')).data.items
  .filter((task) => task.actId === ACTOR_ID);
const results = [];

for (const definition of definitions) {
  const existing = existingTasks.find((task) => task.id === definition.id || task.name === definition.name);
  const options = {
    build: 'latest',
    timeoutSecs: 7200,
    memoryMbytes: 2048,
    maxTotalChargeUsd: 1,
  };
  const publicConfig = {
    seoTitle: definition.seoTitle,
    seoDescription: definition.seoDescription,
    inputSchemaFields: definition.inputFields,
    datasetView: definition.datasetView || 'combined',
  };

  let task;
  if (existing) {
    task = (await api(`actor-tasks/${existing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: definition.name,
        title: definition.title,
        description: definition.description,
        input: definition.input,
        options,
        publicConfig,
        isPublic: definition.isPublic ?? isPublic,
      }),
    })).data;
    console.log('updated private task:', definition.name, task.id);
  } else {
    task = (await api('actor-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actId: ACTOR_ID,
        name: definition.name,
        title: definition.title,
        description: definition.description,
        input: definition.input,
        options,
        publicConfig,
        isPublic: false,
      }),
    })).data;
    if (isPublic) {
      task = (await api(`actor-tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: definition.name,
          title: definition.title,
          description: definition.description,
          input: definition.input,
          options,
          publicConfig,
          isPublic: definition.isPublic ?? isPublic,
        }),
      })).data;
    }
    console.log('created private task:', definition.name, task.id);
  }

  let smoke = null;
  if (RUN_SMOKE && (!existing || FORCE_SMOKE)) {
    const started = (await api(`actor-tasks/${task.id}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })).data;
    let run = started;
    for (let attempt = 0; attempt < 360; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      run = (await api(`actor-runs/${started.id}`)).data;
      if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(run.status)) break;
    }
    const rows = run.defaultDatasetId
      ? await api(`datasets/${run.defaultDatasetId}/items?clean=true&limit=1000`)
      : [];
    smoke = {
      runId: run.id,
      status: run.status,
      usageTotalUsd: run.usageTotalUsd,
      datasetId: run.defaultDatasetId,
      rows: rows.length,
    };
    console.log('smoke:', JSON.stringify({ name: definition.name, ...smoke }));
    if (run.status !== 'SUCCEEDED' || rows.length === 0) {
      throw new Error(`${definition.name} smoke failed with ${run.status} and ${rows.length} rows.`);
    }
  }

  const finalTask = (await api(`actor-tasks/${task.id}`)).data;
  results.push({
    name: definition.name,
    id: finalTask.id,
    title: finalTask.title,
    isPublic: finalTask.isPublic,
    input: definition.input,
    smoke,
  });
}

fs.mkdirSync('outputs', { recursive: true });
fs.writeFileSync(
  'outputs/actor-b-private-tasks-2026-10-03.json',
  JSON.stringify(results, null, 2),
);
console.log(`wrote ${results.length} private task definitions and smoke results`);
