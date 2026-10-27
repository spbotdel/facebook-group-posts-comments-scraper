// Adapter that lets vendored engine code run in-process inside Actor B.
// Engines keep their scraping logic verbatim; only Actor I/O boundaries are
// swapped for this context, so rows and KV values land in the parent run.
export function createEngineContext({ onStatus = null } = {}) {
    const rows = [];
    const values = {};
    return {
        rows,
        values,
        // Engines are unmonetized internally: charging stays owned by Actor B.
        chargingManager: {
            getPricingInfo: () => ({
                pricingModel: null,
                isPayPerEvent: false,
                perEventPrices: {},
                maxTotalChargeUsd: null,
            }),
            getChargedEventCount: () => 0,
            getMaxTotalChargeUsd: () => undefined,
            calculateMaxEventChargeCountWithinLimit: () => Infinity,
            charge: async () => ({ chargedCount: 0, eventChargeLimitReached: false }),
        },
        push: async (item) => {
            // Engines push dataset batches as arrays, mirroring Actor.pushData.
            if (Array.isArray(item)) rows.push(...item);
            else rows.push(item);
        },
        setValue: async (key, value) => {
            values[key] = value;
        },
        setStatus: async (message) => {
            if (onStatus) await onStatus(message);
        },
        snapshot: () => ({ rows, values }),
    };
}
