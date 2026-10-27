import fs from 'fs';

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) throw new Error('APIFY_TOKEN is required.');
const TASK_ID = 'rWdJRA24AigKD27ez';
const SCHEDULE_NAME = 'actor-b-monitor-new-comments-hourly';

const schedule = {
    name: SCHEDULE_NAME,
    title: 'Monitor new Facebook comments hourly',
    description: 'Private disabled schedule for testing the Actor B new-comment monitoring preset. Enable explicitly when recurring collection is approved.',
    cronExpression: '0 * * * *',
    timezone: 'Asia/Bangkok',
    isEnabled: false,
    isExclusive: true,
    actions: [{
        type: 'RUN_ACTOR_TASK',
        actorTaskId: TASK_ID,
    }],
};

const api = async (path, options = {}) => {
    const response = await fetch(`https://api.apify.com/v2/${path}`, {
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
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${text}`);
    return body;
};

const existing = (await api('schedules?limit=1000&desc=1')).data.items
    .find((item) => item.name === SCHEDULE_NAME);

const result = existing
    ? (await api(`schedules/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
    })).data
    : (await api('schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(schedule),
    })).data;

fs.mkdirSync('outputs', { recursive: true });
fs.writeFileSync(
    'outputs/actor-b-private-schedule-2026-10-04.json',
    JSON.stringify(result, null, 2),
);

console.log(JSON.stringify({
    action: existing ? 'updated' : 'created',
    id: result.id,
    name: result.name,
    isEnabled: result.isEnabled,
    cronExpression: result.cronExpression,
    timezone: result.timezone,
    actions: result.actions,
}, null, 2));
