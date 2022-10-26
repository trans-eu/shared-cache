const cleanup = (mapSet, path) => {
    path.forEach((_key, i) => {
        const subpath = path.slice(0, path.length - i);
        if (mapSet.has(subpath) && !mapSet.get(subpath).size) {
            const key = subpath.pop();
            mapSet.get(subpath).delete(key);
        }
    });
};

const empty = {
    has: () => false,
    get: () => empty,
};

function MapSet({ length }) {
    const maxIndex = length - 1;
    const model = new Map();

    return {
        has(path) {
            return path.reduce((prev, curr, i) => {
                if (i !== maxIndex) {
                    return prev.get(curr) || empty;
                }
                return prev.has(curr);
            }, model);
        },
        get(path) {
            return path.reduce((prev, curr, i) => {
                let next = prev.get(curr);
                if (!next) {
                    next = new (maxIndex === i ? Set : Map)();
                    prev.set(curr, next);
                }
                return next;
            }, model);
        },
        add(path, value) {
            this.get(path).add(value);
        },
        delete(path, value) {
            if (this.has(path)) {
                this.get(path).delete(value);
            }

            cleanup(this, path);
        },
        clear(path) {
            if (this.has(path)) {
                this.get(path).clear();
            }

            cleanup(this, path);
        },
    };
}

export default MapSet;
