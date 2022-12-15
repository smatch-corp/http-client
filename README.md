# @smatch-corp/http-client

Highly subjectively customized HTTP client library based on [Ky](https://github.com/sindresorhus/ky).

## Installation

```bash
# THIS IS NOT PUBLISEHD ON PUBLIC NPM REGISTRY.
yarn add @smatch-corp/http-client
```

## Usage

```ts
const api = createHttpClient(env.baseUrl, {
  logging: true,
  refresh: async (request, next) => {
    const refreshedAccessToken = await doSomething()
    request.headers.set('Authorization', `Bearer ${refreshedAccessToken}`);

    next(request);
  }
  // ... Ky options
});

api.post(/* ... */);
```