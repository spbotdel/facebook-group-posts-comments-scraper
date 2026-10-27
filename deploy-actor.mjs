import fs from 'fs';
import path from 'path';

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) throw new Error('APIFY_TOKEN is required.');
const ACTOR_ID = process.env.ACTOR_B_ID || null;
const MAIN_ACTOR_ID = 'Ul5IlSzk7K0Lh8Qd6';
const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const actorMetadata = JSON.parse(
    fs.readFileSync(path.join(root, '.actor/actor.json'), 'utf8'),
);
const ACTOR_NAME = actorMetadata.name;
const ACTOR_VERSION = actorMetadata.version;
const isPublic = process.env.ACTOR_PUBLIC !== '0';

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

let actorId = ACTOR_ID;
if (!actorId) {
    const actors = (await api('acts?limit=1000&desc=1')).data.items;
    actorId = actors.find((actor) => actor.username === 'spbotdel' && actor.name === ACTOR_NAME)?.id || null;
}

const mainActor = (await api(`acts/${MAIN_ACTOR_ID}`)).data;
const display = {
    name: actorMetadata.name,
    title: actorMetadata.title,
    description: actorMetadata.description,
    seoTitle: 'Facebook Group, Page & Profile Posts + Comments',
    seoDescription:
        'Scrape public Facebook group, page, and profile posts with comments and replies. No cookies. Get authors, dates, reactions, media, and JSON via API or MCP.',
    categories: ['SOCIAL_MEDIA', 'AGENTS', 'MCP_SERVERS'],
    actorPermissionLevel: 'LIMITED_PERMISSIONS',
    pictureUrl: mainActor.pictureUrl,
    isPublic,
    defaultRunOptions: {
        build: 'latest',
        timeoutSecs: 7200,
        memoryMbytes: 2048,
    },
    exampleRunInput: {
        body: JSON.stringify({
            startUrls: [
                { url: 'https://www.facebook.com/groups/2333220550043074/' },
                {
                    url: 'https://www.facebook.com/humansofnewyork/',
                    userData: { surfaceType: 'page' },
                },
                {
                    url: 'https://www.facebook.com/zuck',
                    userData: { surfaceType: 'profile' },
                },
            ],
            maxPostsPerGroup: 10,
            commentsMode: 'full',
            maxCommentsPerPost: 20,
        }),
        contentType: 'application/json; charset=utf-8',
    },
};

if (actorId) {
    await api(`actors/${actorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(display),
    });
    console.log('using actor', actorId);
} else {
    const created = await api('actors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(display),
    });
    actorId = created.data.id;
    console.log('created actor', actorId);
}

const names = [
    'README.md',
    'package.json',
    'package-lock.json',
    'Dockerfile',
    '.actor/actor.json',
    '.actor/input_schema.json',
    '.actor/output_schema.json',
    '.actor/dataset_schema.json',
    'src/core.js',
    'src/main.js',
    'src/engineContext.js',
];
// Vendored in-process engines: every module except the original Actor entrypoint.
for (const engine of ['group', 'comments', 'profile']) {
    for (const file of fs.readdirSync(path.join(root, 'src', 'engines', engine))) {
        if (file.endsWith('.js') && file !== 'src_main.js') {
            names.push(`src/engines/${engine}/${file}`);
        }
    }
}
const sourceFiles = names.map((name) => ({
    name,
    format: 'TEXT',
    content: fs.readFileSync(path.join(root, name), 'utf8'),
}));

const versionPayload = {
    sourceType: 'SOURCE_FILES',
    sourceFiles,
    // Empty list explicitly clears the retired INTERNAL_ENGINE_TOKEN secret.
    envVars: [],
    applyEnvVarsToBuild: false,
    buildTag: process.env.BUILD_TAG || 'latest',
};

try {
    await api(`acts/${actorId}/versions/${ACTOR_VERSION}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(versionPayload),
    });
} catch (error) {
    if (!/404/.test(error.message)) throw error;
    await api(`acts/${actorId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            versionNumber: ACTOR_VERSION,
            ...versionPayload,
        }),
    });
}

let build = (await api(
    `acts/${actorId}/builds?version=${ACTOR_VERSION}&useCache=0&waitForFinish=180`,
    { method: 'POST' },
)).data;
for (let attempt = 0; attempt < 120 && ['READY', 'RUNNING'].includes(build.status); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    build = (await api(`actor-builds/${build.id}`)).data;
}
console.log(JSON.stringify({
    actorId,
    url: `https://console.apify.com/actors/${actorId}`,
    buildId: build.id,
    buildNumber: build.buildNumber,
    status: build.status,
}, null, 2));
if (build.status !== 'SUCCEEDED') throw new Error(`Build failed: ${build.status}`);
