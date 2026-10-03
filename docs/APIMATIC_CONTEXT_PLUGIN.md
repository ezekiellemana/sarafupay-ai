# Using the APIMatic Context Plugin for PayPal

SarafuPay collects contributions through PayPal Orders v2 with `@paypal/paypal-server-sdk`, the APIMatic-generated PayPal Server SDK. To harden that integration we gave our AI coding agent (Claude Code) the **APIMatic Context Plugin for PayPal** and had it audit our SDK code against the plugin's TypeScript skills.

## Install

```bash
npx context-plugins install https://github.com/paypaldev/server-sdk-context-plugin-preview
```

This installs the `paypal` plugin into Claude Code, with its `typescript-*` skills: getting-started, client-initialization, authentication, calling-endpoints, models, error-handling, configuration-resilience and testing.

## What the plugin caught

The agent loaded `typescript-getting-started`, `typescript-error-handling` and `typescript-configuration-resilience`, then checked each claim against the installed SDK source (`node_modules/@paypal/paypal-server-sdk/src`).

| # | Finding (from the plugin) | Where in our code | Fix |
|---|---|---|---|
| 1 | The SDK's generated `DEFAULT_CONFIGURATION.timeout` is `0`, and axios treats `0` as **no timeout**. The adapter's 30 s default does not apply because `0` is a real value. | `lib/paypal/client.ts` set `timeout: 0` explicitly, so a stalled PayPal call could hang the WhatsApp agent forever. | Set `timeout: 20_000` (per attempt) at top level and in `httpClientOptions`. |
| 2 | `DEFAULT_RETRY_CONFIG` has `maxNumberOfRetries: 0` **and** `maximumRetryWaitTime: 0`. Raising the retry count alone does nothing while the wait budget is 0. | No retries at all, even for safe reads. | Set both: 2 retries, a 10 s budget, `GET` only. POSTs stay un-retried by the SDK, and create/capture rely on `PayPal-Request-Id` instead. |
| 3 | Every Orders operation throws `CustomError` (a typed `ApiError`) whose payload keeps the **wire field names** (`debug_id`, `details[].issue`), not camelCase. | `captureOrder` caught **any** error and re-read the order, which hid real failures such as auth, 5xx or declines. | Fall back to `getOrder` only on `422` with issue `ORDER_ALREADY_CAPTURED` (the webhook/return-URL race). Log `name`, `issue` and `debug_id` for everything else and rethrow. Non-API errors are rethrown untouched. |
| 4 | Capture is a POST, so it is never retried by the SDK. Idempotency must come from the request. | `captureOrder` sent no idempotency key. | Added `paypalRequestId: capture-<orderId>`. |
| 5 | Pin the exact SDK version, because regenerating the SDK publishes new versions and a caret range moves the surface silently. | `"^2.5.0"` | `"2.5.0"` in `package.json` and the lockfile. |

The plugin's skills also confirmed what we already had right: the `clientCredentialsAuthCredentials` property name, controllers constructed with `new OrdersController(client)`, the collapsed options-object call form, `Environment.Sandbox`, and the built-in `logging` config.

## Result

- `lib/paypal/client.ts`: bounded timeouts and safe GET retries
- `lib/paypal/orders.ts`: typed `CustomError` handling, idempotent capture, `debug_id` logging
- `npm run typecheck`, `npm run lint` and `npm test` all pass
