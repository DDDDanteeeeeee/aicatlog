# AI Catalog Cloud Proxy Deployment - 2026-06-15

Upload these files to the Ubuntu server:

- `server/license-core.mjs` -> `/opt/ai-catalog-license/server/license-core.mjs`
- `server/license-server.mjs` -> `/opt/ai-catalog-license/server/license-server.mjs`
- `server/model-proxy.mjs` -> `/opt/ai-catalog-license/server/model-proxy.mjs`

Then run on the server:

```bash
sudo chown aiagent:aiagent /opt/ai-catalog-license/server/license-core.mjs /opt/ai-catalog-license/server/license-server.mjs /opt/ai-catalog-license/server/model-proxy.mjs
sudo node --check /opt/ai-catalog-license/server/license-core.mjs
sudo node --check /opt/ai-catalog-license/server/license-server.mjs
sudo node --check /opt/ai-catalog-license/server/model-proxy.mjs
sudo systemctl restart ai-catalog-license.service
sleep 2
sudo systemctl --no-pager --full status ai-catalog-license.service
curl -s http://127.0.0.1:8787/health; echo
```
