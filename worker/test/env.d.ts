declare namespace Cloudflare {
  interface Env {
    /** Injected by vitest.config.ts; only present under test. */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}
