function bindingRemoteId(binding) {
  return String((binding && (binding.remoteId || binding.id)) || "");
}

function splitSourceSkus(value) {
  return String(value || "")
    .split(/[;,|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildAddressingOccupantSnapshot(bindings) {
  const byRemoteId = new Map();

  (bindings || []).forEach((binding) => {
    const id = bindingRemoteId(binding);
    if (!id) return;
    const sourceSku = String(binding.sourceSkuValue || binding.sku || "").trim();
    if (!byRemoteId.has(id)) byRemoteId.set(id, { id, sku: sourceSku });
  });

  return Array.from(byRemoteId.values()).sort((first, second) => first.id.localeCompare(second.id));
}

export function resolveRemoteBindingIds(bindings, bindingIds) {
  const byId = new Map((bindings || []).map((binding) => [String(binding.id), binding]));
  return Array.from(new Set((bindingIds || [])
    .map((id) => {
      const localBinding = byId.get(String(id));
      return localBinding ? bindingRemoteId(localBinding) : String(id || "");
    })
    .filter(Boolean)));
}

export function planBindingRemoval(bindings, bindingId) {
  const target = (bindings || []).find((binding) => String(binding.id) === String(bindingId));
  if (!target) return null;

  const remoteId = bindingRemoteId(target);
  const siblings = (bindings || []).filter((binding) => bindingRemoteId(binding) === remoteId);
  const remainingBindings = siblings.filter((binding) => String(binding.id) !== String(target.id));
  const sourceSkuCount = splitSourceSkus(target.sourceSkuValue).length;
  const updatesCombinedRow = remainingBindings.length > 0 && (sourceSkuCount > 1 || siblings.length > 1);
  const remainingSkus = Array.from(new Set(remainingBindings.map((binding) => String(binding.sku || "").trim()).filter(Boolean)));

  return {
    target,
    remoteId,
    mode: updatesCombinedRow ? "update" : "delete",
    remainingBindings,
    remainingSkus
  };
}

export function planLocationSkuCleanup(occupants, keepBindingId) {
  const keepBinding = (occupants || []).find((binding) => String(binding.id) === String(keepBindingId));
  if (!keepBinding) return null;

  const keepRemoteId = bindingRemoteId(keepBinding);
  const keepRemoteSiblings = (occupants || []).filter((binding) => bindingRemoteId(binding) === keepRemoteId);
  const updateKeepRow = keepRemoteSiblings.length > 1 || splitSourceSkus(keepBinding.sourceSkuValue).length > 1;
  const deleteRemoteIds = Array.from(new Set((occupants || [])
    .map(bindingRemoteId)
    .filter((remoteId) => remoteId && remoteId !== keepRemoteId)));

  return {
    keepBinding,
    keepRemoteId,
    updateKeepRow,
    deleteRemoteIds
  };
}
