export function normalizePresenceMap(value) {
  if (Array.isArray(value)) {
    return value.reduce((result, name) => {
      if (name) result[String(name)] = true;
      return result;
    }, {});
  }
  if (value && typeof value === "object") return { ...value };
  return {};
}
