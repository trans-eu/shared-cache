/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-globals */
import MapSet from './MapSet';
import STATUS from './status.json';

const caches = new Map();
const pendingResolves = new MapSet({ length: 2 });

const getCache = (cacheName) => {
    if (!caches.has(cacheName)) {
        const cache = new Map();
        caches.set(cacheName, cache);
        return cache;
    }
    return caches.get(cacheName);
};

// List of all ports open for communication.
const ports = new Set();

// When a global worker error occurs, send message to all open ports.
const onError = (error) => ports.forEach((port) => port.postMessage({ error }));

const onConnect = (e) => {
    const port = e.ports[0];
    ports.add(port);

    // When an error specific to a given port occurs, send message only to that port.
    const postErrorMessage = (error) => port.postMessage({ error });

    // eslint-disable-next-line consistent-return
    port.onmessage = ({ data = {} }) => {
        const {
            // Name used to identify cache.
            cacheName,
            // Call id, used for associating postMessages between worker and client.
            callId,
            // Function name to be called.
            fn,
            // Arguments for that function.
            args,
        } = data;

        const api = {
            has: ({ key }) => {
                const message = getCache(cacheName).has(key);
                port.postMessage({ callId, message }); // Message's a boolean value here
            },

            get: ({ key, timeout }) => {
                const {
                    value,
                    status = STATUS.SYNC,
                    callId: setBy,
                } = getCache(cacheName).get(key) || {};

                if (status !== STATUS.PENDING) {
                    // Send message to client only when the value is settled.
                    port.postMessage({ callId, message: { value, status } });
                    return;
                }

                let timeoutId;

                // Wait until original caller that had set value as pending, sets final value.
                new Promise((resolve) => {
                    // The path consists of key and call id.
                    const path = [key, setBy];
                    // Resolve callbacks being set here, are called in "set" method.
                    pendingResolves.add(path, resolve);
                    // Don't wait forever as tab with caller could be already closed.
                    timeoutId = setTimeout(() => {
                        // Delete only this single promise from pending resolves Set.
                        // Other promises can have different timeouts.
                        pendingResolves.delete(path, resolve);
                        resolve({
                            status: STATUS.REJECTED,
                            value: 'SharedCache get function timeout',
                        });
                    }, timeout);
                }).then((message) => {
                    // Send message with value when promise resolves:
                    // - could be resolved by timeout
                    // - or by "set" method called with final value
                    clearTimeout(timeoutId);
                    port.postMessage({ callId, message });
                });
            },

            set: ({ key, status, value }) => {
                const cache = getCache(cacheName);
                const setBy = cache.has(key) ? cache.get(key).callId : undefined;

                // Allow setting (or overwriting) a cache item under given key when:
                // - the item is being set with PENDING status (client's Promise is yet unsettled)
                // - the item is being set with SYNC status (synchronously)
                // - the item was previously set by the same caller
                if (status === STATUS.PENDING || status === STATUS.SYNC || setBy === callId) {
                    cache.set(key, { value, status, callId });
                }

                // Promise on the client side is settled when its status is FULFILLED or REJECTED.
                const isPromiseSettled = [STATUS.FULFILLED, STATUS.REJECTED].includes(status);

                // When setting value that comes from settled client's Promise (i.e. when "status"
                // has value of FULFILLED or REJECTED) check if there are any pending resolve callbacks
                // to be called (they are being added in "get" method). If so, call them.
                const path = [key, callId];
                if (isPromiseSettled && pendingResolves.has(path)) {
                    pendingResolves.get(path).forEach((resolve) => resolve({ status, value }));
                    pendingResolves.clear(path);
                }

                if (!isPromiseSettled) {
                    port.postMessage({ callId });
                }
            },

            delete({ key }) {
                const cache = getCache(cacheName);
                cache.delete(key);
            },

            clear() {
                const cache = getCache(cacheName);
                cache.clear();
            },

            disconnect: () => {
                port.close();
                ports.delete(port);
            },
        };

        if (!fn) {
            return postErrorMessage('SharedCache: The name of the function to be called has not been provided.');
        }

        if (!api[fn]) {
            return postErrorMessage(`SharedCache: Tried to call an unknown function: ${fn}`);
        }

        // Call appropriate function with arguments.
        api[fn](args);
    };
};

if (self.hasOwnProperty('onconnect')) {
    // If that is a SharedWorker set the SharedWorkerGlobalScope's "onconnect" event handler.
    self.onconnect = onConnect;
} else {
    // If this is not a SharedWorker, that means we have to call onConnect manually with forged event.
    onConnect({ ports: [self] });
}

self.onerror = onError;
