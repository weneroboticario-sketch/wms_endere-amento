# Consulta sem gravacao automatica para COMPRAS

## Causa

O carregamento da sessao executa `applyDataMigrations` depois de ler os
enderecos. Quando encontra nomes de produtos ou areas desatualizados,
tentava salvar todos os vinculos em `wms_bindings`. COMPRAS tem consulta,
mas nao alteracao fisica de enderecos; o banco recusava a gravacao.
Os logs de producao de 2026-10-14, 19:46 UTC, confirmaram a violacao de RLS
em `wms_bindings`, correspondente ao aviso apresentado na consulta.

## Ajuste

- O enriquecimento dos nomes para exibicao permanece funcionando.
- No CP Alamo, COMPRAS nao chama `saveData` no enriquecimento inicial nem
  na atualizacao de nomes durante uma consulta de SKU.
- Administradores, supervisores e operadores mantem o comportamento anterior.
- O WMS Enderecamento separado permanece inalterado.
- Nenhuma politica, senha, sessao, quantidade ou endereco foi alterado.
- Transferencias, NF e Logistica Reversa continuam com seus fluxos de gravacao
  especificos; erros de gravacoes explicitas continuam visiveis.

## Verificacao

Testes executam as duas funcoes reais em contexto isolado, verificando
metadados atualizados e zero chamadas de gravacao para COMPRAS, alem da
persistencia dos demais perfis e do sistema separado. A suite completa,
a verificacao de estilo e a compilacao de producao passaram.
