export function createDemoRequestGuard(networkFetch,isDemoActive) {
  return function (input,options) {
    if(isDemoActive()) {
      const method=String(options?.method || input?.method || "GET").toUpperCase();
      const url=new URL(typeof input==="string"?input:input.url || String(input));
      const businessEndpoint=/^\/(rest|storage|functions)\/v1(?:\/|$)/.test(url.pathname);
      const authMutation=/^\/auth\/v1\//.test(url.pathname) && !/^\/auth\/v1\/token(?:\/|$)/.test(url.pathname);
      if(!["GET","HEAD","OPTIONS"].includes(method) && (businessEndpoint || authMutation)) {
        return Promise.reject(new Error("Modo DEMO: escritas operacionais, RPCs e uploads reais estao bloqueados."));
      }
    }
    return networkFetch(input,options);
  };
}
