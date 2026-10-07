# Public REST API (v1)

For corporate clients and integrations (e-commerce, marketplaces, POS). Requires the **API access** feature (Premium+). Create keys in **Settings → API & webhooks**; the key is shown once and only a SHA-256 hash is stored. Keys can be restricted to one corporate customer (then they only see/create that customer's shipments, and the account must have *API enabled*).

```
Authorization: Bearer lgx_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Rate limit: 120 requests/minute per key (`429` + `Retry-After`). Errors: `{ "error": { "code": "VALIDATION|FORBIDDEN|NOT_FOUND|...", "message": "…" } }`.

| Method & path | Scope | Description |
|---|---|---|
| `POST /api/v1/shipments` | `shipments:create` | Create a shipment. Send `Idempotency-Key: <unique>` so retries never duplicate. Priced from the company's pricing rules; if no rule matches → `501 NOT_CONFIGURED`. |
| `GET /api/v1/shipments?limit=25&cursor=…&status=…` | `shipments:read` | List (cursor pagination, `nextCursor`). |
| `GET /api/v1/shipments/{trackingNumber\|orderNumber}` | `shipments:read` | Shipment + public timeline. |
| `POST /api/v1/shipments/{ref}/cancel` | `shipments:cancel` | Cancel (only while the lifecycle allows). |
| `GET /api/v1/track/{trackingNumber}` | `tracking:read` | Lightweight status. |

Example:

```bash
curl -X POST https://app.example.com/api/v1/shipments \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -H "Idempotency-Key: order-10042" \
  -d '{"senderName":"Zuri Fashion","senderPhone":"08011112222","pickupAddress":"7 Yaba Market Rd","pickupCity":"Yaba","pickupState":"Lagos",
       "recipientName":"Ada","recipientPhone":"08033334444","deliveryAddress":"9 Admiralty Way","deliveryCity":"Lekki","deliveryState":"Lagos",
       "packageDescription":"Dress","weightKg":1.5,"codAmount":18000}'
```

For collection at a hub / pickup point, send `"deliveryMethod":"HUB_PICKUP"` and `"collectionHubId":"<hub id>"` instead of the delivery address fields (the hub must have customer collection enabled).

## Webhooks

Add an HTTPS endpoint (public address only) in Settings. Event `shipment.status_changed`:

```json
{ "id":"…", "event":"shipment.status_changed", "createdAt":"…", "data": { "trackingNumber":"…", "orderNumber":"…", "status":"OUT_FOR_DELIVERY", "description":"…", "at":"…" } }
```

Headers: `X-Webhook-Timestamp` and `X-Webhook-Signature: v1=<hex>` where `hex = HMAC_SHA256(secret, timestamp + "." + rawBody)`. Reject requests whose timestamp is older than ~5 minutes. Delivery is attempted twice with a 5 s timeout (no delivery log/queue yet).
