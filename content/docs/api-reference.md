# API reference

The public REST API (version 1) lets corporate customers and integrations (online stores, marketplaces, point-of-sale systems) create and follow shipments. It needs a plan that includes **API access**.

## Authentication

Create a key in **Settings, API and webhooks**. The key is shown once, and only a hash is stored. A key can be limited to scopes, and bound to one corporate customer so it only sees and creates that customer's shipments.

```
Authorization: Bearer lgx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Always call the API over HTTPS from a server. Never put a key in a browser or mobile app.

## Limits and errors

* **Rate limit:** 120 requests per minute per key. Over the limit you receive `429` with a `Retry-After` header.
* **Errors** share one shape:

```json
{ "error": { "code": "VALIDATION", "message": "…" } }
```

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | Missing or invalid key. |
| `FORBIDDEN` | 403 | The key lacks the scope, or the account has no API access. |
| `NOT_FOUND` | 404 | No such shipment for this key. |
| `VALIDATION` | 422 | A field is missing or invalid. |
| `CONFLICT` / `INVALID_STATE` | 409 | The action is not allowed in the current state. |
| `LIMIT_EXCEEDED`, `FEATURE_UNAVAILABLE`, `SUBSCRIPTION_INACTIVE` | 402 | Plan limit reached, or the subscription does not allow it. |
| `RATE_LIMITED` | 429 | Too many requests. |
| `NOT_CONFIGURED` | 501 | For example, no pricing rule matches this route. |

## Endpoints

| Method and path | Scope | Description |
|---|---|---|
| `POST /api/v1/shipments` | `shipments:create` | Create a shipment. |
| `GET /api/v1/shipments` | `shipments:read` | List shipments. Query: `limit`, `cursor`, `status`. |
| `GET /api/v1/shipments/{ref}` | `shipments:read` | One shipment with its public timeline. `ref` is a tracking number or order number. |
| `POST /api/v1/shipments/{ref}/cancel` | `shipments:cancel` | Cancel while the lifecycle still allows it. |
| `GET /api/v1/track/{trackingNumber}` | `tracking:read` | A lightweight status. |

## Create a shipment

Send `Idempotency-Key: <unique value>` on every create. If a request is retried with the same key, you receive the original shipment, so retries never duplicate. The shipment is priced from the company's pricing rules. If no rule matches the route the API returns `501 NOT_CONFIGURED` rather than guessing a price.

```bash
curl -X POST https://your-domain/api/v1/shipments \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-10042" \
  -d '{
    "senderName": "Zuri Fashion",
    "senderPhone": "08011112222",
    "pickupAddress": "7 Yaba Market Rd",
    "pickupCity": "Yaba",
    "pickupState": "Lagos",
    "recipientName": "Ada",
    "recipientPhone": "08033334444",
    "deliveryAddress": "9 Admiralty Way",
    "deliveryCity": "Lekki",
    "deliveryState": "Lagos",
    "packageDescription": "Dress",
    "weightKg": 1.5,
    "codAmount": 18000
  }'
```

### Fields

| Field | Required | Notes |
|---|---|---|
| `senderName`, `senderPhone` | Yes | Phone in local or international format. |
| `senderEmail` | No | |
| `pickupAddress`, `pickupCity`, `pickupState` | Yes | |
| `recipientName`, `recipientPhone` | Yes | |
| `recipientEmail` | No | |
| `deliveryMethod` | No | `HOME_DELIVERY` (default) or `HUB_PICKUP`. |
| `deliveryAddress`, `deliveryCity`, `deliveryState` | For home delivery | Not needed for hub pickup. |
| `collectionHubId` | For hub pickup | The hub must have customer collection enabled. |
| `packageDescription` | Yes | |
| `packageType` | No | `DOCUMENT`, `PARCEL` (default), `FRAGILE`, `FOOD`, `PHARMACY`, `GROCERY`, `ELECTRONICS`, `FREIGHT`, `OTHER`. |
| `weightKg`, `quantity` | No | Default 1. |
| `lengthCm`, `widthCm`, `heightCm` | No | |
| `declaredValue` | No | Default 0. |
| `codAmount` | No | Cash to collect from the recipient. Default 0. |
| `priority` | No | `STANDARD` (default), `EXPRESS`, `URGENT`, `SAME_DAY`. |
| `feePayer` | No | `SENDER` (default) or `RECIPIENT`. |
| `pickupScheduledAt` | No | ISO date and time. |
| `specialInstructions` | No | |

For collection at a hub or pickup point, send `"deliveryMethod": "HUB_PICKUP"` and `"collectionHubId": "<hub id>"` instead of the delivery address fields.

## Shipment statuses

`CREATED`, `CONFIRMED`, `PICKUP_ASSIGNED`, `PICKED_UP`, `AT_HUB`, `SORTING`, `READY_FOR_DISPATCH`, `READY_FOR_PICKUP`, `ASSIGNED_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `DELIVERY_FAILED`, `RESCHEDULED`, `RETURNING`, `RETURNED_TO_HUB`, `RETURNED_TO_SENDER`, `CANCELLED`.

## List with pagination

```bash
curl "https://your-domain/api/v1/shipments?limit=25&status=OUT_FOR_DELIVERY" -H "Authorization: Bearer $KEY"
```

The response is `{ "data": [...], "nextCursor": "..." }`; `nextCursor` is `null` on the last page. Pass it back as `cursor` to fetch the next page.

## Webhooks

Add an HTTPS endpoint under **Settings, API and webhooks**. Only public HTTPS addresses are accepted. The event is `shipment.status_changed`:

```json
{
  "id": "9f2c41a7b3d80e15",
  "event": "shipment.status_changed",
  "createdAt": "2026-10-19T10:15:00.000Z",
  "data": {
    "trackingNumber": "LXAB12CD34",
    "orderNumber": "SHP-000231",
    "status": "OUT_FOR_DELIVERY",
    "description": "Out for delivery",
    "at": "2026-10-19T10:15:00.000Z"
  }
}
```

### Verify the signature

Each request carries `X-Webhook-Timestamp` and `X-Webhook-Signature: v1=<hex>`, where the hex value is `HMAC_SHA256(secret, timestamp + "." + rawBody)`. Compute it over the **raw request body** before parsing, compare in constant time, and reject requests whose timestamp (in seconds since 1970) is more than about 5 minutes old.

Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(rawBody, headers, secret) {
  const ts = headers["x-webhook-timestamp"];
  const sig = (headers["x-webhook-signature"] || "").replace(/^v1=/, "");
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // timestamp is in seconds
  const expected = createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Python:

```python
import hmac, hashlib

def verify(raw_body: bytes, headers, secret: str) -> bool:
    ts = headers.get("X-Webhook-Timestamp", "")
    sig = headers.get("X-Webhook-Signature", "").removeprefix("v1=")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
```

Respond with any `2xx` status quickly. A delivery is attempted twice with a 5-second timeout, and there is no delivery queue or log yet, so make your handler idempotent and fall back to `GET /api/v1/shipments/{ref}` if you miss an event.
