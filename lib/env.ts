// Central, typed access to configuration. Nothing here throws at import time so
// pages that don't need a given integration still render during local dev.

function get(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  appUrl: () => get("APP_URL", get("RENDER_EXTERNAL_URL", "http://localhost:3000")).replace(/\/$/, ""),
  databaseUrl: () => get("DATABASE_URL"),
  pgliteDir: () => get("PGLITE_DIR", "./.data/pglite"),

  paypalClientId: () => get("PAYPAL_CLIENT_ID"),
  paypalSecret: () => get("PAYPAL_SECRET", get("PAYPAL_CLIENT_SECRET")),
  paypalWebhookId: () => get("PAYPAL_WEBHOOK_ID"),
  paypalApiBase: () => "https://api-m.sandbox.paypal.com", // sandbox only, per hackathon rules

  geminiApiKey: () => get("GOOGLE_GENERATIVE_AI_API_KEY", get("GEMINI_API_KEY")),
  geminiModel: () => get("GEMINI_MODEL", "gemini-2.5-flash"),

  waToken: () => get("WHATSAPP_ACCESS_TOKEN"),
  waPhoneNumberId: () => get("WHATSAPP_PHONE_NUMBER_ID"),
  waVerifyToken: () => get("WHATSAPP_VERIFY_TOKEN"),
  waAppSecret: () => get("WHATSAPP_APP_SECRET"),
  waDisplayNumber: () => get("WHATSAPP_DISPLAY_NUMBER").replace(/[^0-9]/g, ""),
  waGraphVersion: () => get("WHATSAPP_GRAPH_VERSION", "v23.0"),

  simulatorEnabled: () => get("ENABLE_SIMULATOR", "true") !== "false",
  agStudioLicense: () => get("NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY"),
};

export function paypalConfigured() {
  return Boolean(env.paypalClientId() && env.paypalSecret());
}
export function whatsappConfigured() {
  return Boolean(env.waToken() && env.waPhoneNumberId());
}
