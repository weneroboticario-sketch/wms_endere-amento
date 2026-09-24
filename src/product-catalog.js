let catalogPromise;

export function loadBuiltinProducts() {
  if (!catalogPromise) {
    catalogPromise = fetch("/data/builtin-products.json", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Catalogo indisponivel (${response.status}).`);
        return response.json();
      })
      .then((catalog) => Object.freeze(catalog || {}))
      .catch((error) => {
        console.warn("Catalogo local de produtos nao carregado:", error);
        return Object.freeze({});
      });
  }
  return catalogPromise;
}
