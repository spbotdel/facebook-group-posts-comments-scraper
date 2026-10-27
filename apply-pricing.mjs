const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) throw new Error('APIFY_TOKEN is required.');
const ACTOR_ID = 'D4fo5uWHFVEb4FYJ2';

const tiered = ({ free, paid }) => Object.fromEntries(
    ['FREE', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'DIAMOND']
        .map((tier) => [tier, { tieredEventPriceUsd: tier === 'FREE' ? free : paid }]),
);

const pricing = {
    pricingModel: 'PAY_PER_EVENT',
    isPPEPlatformUsagePaidByUser: false,
    minimalMaxTotalChargeUsd: 0.02,
    pricingPerEvent: {
        actorChargeEvents: {
            'apify-actor-start': {
                eventTitle: 'Actor Start',
                eventDescription: 'Charged when the Actor starts running. Number of events charged depends on Actor memory (one event per GB, minimum one event).',
                isOneTimeEvent: true,
                eventPriceUsd: 0.005,
            },
            post: {
                eventTitle: 'Post',
                eventDescription: 'One public post returned by the Actor. Comments do not change the post price.',
                isOneTimeEvent: false,
                isPrimaryEvent: true,
                eventTieredPricingUsd: tiered({ free: 0.006, paid: 0.003 }),
            },
            comment: {
                eventTitle: 'Comment',
                eventDescription: 'One public comment or reply returned by the Actor.',
                isOneTimeEvent: false,
                eventTieredPricingUsd: tiered({ free: 0.002, paid: 0.001 }),
            },
        },
    },
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

const before = (await api(`acts/${ACTOR_ID}`)).data;
console.log('before:', JSON.stringify({
    isPublic: before.isPublic,
    pricingEntries: (before.pricingInfos || []).length,
}));

await api(`actors/${ACTOR_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pricingInfos: [pricing] }),
});

const after = (await api(`acts/${ACTOR_ID}`)).data;
const info = (after.pricingInfos || [])[0];
if (!info) throw new Error('Pricing was not applied.');

console.log('after:', JSON.stringify({
    isPublic: after.isPublic,
    pricingModel: info.pricingModel,
    platformUsagePaidByUser: info.isPPEPlatformUsagePaidByUser,
    minimalMaxTotalChargeUsd: info.minimalMaxTotalChargeUsd,
    events: Object.fromEntries(
        Object.entries(info.pricingPerEvent?.actorChargeEvents || {}).map(([name, event]) => [
            name,
            {
                title: event.eventTitle,
                primary: Boolean(event.isPrimaryEvent),
                oneTime: Boolean(event.isOneTimeEvent),
                flat: event.eventPriceUsd ?? null,
                free: event.eventTieredPricingUsd?.FREE?.tieredEventPriceUsd ?? null,
                paid: event.eventTieredPricingUsd?.BRONZE?.tieredEventPriceUsd ?? null,
            },
        ]),
    ),
}, null, 2));
