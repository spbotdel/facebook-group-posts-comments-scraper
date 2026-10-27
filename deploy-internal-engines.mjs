import fs from 'fs';

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) throw new Error('APIFY_TOKEN is required.');
const USERNAME = 'spbotdel';
const TARGET_VERSION = '0.0';

const engines = [
  {
    key: 'group',
    name: 'fb-group-posts-internal-engine',
    title: 'Internal Facebook Group Feed Engine',
    description: 'Private internal group feed engine used by facebook-group-posts-comments-scraper. Do not run directly.',
    sourceActorId: 'tsjhNki5YJUV5avND',
    sourceVersion: '0.3',
    memoryMbytes: 1024,
    timeoutSecs: 1800,
  },
  {
    key: 'comments',
    name: 'fb-comments-internal-engine',
    title: 'Internal Facebook Comments Engine',
    description: 'Private internal comment and reply engine used by facebook-group-posts-comments-scraper. Do not run directly.',
    sourceActorId: 'Ul5IlSzk7K0Lh8Qd6',
    sourceVersion: '0.0',
    memoryMbytes: 1024,
    timeoutSecs: 1800,
  },
  {
    key: 'profile',
    name: 'fb-profile-posts-internal-engine',
    title: 'Internal Facebook Page and Profile Feed Engine',
    description: 'Private internal page/profile feed engine used by facebook-group-posts-comments-scraper. Do not run directly.',
    sourceActorId: 'dh91XwP7wQscfKkxU',
    sourceVersion: '1.0',
    memoryMbytes: 1024,
    timeoutSecs: 1800,
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

function rewriteSourceFiles(sourceFiles, engine) {
  return sourceFiles.map((file) => {
    if (file.name === '.actor/actor.json' && file.format === 'TEXT') {
      const actor = JSON.parse(file.content);
      actor.name = engine.name;
      actor.title = engine.title;
      actor.description = engine.description;
      actor.version = TARGET_VERSION;
      actor.buildTag = 'latest';
      actor.defaultMemoryMbytes = engine.memoryMbytes;
      actor.minMemoryMbytes = engine.memoryMbytes;
      actor.maxMemoryMbytes = engine.memoryMbytes;
      return { ...file, content: `${JSON.stringify(actor, null, 2)}\n` };
    }
    if (file.name === 'package.json' && file.format === 'TEXT') {
      const packageJson = JSON.parse(file.content);
      packageJson.name = engine.name;
      packageJson.version = '0.0.1';
      packageJson.description = engine.description;
      packageJson.private = true;
      return { ...file, content: `${JSON.stringify(packageJson, null, 2)}\n` };
    }
    return file;
  });
}

const existing = (await api('acts?limit=1000&desc=1')).data.items
  .filter((actor) => actor.username === USERNAME);
const results = [];

for (const engine of engines) {
  let actor = existing.find((item) => item.name === engine.name) || null;
  const display = {
    name: engine.name,
    title: engine.title,
    description: engine.description,
    isPublic: false,
    actorPermissionLevel: 'LIMITED_PERMISSIONS',
    categories: [],
  };

  if (actor) {
    actor = (await api(`acts/${actor.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(display),
    })).data;
    console.log('updated internal engine actor:', engine.key, actor.id);
  } else {
    actor = (await api('acts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(display),
    })).data;
    console.log('created internal engine actor:', engine.key, actor.id);
  }

  const sourceVersion = (await api(
    `acts/${engine.sourceActorId}/versions/${engine.sourceVersion}`,
  )).data;
  const sourceFiles = rewriteSourceFiles(sourceVersion.sourceFiles || [], engine);
  if (!sourceFiles.length) throw new Error(`No source files found for ${engine.sourceActorId}.`);

  await api(`acts/${actor.id}/versions/${TARGET_VERSION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceType: 'SOURCE_FILES',
      sourceFiles,
      envVars: [],
      applyEnvVarsToBuild: false,
      buildTag: 'latest',
    }),
  });

  const build = (await api(
    `acts/${actor.id}/builds?version=${TARGET_VERSION}&useCache=0&waitForFinish=180`,
    { method: 'POST' },
  )).data;
  if (build.status !== 'SUCCEEDED') {
    throw new Error(`Build ${engine.key} failed: ${build.status}`);
  }

  const finalActor = (await api(`acts/${actor.id}`)).data;
  results.push({
    key: engine.key,
    id: finalActor.id,
    name: finalActor.name,
    title: finalActor.title,
    isPublic: finalActor.isPublic,
    pricingInfos: finalActor.pricingInfos || [],
    build: finalActor.taggedBuilds?.latest || null,
    sourceActorId: engine.sourceActorId,
    sourceVersion: engine.sourceVersion,
  });
}

fs.mkdirSync('outputs', { recursive: true });
fs.writeFileSync(
  'outputs/actor-b-internal-engines-2026-10-04.json',
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results, null, 2));
