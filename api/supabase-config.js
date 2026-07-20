export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const urlVars = [
    ["SUPABASE_URL", process.env.SUPABASE_URL],
    ["VITE_SUPABASE_URL", process.env.VITE_SUPABASE_URL],
    ["vite_SUPABASE_URL", process.env.vite_SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["PUBLIC_SUPABASE_URL", process.env.PUBLIC_SUPABASE_URL]
  ];

  const keyVars = [
    ["SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY],
    ["SUPABASE_KEY", process.env.SUPABASE_KEY],
    ["VITE_SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY],
    ["VITE_SUPABASE_ANOM_KEY", process.env.VITE_SUPABASE_ANOM_KEY],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ["PUBLIC_SUPABASE_ANON_KEY", process.env.PUBLIC_SUPABASE_ANON_KEY]
  ];

  const urlMatch = firstFilled(urlVars);
  const keyMatch = firstFilled(keyVars);
  const url = normalizeSupabaseProjectUrl(urlMatch.value);
  const key = (keyMatch.value || "").trim();
  const hasValidUrl = isValidSupabaseUrl(url);
  const hasValidKey = isLikelySupabaseAnonKey(key);

  res.status(200).json({
    configured: Boolean(hasValidUrl && hasValidKey),
    url: hasValidUrl ? url : "",
    key: hasValidKey ? key : "",
    diagnostics: {
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
      hasValidUrl,
      hasValidKey,
      urlSource: urlMatch.name,
      keySource: keyMatch.name,
      urlPreview: previewUrl(url),
      keyPreview: previewSecret(key),
      checkedUrlVariables: urlVars.map(function (item) { return item[0]; }),
      checkedKeyVariables: keyVars.map(function (item) { return item[0]; }),
      note: "Fallback de configuracao. O app principal le VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY pelo build Vite."
    }
  });
}

function firstFilled(entries) {
  for (const entry of entries) {
    if (entry[1]) {
      return { name: entry[0], value: entry[1] };
    }
  }
  return { name: "", value: "" };
}

function normalizeSupabaseProjectUrl(value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.replace(/\/+$/, "") === "/rest/v1") return parsed.origin;
    return parsed.origin;
  } catch (error) {
    return raw.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  }
}

function isValidSupabaseUrl(value) {
  try {
    const parsed = new URL((value || "").trim());
    return parsed.protocol === "https:" && /\.supabase\.co$/i.test(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function isLikelySupabaseAnonKey(value) {
  const key = (value || "").trim();
  return /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/.test(key) || /^sb_publishable_[a-zA-Z0-9_-]{20,}$/.test(key);
}

function previewUrl(value) {
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

function previewSecret(value) {
  if (!value) return "";
  if (value.length <= 12) return "***";
  return value.slice(0, 8) + "..." + value.slice(-6);
}
