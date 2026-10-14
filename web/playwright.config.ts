import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = fileURLToPath(new URL('.', import.meta.url))
const database = join(mkdtempSync(join(tmpdir(), 'biletflow-e2e-')), 'smoke.db')
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: process.env.BILETFLOW_BROWSER_ARGS ? JSON.parse(process.env.BILETFLOW_BROWSER_ARGS) : ['--no-sandbox'] }
      : {},
  },
  webServer: [
    {
      command: 'uv run --frozen alembic upgrade head && uv run --frozen python -m app.cli seed-demo && uv run --frozen uvicorn app.main:app --host 127.0.0.1 --port 8000',
      cwd: resolve(web, '../backend'), url: 'http://127.0.0.1:8000/health',
      env: {
        JWT_SECRET: 'e2e-only-secret-012345678901234567890123456',
        DATABASE_URL: 'sqlite+aiosqlite:///' + database.replaceAll('\\', '/'),
        SMTP_ENABLED: 'false', BILETFLOW_DEMO_PASSWORD: 'e2e-only-password',
      },
      reuseExistingServer: false, timeout: 60_000,
    },
    { command: 'npm run dev -- --host 127.0.0.1', cwd: web,
      url: 'http://127.0.0.1:5173', reuseExistingServer: false },
  ],
})
