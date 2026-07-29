import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

for (const prefix of ["CDS", "DELIVERY"]) {
  const username = process.env[`${prefix}_USERNAME`] ?? "";
  const password = process.env[`${prefix}_PASSWORD`] ?? "";
  const portal = process.env[`${prefix}_PORTAL_URL`] ?? "https://www.arcgis.com";
  console.log(prefix, {
    portal,
    username: JSON.stringify(username),
    usernameLength: username.length,
    passwordLength: password.length,
    passwordStartsWithQuote: password.startsWith('"'),
    passwordEndsWithQuote: password.endsWith('"'),
    containsHash: password.includes("#")
  });
}
