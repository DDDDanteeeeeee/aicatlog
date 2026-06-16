# Commercialization Contract

AI Catalog Agent MVP uses an external-payment plus in-app point-code usage model. Customers buy access outside the product, then redeem activation codes and point codes inside the desktop app.

## Sales Flow

1. User pays on Taobao, Xianyu, WeChat, or another external channel.
2. Seller or automation sends the Windows installer, one activation code, and one or more point codes based on the purchased package.
3. User opens the Agent and enters the activation code.
4. Agent sends the activation request with a device fingerprint.
5. The backend binds that activation code to the first device.
6. User redeems point codes in the app.
7. Before each translation task, the app shows the estimated point cost and asks for confirmation.
8. The backend deducts points before translation and treats `taskId` as the idempotency key.
9. The desktop app extracts and writes `.ai` content locally, but sends text batches to the backend translation proxy.
10. The backend translation proxy calls the maintainer-managed model API and returns translated text only.
11. Failed tasks refund the deducted points by `taskId`.
12. Future verification succeeds only on the bound device unless an admin resets it.

## Backend Endpoints

### POST `/api/license/activate`

Request:

```json
{
  "email": "user@example.com",
  "activationCode": "ABCD-EFGH-IJKL-MNOP-QRST-UVWX",
  "deviceId": "sha256-device-fingerprint",
  "appVersion": "1.0.0"
}
```

Response:

```json
{
  "ok": true,
  "message": "激活成功，当前设备已绑定。",
  "licenseId": "code_xxx",
  "accountEmail": "user@example.com",
  "plan": "standard",
  "expiresAt": null,
  "deviceBinding": "active",
  "licenseToken": "sha256-token"
}
```

### POST `/api/license/verify`

Request:

```json
{
  "email": "user@example.com",
  "activationCode": "ABCD-EFGH-IJKL-MNOP-QRST-UVWX",
  "deviceId": "sha256-device-fingerprint"
}
```

### POST `/api/points/redeem`

Redeems a purchased point code onto the activated license/device.

### POST `/api/points/consume`

Deducts points before a translation task starts. `taskId` is used as the idempotency key.

### POST `/api/points/refund`

Refunds a failed task only when a matching consume record exists for the same license and `taskId`.

### POST `/api/translate/batch`

Translates extracted text batches through the backend model proxy. The request must include the activated license identity, device id, `taskId`, estimated task points, translation rules, glossary, and text frames. The endpoint checks authorization, performs idempotent point consumption, calls the server-side model API key, and returns translated text. The model API key never leaves the backend.

## Admin Operations

Local CLI:

```bash
npm.cmd run license:create
npm.cmd run license:list
node scripts/license-admin.mjs disable <activation-code>
node scripts/license-admin.mjs reset-device <activation-code>
node scripts/license-admin.mjs create monthly --points 100
```

Server admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`:

- `POST /admin/codes`
- `GET /admin/codes`
- `POST /admin/codes/disable`
- `POST /admin/codes/reset-device`

## Runtime Notes

- No in-app payment is required for MVP; external sales channels remain the checkout path.
- Customers see point balance and estimated point cost, not character-price formulas, token costs, or model provider costs.
- Model API configuration is backend-only. It is provided by server environment variables and is not exposed in the customer UI, renderer, local runner, or installer.
- The desktop app sends a deterministic device fingerprint to the license server.
- The backend rejects a second device for the same activation code unless an admin resets the binding.
