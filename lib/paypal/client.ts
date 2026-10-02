import "server-only";
import { Client, Environment, LogLevel } from "@paypal/paypal-server-sdk";
import { env, paypalConfigured } from "../env";

let sdk: Client | undefined;

/** Official PayPal TypeScript Server SDK client (sandbox). */
export function paypalSdk(): Client {
  if (!paypalConfigured()) throw new Error("PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_SECRET");
  sdk ??= new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId: env.paypalClientId(),
      oAuthClientSecret: env.paypalSecret(),
    },
    timeout: 0,
    environment: Environment.Sandbox,
    logging: { logLevel: LogLevel.Warn },
  });
  return sdk;
}

let token: { value: string; expiresAt: number } | undefined;

/** OAuth token for REST endpoints the SDK does not cover (Payouts, webhook verification). */
export async function accessToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const basic = Buffer.from(`${env.paypalClientId()}:${env.paypalSecret()}`).toString("base64");
  const res = await fetch(`${env.paypalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal OAuth failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

export class PayPalApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`PayPal API ${status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
}

export async function paypalRest<T>(path: string, init: { method?: string; body?: unknown; requestId?: string } = {}): Promise<T> {
  const res = await fetch(`${env.paypalApiBase()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) throw new PayPalApiError(res.status, body);
  return body as T;
}
