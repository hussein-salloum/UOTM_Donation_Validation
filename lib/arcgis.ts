type ArcFeature = { attributes: Record<string, unknown> };

type LayerConfig = {
  label: "CDS" | "Delivery";
  url: string;
  portalUrl: string;
  username: string;
  password: string;
};

const tokenCache = new Map<string, { token: string; expires: number }>();

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function portal(name: string): string {
  return (process.env[name] || "https://www.arcgis.com").replace(/\/$/, "");
}

export function cdsConfig(): LayerConfig {
  return {
    label: "CDS",
    url: required("CDS_LAYER_URL").replace(/\/$/, ""),
    portalUrl: portal("CDS_PORTAL_URL"),
    username: required("CDS_USERNAME").trim(),
    password: required("CDS_PASSWORD")
  };
}

export function deliveryConfig(): LayerConfig {
  return {
    label: "Delivery",
    url: required("DELIVERY_LAYER_URL").replace(/\/$/, ""),
    portalUrl: portal("DELIVERY_PORTAL_URL"),
    username: required("DELIVERY_USERNAME").trim(),
    password: required("DELIVERY_PASSWORD")
  };
}

async function getToken(config: LayerConfig): Promise<string> {
  const key = `${config.portalUrl}:${config.username}:${config.url}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;

  const referer = process.env.ARCGIS_TOKEN_REFERER || "http://localhost:3000";
  const tokenUrl = `${config.portalUrl}/sharing/rest/generateToken`;
  const body = new URLSearchParams({
    f: "json",
    username: config.username,
    password: config.password,
    client: "referer",
    referer,
    expiration: "60"
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store"
  });

  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${config.label} ArcGIS login failed: token endpoint returned an invalid response.`);
  }

  if (!response.ok || data.error || !data.token) {
    const details = Array.isArray(data?.error?.details)
      ? data.error.details.filter(Boolean).join(" | ")
      : "";
    const message = data?.error?.message || `HTTP ${response.status}`;
    throw new Error(
      `${config.label} ArcGIS login failed for username "${config.username}" at ${config.portalUrl}: ${message}${details ? `: ${details}` : ""}`
    );
  }

  tokenCache.set(key, {
    token: data.token,
    expires: Number(data.expires || Date.now() + 55 * 60_000)
  });
  return data.token;
}

export async function queryAll(config: LayerConfig, params: Record<string, string>): Promise<ArcFeature[]> {
  const token = await getToken(config);
  const pageSize = 2000;
  let offset = 0;
  const all: ArcFeature[] = [];

  while (true) {
    const search = new URLSearchParams({
      f: "json",
      token,
      where: "1=1",
      outFields: "*",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      ...params
    });
    const response = await fetch(`${config.url}/query?${search}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || data.error) {
      const details = Array.isArray(data?.error?.details) ? data.error.details.filter(Boolean).join(" | ") : "";
      throw new Error(`${config.label} layer query failed: ${data?.error?.message || `HTTP ${response.status}`}${details ? `: ${details}` : ""}`);
    }
    const features: ArcFeature[] = data.features || [];
    all.push(...features);
    if (!data.exceededTransferLimit && features.length < pageSize) break;
    if (!features.length) break;
    offset += features.length;
  }
  return all;
}
