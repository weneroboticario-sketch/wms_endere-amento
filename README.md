# WMS Endereçamento de Estoque

Sistema WMS em HTML, CSS e JavaScript puro, pronto para GitHub Pages, Vercel ou Netlify.

Agora os dados principais ficam no Supabase:

- Vínculos SKU + endereço
- Histórico
- Produtos importados

O app ainda não usa React, Vite, TypeScript, Node, npm ou build.

## Arquivos

```text
index.html
style.css
script.js
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
