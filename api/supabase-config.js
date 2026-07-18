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
    ["NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["PUBLIC_SUPABASE_URL", process.env.PUBLIC_SUPABASE_URL]
  ];

  const keyVars = [
    ["SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY],
    ["SUPABASE_KEY", process.env.SUPABASE_KEY],
    ["VITE_SUPABASE_ANON_KEY", process.env.VITE_SUPABASE_ANON_KEY],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ["PUBLIC_SUPABASE_ANON_KEY", process.env.PUBLIC_SUPABASE_ANON_KEY]
  ];

  const urlMatch = firstFilled(urlVars);
  const keyMatch = firstFilled(keyVars);
  const url = urlMatch.value;
  const key = keyMatch.value;

  res.status(200).json({
    configured: Boolean(url && key),
    url,
    key,
    diagnostics: {
      hasUrl: Boolean(url),
      hasKey: Boolean(key),
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

function previewUrl(value) {
  if (!value) return "";
  return value.replace(/\/+$/, "");
}

function previewSecret(value) {
  if (!value) return "";
  if (value.length <= 12) return "***";
  return value.slice(0, 8) + "..." + value.slice(-6);
}
