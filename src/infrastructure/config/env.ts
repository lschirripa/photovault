// Server-only env var helper — uses dynamic access which only works server-side.
// NEXT_PUBLIC_* vars MUST use static string literals (process.env.NEXT_PUBLIC_XXX)
// so Next.js inlines them into the client bundle at compile time.
function serverEnv(key: string, required: boolean = true): string {
  if (typeof window !== "undefined") return "";
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
}

export const env = {
  // Supabase (NEXT_PUBLIC_* must be static for client-side inlining)
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    serviceRoleKey: serverEnv("SUPABASE_SERVICE_ROLE_KEY", false),
  },

  // Cloudflare R2 (server-only, no NEXT_PUBLIC_ prefix)
  r2: {
    accountId: serverEnv("R2_ACCOUNT_ID", false),
    accessKeyId: serverEnv("R2_ACCESS_KEY_ID", false),
    secretAccessKey: serverEnv("R2_SECRET_ACCESS_KEY", false),
    bucketName: serverEnv("R2_BUCKET_NAME", false) || "photovault",
    publicUrl: serverEnv("R2_PUBLIC_URL", false),
  },

  // Application
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  },

  // Google (optional — enables Google Drive import)
  google: {
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? "",
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
    appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? "",
  },

  // Upstash Redis (optional — enables rate limiting + caching)
  redis: {
    url: serverEnv("UPSTASH_REDIS_REST_URL", false),
    token: serverEnv("UPSTASH_REDIS_REST_TOKEN", false),
  },

  // Runtime checks
  isServer: typeof window === "undefined",
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
} as const;

export type Env = typeof env;
