function bindingRemoteId(binding) {
  return String((binding && (binding.remoteId || binding.id)) || "");
}

function splitSourceSkus(value) {
  return String(value || "")
    .split(/[;,|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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
