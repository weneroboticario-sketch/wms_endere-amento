export async function hashPassword(username, password) {
  var input = "wms-v1:" + normalizeCredential(username).toLowerCase() + ":" + String(password || "");
  var bytes = new TextEncoder().encode(input);
  var hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  return "sha256:" + hashArray.map(function (byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

export async function verifyPasswordHash(user, password) {
  return user.passwordHash === await hashPassword(user.username, password);
}

function normalizeCredential(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
