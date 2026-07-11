#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const AUTH_URL = "https://api.schwabapi.com/v1/oauth/authorize";
const TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token";
const execFileAsync = promisify(execFile);

loadEnvFile(".env.local");
loadEnvFile(".env.production.local");

const command = process.argv[2];

if (!command || command === "help" || command === "--help") {
  printHelp();
  process.exit(0);
}

if (command === "login") {
  const { clientId, callbackUrl } = readConfig();
  const url = buildLoginUrl(clientId, callbackUrl);
  console.log("\nOpen this URL in your browser, log in, approve access, then copy the full final URL from the address bar:\n");
  console.log(url.toString());
  console.log("\nThe final URL usually fails to load at https://127.0.0.1. That is fine. Copy the full address bar URL and run:");
  console.log('\n  node scripts/schwab-oauth.mjs exchange "FULL_FINAL_URL_HERE"\n');
  process.exit(0);
}

if (command === "watch") {
  const { clientId, callbackUrl } = readConfig();
  const url = buildLoginUrl(clientId, callbackUrl);
  console.log("\nOpen this URL, log in, approve access, then copy the full final https://127.0.0.1 URL from the address bar.");
  console.log("This helper will watch your clipboard and exchange the code as soon as it sees it.\n");
  console.log(url.toString());
  await openBrowser(url.toString());
  const finalUrl = await waitForCallbackUrl();
  await exchangeAndPrint(finalUrl);
  process.exit(0);
}

if (command === "exchange") {
  const input = process.argv[3];
  if (!input) {
    fail('Missing final callback URL or authorization code.\n\nExample:\n  node scripts/schwab-oauth.mjs exchange "https://127.0.0.1/?code=..."');
  }
  await exchangeAndPrint(input);
  process.exit(0);
}

fail(`Unknown command: ${command}`);

function readConfig() {
  const clientId = process.env.SCHWAB_CLIENT_ID || process.env.SCHWAB_APP_KEY;
  const clientSecret = process.env.SCHWAB_CLIENT_SECRET || process.env.SCHWAB_APP_SECRET;
  const callbackUrl = process.env.SCHWAB_CALLBACK_URL || "https://127.0.0.1";

  if (!clientId) fail("Missing SCHWAB_CLIENT_ID in your local environment or .env.local.");
  if (!clientSecret && command === "exchange") {
    fail("Missing SCHWAB_CLIENT_SECRET in your local environment or .env.local.");
  }

  return { clientId, clientSecret, callbackUrl };
}

function buildLoginUrl(clientId, callbackUrl) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  return url;
}

async function exchangeAndPrint(input) {
  const { clientId, clientSecret, callbackUrl } = readConfig();
  const code = extractCode(input);
  const token = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    fail(`Schwab token exchange failed with HTTP ${response.status}.\n${JSON.stringify(payload, null, 2)}`);
  }

  const refreshToken = payload?.refresh_token;
  const accessToken = payload?.access_token;
  if (!refreshToken) {
    fail(`Schwab did not return a refresh_token.\n${JSON.stringify(payload, null, 2)}`);
  }

  console.log("\nSuccess. Add this to Vercel Production environment variables:\n");
  console.log(`SCHWAB_REFRESH_TOKEN=${refreshToken}`);
  if (accessToken) {
    console.log("\nAccess token was also returned, but do not add it to Vercel. The app will mint access tokens from the refresh token.");
  }
  console.log("\nKeep this value private. Do not paste it into chat.\n");
}

function extractCode(input) {
  if (!input.includes("://") && !input.includes("code=")) return input;
  try {
    const url = new URL(input);
    const code = url.searchParams.get("code");
    if (!code) fail("The callback URL does not contain a code= parameter.");
    return code;
  } catch {
    const match = input.match(/[?&]code=([^&]+)/);
    if (!match) fail("Could not find code= in the provided value.");
    return decodeURIComponent(match[1]);
  }
}

async function openBrowser(url) {
  if (process.platform !== "win32") return;
  try {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Start-Process",
      url,
    ]);
  } catch {
    // Printing the URL is enough if browser launch is blocked.
  }
}

async function waitForCallbackUrl() {
  const deadline = Date.now() + 180_000;
  let last = "";
  while (Date.now() < deadline) {
    const text = await readClipboard();
    if (text && text !== last) {
      last = text;
      if (text.includes("https://127.0.0.1") && text.includes("code=")) {
        console.log("\nCallback URL detected on clipboard. Exchanging now...");
        return text.trim();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail("Timed out waiting for the Schwab callback URL on your clipboard. Run watch again and copy the final address-bar URL right after approval.");
}

async function readClipboard() {
  if (process.platform !== "win32") return "";
  try {
    const { stdout } = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-Clipboard",
    ]);
    return stdout.trim();
  } catch {
    return "";
  }
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const content = readFileSync(path, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function printHelp() {
  console.log(`
Schwab OAuth helper

Commands:
  node scripts/schwab-oauth.mjs login
  node scripts/schwab-oauth.mjs watch
  node scripts/schwab-oauth.mjs exchange "https://127.0.0.1/?code=..."

Required local env:
  SCHWAB_CLIENT_ID
  SCHWAB_CLIENT_SECRET
  SCHWAB_CALLBACK_URL=https://127.0.0.1

Output:
  SCHWAB_REFRESH_TOKEN for Vercel Production env.
`);
}

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
