# edgesearch

Build a full text search API using Cloudflare Workers, WebAssembly, and bit fields.

## Features

- Uses bit fields to search for keywords very quickly, efficiently, and accurately.
- All data is stored in a few MBs of memory as code&mdash;no database or storage required.
- Runs on Cloudflare Workers at edge locations and WebAssembly for fast, scalable performance.

## Usage

Check out the [demo](./demo) folder for live demos with code.

### Building the worker

```typescript
import * as edgesearch from 'edgesearch';

(async () => {
    await edgesearch.build({
        entries: [{
            artists: 'The Weeknd',
            title: 'Blinding Lights',
            album: 'Blinding Lights',
            genre: 'Synthwave, electropop',
            year: '2019',
            length: '3:22',
        }],
        bitfieldElementSize: edgesearch.BitFieldElementSize.uint64_t,
        maximumAutocompleteSuggestions: 5,
        maximumQueryResults: 10,
        maximumQueryWords: 25,
        searchableFields: ['title', 'genre', 'artists'],
        outputDir: './worker',
        wordsExtractor: s => new Set(s.toLowerCase().split(/[\s-;,.]+/)),
    });
})();
```

### Calling the API

|ID|Mode|
|---|---|
|1|Require|
|2|Contain|
|3|Exclude|

```typescript
fetch('https://worker-name.me.workers.dev/search?q=1_artists_weeknd&2_genre_synthwave&2_genre_electropop')
    .then(res => res.json())
    .then(({results, overflow}: {results: Song[], overflow: boolean}) => {
        // Handle search results.
    });
```

## How it works

### Bit fields

All words in a searchable field are combined to form a set of words.
A bit field of *n* bytes, where *n* is the amount of entries, is created for each word in the field.
A bit is set to 1 if its corresponding entry has the word in its field, otherwise it is set to 0.

A bit field has some advantages:

- Very fast, as searching involves bitwise vector operations, which can be even faster with SIMD.
- 100% accurate compared to bloom filters.
- Consistent performance compared to hash-based structures.

Dedicated C code is used to do the bitwise operations (via WebAssembly),
with all the bit fields directly stored in code,
for extremely fast performance.

### Searching

Searching is done by looking for words in a field.
There are three modes for each word:

- require: the word must exist in the field
- contain: at least one word with this mode must exist in the field
- exclude: the word must not exist in the field

The results are generated by doing bitwise operations across multiple bit fields.
The general computation can be summarised as:

```c
result = (req_a & req_b & req_c & ...) & (con_a | con_b | con_c | ...) & ~(exc_a | exc_b | exc_c | ...)
```

Bits set in the resulting bit field are mapped to the entry at their corresponding positions.

### Cloudflare

The entire app runs off a single JavaScript script + accompanying WASM code. It does not need any database or storage, and uses Cloudflare Workers. This allows some cool features:

- Faster than a VM or container with less cold starts, as code is run on a V8 Isolate.
- Naturally distributed to the edge for very low latency, despite being dynamic code.
- Takes advantage of Cloudflare for SSL, caching, and protection.
- No need to worry about scaling, networking, or servers.

The entries data is embedded within the JS code, and the bit fields are `uint64_t` array literals in the C code.