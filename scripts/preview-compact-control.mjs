import { createServer } from "vite";

const server=await createServer({resolve:{preserveSymlinks:false},server:{host:"127.0.0.1",port:4207,strictPort:true}});
await server.listen();
server.printUrls();
