function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
}

export const env = {
  // Supabase
  supabase: {
    url: getEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: getEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: getEnvVar("SUPABASE_SERVICE_ROLE_KEY", false),
  },

  // Cloudflare R2
  r2: {
    accountId: getEnvVar("R2_ACCOUNT_ID", false),
    accessKeyId: getEnvVar("R2_ACCESS_KEY_ID", false),
    secretAccessKey: getEnvVar("R2_SECRET_ACCESS_KEY", false),
    bucketName: getEnvVar("R2_BUCKET_NAME", false) || "photovault",
    publicUrl: getEnvVar("R2_PUBLIC_URL", false),
  },

  // Application
  app: {
    url: getEnvVar("NEXT_PUBLIC_APP_URL", false) || "http://localhost:3000",
  },

  // Google (optional — enables Google Drive import)
  google: {
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_API_KEY ?? '',
    clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
    appId: process.env.NEXT_PUBLIC_GOOGLE_APP_ID ?? '',
  },

  // Runtime checks
  isServer: typeof window === "undefined",
  isDev: process.env.NODE_ENV === "development",
  isProd: process.env.NODE_ENV === "production",
} as const;

export type Env = typeof env;
