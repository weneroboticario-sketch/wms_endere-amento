import { build } from 'vite';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

// Preview artifact contains only the synthetic UI fixture, never the app login/API configuration.
await build({ configFile:false, base:'/', publicDir:false,
  build:{outDir:'dist-owner-preview',emptyOutDir:true,rollupOptions:{input:'tests/replenishment-owner-visual.html'}} });
const html=await readFile('dist-owner-preview/tests/replenishment-owner-visual.html','utf8');
await writeFile('dist-owner-preview/index.html',html);
await mkdir('dist-owner-preview/templates',{recursive:true});
await copyFile('public/templates/materiais-reposicao.xlsx','dist-owner-preview/templates/materiais-reposicao.xlsx');
await writeFile('dist-owner-preview/vercel.json',JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',
  headers:[{source:'/(.*)',headers:[{key:'Content-Security-Policy',value:"default-src 'self'; script-src 'self' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'self'; require-trusted-types-for 'script'; trusted-types default dompurify"}]}]},null,2));
