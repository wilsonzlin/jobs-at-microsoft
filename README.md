# Edgesearch

Build a full text search API using Cloudflare Workers and WebAssembly.

## Features

- Uses an [inverted index](https://en.wikipedia.org/wiki/Inverted_index) and [compressed bit sets](https://roaringbitmap.org/).
- No servers or databases to create, manage, or scale.
- Packs large amounts of data in relatively few [KV entries](https://www.cloudflare.com/products/workers-kv/).
- Runs fast [WASM](https://webassembly.org/) code at Cloudflare edge PoPs for low-latency requests.

## Demos

Check out the [demo](./demo) folder for live demos with source code.

## How it works

Edgesearch builds a reverse index by mapping terms to a compressed bit set (using Roaring Bitmaps) of IDs of documents containing the term, and creates a custom worker script and data to upload to Cloudflare Workers.

### Data

An array of term-documents pairs sorted by term is built, where *term* is a string and *documents* is a compressed bit set.

This array is then split into chunks of up to 10 MiB, as each Cloudflare Workers KV entry can hold a value up to 10 MiB in size.

To find the documents bit set associated with a term, a binary search is done to find the appropriate chunk, and then the pair within the chunk.

The same structure and process is used to store and retrieve document contents.

Packing multiple bit sets/documents reduces read/write costs and deploy times, and improves caching and execution speed due to fewer fetches.

### Searching

Search terms have an associated mode. There are three modes that match documents in different ways:

|Mode|Document match condition|
|---|---|
|Require|Has all terms with this mode.|
|Contain|Has at least one term with this mode.|
|Exclude|Has none of the terms with this mode.|

For example, a document with terms `a`, `b`, `c`, `d`, and `e` would match the query `require (d, a) contain (g, b, f) exclude (h, i)`.

The results are generated by doing bitwise operations across multiple bit sets.
The general computation could be summarised as:

```c
result = (req_a & req_b & req_c & ...) & (con_a | con_b | con_c | ...) & ~(exc_a | exc_b | exc_c | ...)
```

### Cloudflare

There are some nice advantages when only using Cloudflare Workers:

- Faster than a VM or container with less cold starts, as code is run on a V8 Isolate.
- Naturally distributed to the edge for very low latency.
- Takes advantage of Cloudflare for SSL, caching, and distribution.
- No need to worry about scaling, networking, or servers.

### WebAssembly

The [C implementation](https://github.com/RoaringBitmap/CRoaring) of Roaring Bitmaps is compiled to WebAssembly. A [basic implementation](./wasm/) of essential C standard library functionality is implemented to make compilation possible.

## Usage

### Get the CLI

Precompiled binaries are available for x86-64:

[Linux](https://wilsonl.in/edgesearch/bin/0.3.2-linux-x86_64) |
[macOS](https://wilsonl.in/edgesearch/bin/0.3.2-macos-x86_64) |
[Windows](https://wilsonl.in/edgesearch/bin/0.3.2-windows-x86_64.exe)

### Build the worker

The data needs to be formatted into two files:

- *Documents*: contents of all documents, delimited by NULL ('\0'), including at the end.
- *Document terms*: terms for each corresponding document. Each term and document must end with NULL ('\0').

This format allows for simple reading and writing without libraries, parsers, or loading data into memory.
Terms are separate from documents for easy switching between or testing of different documents-terms mappings.

The relation between a document's terms and content is irrelevant to Edgesearch and terms do not necessarily have to be words from the document.

A document must be a JSON serialised value, such as `"hello"`, `123`, or `{"prop1": 1, "prop2": {}}`.

For example:

|File|Contents|
|---|---|
|documents.txt|`{"title":"Stupid Love","artist":"Lady Gaga","year":2020}` `\0` <br> `{"title":"Don't Start Now","artist":"Dua Lipa","year":2020}` `\0` <br> ...|
|document-terms.txt|`title_stupid` `\0` `title_love` `\0` `artist_lady` `\0` `artist_gaga` `\0` `year_2020` `\0` `\0` <br> `title_dont` `\0` `title_start` `\0` `title_now` `\0` `artist_dua` `\0` `artist_lipa` `\0` `year_2020` `\0` `\0` <br> ...|

An folder needs to be provided for Edgesearch to write temporary and built code and data files. It's advised to provide a folder for the exclusive use of Edgesearch with no other contents.

```bash
edgesearch build \
  --documents documents.txt \
  --document-terms document-terms.txt \
  --maximum-query-results 20 \
  --output-dir dist/worker/
```

### Deploy the worker

[edgesearch-deploy-cloudflare](./deployer/cloudflare) handles deploying to Cloudflare.

This will upload the worker script and associated WASM to Cloudflare Workers, and write every key to Cloudflare Workers KV:

```bash
npx edgesearch-deploy-cloudflare \
  --account-id CF_ACCOUNT_ID \
  --account-email me@email.com \
  --global-api-key CF_GLOBAL_API_KEY \
  --name my-edgesearch \
  --output-dir dist/worker/ \
  --namespace CF_KV_NAMESPACE_ID \
  --upload-data
```

### Testing locally

[edgesearch-test-server](./tester) loads a built worker script and WASM binary to run locally.

This will create a local server on port 8080:

```bash
npx edgesearch-test-server \
  --output-dir /path/to/edgesearch/build/output/dir/ \
  --port 8080
```

The client can be used with a local test server; provide the origin (e.g. `http://localhost:8080`) to the constructor (see below).

### Calling the API

A JavaScript [client](./client/) for the browser and Node.js is available for using a deployed Edgesearch worker:

```typescript
import * as Edgesearch from 'edgesearch-client';

type Document = {
  title: string;
  artist: string;
  year: number;
};

const client = new Edgesearch.Client<Document>('https://my-edgesearch.me.workers.dev');
const query = new Edgesearch.Query();
query.add(Edgesearch.Mode.REQUIRE, 'world');
query.add(Edgesearch.Mode.CONTAIN, 'hello', 'welcome', 'greetings');
query.add(Edgesearch.Mode.EXCLUDE, 'bye', 'goodbye');
let response = await client.search(query);
query.setContinuation(response.continuation);
response = await client.search(query);
```

## Performance

Searches that retrieve entries not cached at edge locations will be slow. To reduce cache misses, ensure that there is consistent traffic.
