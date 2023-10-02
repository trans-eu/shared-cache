import STATUS from './status.json';

const getUUID = globalThis?.crypto?.randomUUID
    ? globalThis.crypto.randomUUID.bind(crypto)
    : () => {
        const callId = URL.createObjectURL(new Blob());
        URL.revokeObjectURL(callId);
        return callId;
    };

class SharedCache {
    constructor({
        // Name is used to identify cache in worker as one worker can have multiple caches.
        name,
        // The maximum amount of waiting time (in milis) for a worker's response ("get" calls only).
        timeout = 3_000,
        onError = console.error, // eslint-disable-line no-console
    } = {}) {
        // Map of "onmessage" callbacks mapped by call ids.
        this._pendingCallbacks = new Map();
        this._cacheName = name;
        this._timeout = timeout;
        this._worker = window.SharedWorker
            ? new SharedWorker(new URL('./worker.js', import.meta.url)).port
            : new Worker(new URL('./worker.js', import.meta.url));

        this._worker.onmessage = ({ data = {} }) => {
            const { callId, message, error } = data;

            // If received message contains error, call onError callback.
            if (error) onError(error);

            // Call callback for this call id (if there's one).
            if (this._pendingCallbacks.has(callId)) {
                this._pendingCallbacks.get(callId)(message);
                this._pendingCallbacks.delete(callId);
            }
        };

        window.addEventListener('beforeunload', () => this._worker.postMessage({
            fn: 'disconnect',
        }));
    }

    _getRemoteCall = (fn, onMessageCallback) => {
        // Create a call id that's unique across all tabs.
        const callId = getUUID();

        // Postpone the callback until received a message from the worker.
        this._pendingCallbacks.set(callId, onMessageCallback);

        // Return a function that calls postMessage method.
        return (args) => this._worker.postMessage({
            callId,
            cacheName: this._cacheName,
            fn,
            args,
        });
    }

    has(key) {
        return new Promise((resolve) => {
            this._getRemoteCall('has', resolve)({ key });
        });
    }

    get(key, timeout = this._timeout) {
        return new Promise((resolve, reject) => {
            const onMessageCallback = (message) => {
                const { status, value } = message;
                // This callback won't ever be called with PENDING status
                // so it's either REJECTED or SYNC/FULFILLED.
                (status === STATUS.REJECTED ? reject : resolve)(value);
            };
            const remoteCall = this._getRemoteCall('get', onMessageCallback);
            remoteCall({ key, timeout });
        });
    }

    set(key, value) {
        // Promise returned from "set" method resolves with SharedWorker instance.
        return new Promise((resolve) => {
            // Every "postMessage" call issued in context of a single "set" call must have the same call id.
            // It allows the worker to identify which caller had set which value.
            // This helps to prevent race conditions (finishing promises set by different caller).
            const remoteCall = this._getRemoteCall('set', () => resolve(this));

            if (value.then && value.catch) {
                // When setting a value that is a Promise or a Promise-like object, first set cache item
                // with PENDING status and with undefined value.
                remoteCall({ key, status: STATUS.PENDING, value: undefined });

                // Then wait for the Promise to resolve/reject and call the worker again with settled value.
                value
                    .then((data) => [STATUS.FULFILLED, data])
                    .catch((reason) => [STATUS.REJECTED, reason])
                    // When promise finishes - set it's value in cache.
                    .then(([status, result]) => {
                        remoteCall({ key, status, value: result });
                    });
            } else {
                // When setting an already known value that is not a Promise, set it synchronously.
                remoteCall({ key, status: STATUS.SYNC, value });
            }
        });
    }

    delete(key) {
        return new Promise((resolve) => {
            this._getRemoteCall('delete', resolve)({ key });
        });
    }

    clear() {
        return new Promise((resolve) => {
            this._getRemoteCall('clear', resolve)();
        });
    }
}

export default SharedCache;
