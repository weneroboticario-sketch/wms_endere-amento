# Relatório - Saúde do Sistema WMS

## Objetivo

Foi criada a tela administrativa **Saúde do Sistema** dentro do WMS para diagnosticar problemas antes que eles afetem a operação.

## Regras aplicadas

- A tela fica no menu **Administração**.
- O acesso é restrito a usuários com perfil **ADMINISTRADOR**.
- O diagnóstico não carrega no login.
- As consultas são executadas somente quando o administrador abre ou atualiza a tela.
- A tela não mostra chaves sensíveis do Supabase.
- Nenhuma correção estrutural é executada automaticamente.

## O que o diagnóstico mostra

- Status do Supabase.
- Status do realtime.
- Situação do cache local.
- Pendências de sincronização local.
- Últimas importações de loja e captação.
- Transferências abertas.
- Pedidos de reposição abertos.
- Erros recentes.
- Duplicidades encontradas.
- Registros sem `warehouse_code`.
- Usuários inativos ou arquivados.

## Checagem de estrutura

O módulo verifica colunas obrigatórias nas tabelas:

- `wms_replenishment_requests`
- `wms_transfers`
- `wms_transfer_items`
- `wms_stock_positions`
- `wms_users`

Quando uma coluna está ausente, a tela mostra no padrão:

```text
Coluna ausente: tabela.campo
```

O botão **Gerar SQL de correção** monta o SQL para conferência e execução manual no SQL Editor do Supabase.

## Manutenção segura

A tela possui ações controladas:

- Limpar cache local do navegador.
- Recriar cache local do estoque atual.
- Sincronizar pendências locais.
- Arquivar notificações antigas já lidas.
- Arquivar usuários inativos.
- Gerar relatório técnico em Markdown.

Ações de manutenção exigem digitar `CONFIRMAR`.

## Schema preparado

O arquivo `supabase-schema.sql` foi atualizado para:

- Criar `codigo_material` em `wms_transfer_items`.
- Preencher `codigo_material` com o valor de `sku` quando estiver vazio.
- Criar índice simples para `codigo_material`.
- Criar campos `archived` e `archived_at` em `wms_notifications` para arquivamento seguro.

## Escopo preservado

Não foram alterados os fluxos principais de:

- Login.
- Consulta SKU.
- Reposição.
- Transferências.
- Base de Estoque.
- Multiestoque.
