import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests-browser',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3100', viewport: { width: 390, height: 844 }, trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--disable-gpu'] }
      : {}
  },
  webServer: {
    command: 'npm run dev -- --hostname 127.0.0.1 --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: { NEXT_PUBLIC_SUPABASE_URL: 'https://padel-test.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-only-public-key' }
  }
});
