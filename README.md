# WMS Endereçamento de Estoque

Sistema WMS em HTML, CSS e JavaScript compilado pelo Vite, pronto para Vercel.

Agora os dados principais ficam no Supabase:

- Vínculos SKU + endereço
- Histórico
- Produtos importados

O app nao usa React nem TypeScript, mas agora usa Vite para compilar o JavaScript e ler `import.meta.env.VITE_SUPABASE_URL` e `import.meta.env.VITE_SUPABASE_ANON_KEY`.

## Arquivos

```text
index.html
style.css
script.js
package.json
vite.config.js
supabase-schema.sql
README.md
```

## Criar o banco no Supabase

1. Crie um projeto em https://supabase.com.
2. Abra `SQL Editor`.
3. Cole e execute todo o conteúdo de `supabase-schema.sql`.
4. Abra `Project Settings` > `API`.
5. Copie:
   - Project URL
   - anon public key

## Configurar no app

1. Abra o app no navegador.
2. Entre em `Configurações`.
3. Cole a `Supabase URL`.
4. Cole a `anon public key`.
5. Clique em `Salvar conexão`.
6. Clique em `Testar conexão`.

Depois disso, computadores e celulares que usarem a mesma URL/chave verão o mesmo banco.

## Variáveis na Vercel

Se publicar na Vercel, configure estas variáveis em `Settings` > `Environment Variables`:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Use estes valores:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

Nao use a URL `.../rest/v1/` como anon key. A URL do projeto pode ser colada com `/rest/v1/`, porque o app normaliza para `https://SEU-PROJETO.supabase.co`, mas a anon key precisa ser a chave publica `anon public` do Supabase.

Tambem sao aceitos `SUPABASE_URL` e `SUPABASE_ANON_KEY` no fallback `/api/supabase-config`.

Na Vercel, use as configuracoes padrao do Vite:

```text
Install Command: npm install
Build Command: npm run build
Output Directory: dist
```

Depois faca um novo deploy. O app le primeiro `import.meta.env.VITE_SUPABASE_URL` e `import.meta.env.VITE_SUPABASE_ANON_KEY` no build Vite. A rota `/api/supabase-config` continua existindo como fallback e diagnostico.

Na Vercel, abra `/api/supabase-config` depois do deploy se quiser conferir o fallback:

```json
{
  "configured": true,
  "diagnostics": {
    "urlSource": "VITE_SUPABASE_URL",
    "keySource": "VITE_SUPABASE_ANON_KEY"
  }
}
```

Se `configured` vier como `false`, o JSON vai mostrar qual variável chegou ausente.

## Corrigir Supabase conectado mas sem gravar

Se o app mostrar erro parecido com:

```text
new row violates row-level security policy for table "wms_bindings"
```

ou:

```text
Could not find the table 'public.wms_products' in the schema cache
```

abra o Supabase do projeto, entre em `SQL Editor`, cole todo o conteúdo de `supabase-schema.sql` e execute. Esse SQL cria as tabelas `wms_bindings`, `wms_history`, `wms_products` e recria as policies que permitem leitura e gravação com a chave pública do app.

## Login e usuários

O sistema possui login simples para operação de estoque. Depois de executar `supabase-schema.sql`, o app cria automaticamente o primeiro administrador se ainda não existir usuário:

```text
Usuário: admin
Senha: admin123
```

Troque essa senha inicial na tela `Usuários` após o primeiro acesso. As senhas são salvas como `password_hash` gerado no navegador, não em texto puro. A tabela `wms_sessions` registra início e encerramento de sessão de forma simples.

## Publicar no GitHub Pages

1. Crie um repositório público no GitHub.
2. Envie os arquivos para a raiz do repositório.
3. Vá em `Settings` > `Pages`.
4. Em `Source`, escolha `Deploy from a branch`.
5. Use branch `main` e pasta `/root`.
6. Salve.

O link ficará parecido com:

```text
https://seu-usuario.github.io/wms-enderecamento-html/
```

## Importar planilhas

Na tela `Importar Excel`, selecione uma ou duas planilhas:

- `LinhaSeparacao`: cria os endereços.
- `MaterialLinhaSeparacao`: carrega código e nome do produto.

O sistema cruza `Codigo Material` com `Cod Material`, preserva zeros à esquerda e evita duplicidade do mesmo SKU no mesmo endereço.

## Endereço

Formato técnico:

```text
R01-RK01-L01-A
```

Também aceita:

```text
R1-RK1-L1-A
R10-RK03-L04-AA
```

## Observação de segurança

A chave `anon public key` é pública por natureza. O arquivo SQL libera leitura e escrita para `anon`, porque o app foi pedido como livre para computadores e celulares. Use um projeto Supabase dedicado para esse sistema.
