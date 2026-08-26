declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
  }
}

declare namespace NodeJS {
  interface ProcessEnv {
    QWEN_TOKEN_PLAN_API_KEY?: string;
    QWEN_BASE_URL?: string;
    QWEN_MODEL?: string;
  }
}
