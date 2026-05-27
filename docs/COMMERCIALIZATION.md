# Commercialization Contract

AI Catalog Agent MVP uses an external-payment plus activation-code sales model.

## Sales Flow

1. User pays on Taobao, Xianyu, WeChat, or another external channel.
2. Seller sends the Windows installer and one activation code.
3. User opens the Agent and enters email/account plus activation code.
4. Agent sends the activation request with a device fingerprint.
5. The backend binds that activation code to the first device.
6. Future verification succeeds only on the bound device unless an admin resets it.

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

## Admin Operations

Local CLI:

```bash
npm.cmd run license:create
npm.cmd run license:list
node scripts/license-admin.mjs disable <activation-code>
node scripts/license-admin.mjs reset-device <activation-code>
```

Server admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>`:

- `POST /admin/codes`
- `GET /admin/codes`
- `POST /admin/codes/disable`
- `POST /admin/codes/reset-device`

## Runtime Notes

- No in-app payment is required for MVP.
- API Key and password are saved through Electron `safeStorage`.
- The desktop app sends a deterministic device fingerprint to the license server.
- The backend rejects a second device for the same activation code unless an admin resets the binding.
