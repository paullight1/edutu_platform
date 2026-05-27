# Edutu Scraper Engine - Production Configuration

## Deployment Platforms

### Option 1: Render.com
```yaml
# render.yaml
services:
  - type: web
    name: edutu-scraper-api
    env: node
    region: oregon
    buildCommand: npm install && npx playwright install --with-deps chromium
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
      - key: OPENAI_API_KEY
        sync: false
      - key: SUPABASE_URL
        sync: false
      - key: SUPABASE_SERVICE_ROLE_KEY
        sync: false
      - key: API_KEY
        sync: false
    autoDeploy: false
    healthCheckPath: /health/simple
```

### Option 2: Railway
```json
{
  "build": {
    "builder": "NIXPACKS_NODE_CMN",
    "options": {
      "installCommand": "npm install && npx playwright install --with-deps chromium"
    }
  },
  "run": {
    "command": "npm start",
    "runtime": "NODE_VERSION"
  }
}
```

### Option 3: Fly.io
```toml
# fly.toml
app = "edutu-scraper-api"

[build]
  builder = "paketobuildpacks/builder:nodejs"

[[services]]
  http_checks = []
  internal_port = 3001
  processes = ["app"]

[[services.ports]]
  port = 10000

[[services.env]]
  key = "NODE_ENV"
  value = "production"

[[services.env]]
  key = "PORT"
  value = "8080"
```

## Environment Variables (Production)

```env
# Required
NODE_ENV=production
PORT=3001

# Supabase (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (Required)
OPENAI_API_KEY=sk-your-openai-key

# API Security (Required - generate a secure key)
API_KEY=your-secure-random-api-key-min-32-chars
ADMIN_EMAILS=admin@edutu.org,youremail@example.com

# Optional: Monitoring
SENTRY_DSN=https://your-sentry-dsn
LOG_LEVEL=info
```

## Playwright Setup (Production)

The scraper uses Playwright for browser automation. In production:

1. **Install Chromium** - Add to your build command:
```bash
npx playwright install --with-deps chromium
```

2. **Alternative: Use puppeteer** - If Playwright is too heavy:
```bash
npm uninstall playwright
npm install puppeteer-core
```

## Health Checks

Production health check endpoints:
- `/health` - Full async health check with dependencies
- `/health/simple` - Quick check (no async)
- `/health/detailed` - Detailed system status

## Scaling Considerations

### Horizontal Scaling
If running on multiple instances:
- Use Redis for rate limiting across instances
- Use Supabase for shared state
- Configure `sourceQueues` to be Redis-backed

### Rate Limits
- Global: 10 requests/minute per source
- OpenAI: Subject to your API tier limits
- Supabase: 60 requests/minute (free tier)

## Troubleshooting

### Common Production Issues

1. **Playwright not launching**
   - Ensure browser is installed in build: `npx playwright install chromium`
   - Check memory limits (requires ~1GB)

2. **OpenAI rate limits**
   - Add retry logic (already included)
   - Consider using gpt-4o-mini for lower costs

3. **Supabase connection issues**
   - Check service role key permissions
   - Verify IP allowlist if strict

4. **Memory issues**
   - Reduce concurrency: set `concurrency: 1` in options
   - Process in smaller batches

## Security Checklist

- [ ] Generate strong API_KEY (32+ random characters)
- [ ] Set ADMIN_EMAILS to your email only
- [ ] Enable RLS in Supabase
- [ ] Use environment variables for all secrets
- [ ] Enable CORS for production domains only
- [ ] Set up monitoring (Sentry)
- [ ] Configure rate limiting
- [ ] Enable request logging
