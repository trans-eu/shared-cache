
# shared-cache
Cache that can be accessed from several browsing contexts (e.g. browser tabs). Based on SharedWorker API 

## Table of contents

- [Usage](#usage)
- [Api](#api)

## Usage

```js
import scharedCache from '@trans-ui/shared-cache';

const cache = new scharedCache({
    name: 'cacheName', // default undefined
    timeout: 20000,  // default 10000
    onError: console.error, // default
});


const promise = new Promise((resolve) => {
    setTimeout(resolve, 1000, 'Value from promise');
});

cache.set('cacheKey', promise);
cache.get('cacheKey').then((val) => console.log(val));
cache.get('cacheKey', 0).catch((val) => console.error(val));
cache.clear();
```

## API

| Name | Params | Returns | Description |
|----|----|----|----|
| `has` | `key: String` - **required**  | Boolean | Check if key exists in cache |
| `get` | `key: String` - **required**, `timeout: Number` | Promise/any | Get value form cache |
| `set` | `key: String` - **required**, `value: Promise \| any` - **required** | - | Set value in cache |
| `delete` | `key: String` - **required**  | - | Delete value from cache depend on key |
| `clear` |  | - | Clear all values from cache |