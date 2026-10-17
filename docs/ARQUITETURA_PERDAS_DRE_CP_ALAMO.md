# Perdas e DRE - arquitetura CP Alamo

## Escopo

Modulo exclusivo do CP Alamo, integrado ao menu Gestao e ao contexto de usuario e unidades existentes. Projeto Supabase: `ztxdqvxvkfgfqowaiaep`. A filial DOURADOS continua administrativa e nao recebe lancamentos como loja competente.

`src/losses-dre.js` carrega a tela sob demanda; `src/losses-domain.js` trata valores monetarios, XML, rateio e planilhas. O banco decide as permissoes e as transicoes. Listas tem paginas de 30 registros; indicadores sao agregados no servidor. SKU, pessoas e referencias operacionais sao consultados sob demanda.

## Persistencia e autorizacao

As tabelas `wms_losses`, `wms_loss_items`, `wms_loss_allocations`, `wms_loss_files`, `wms_loss_events`, `wms_loss_export_batches`, `wms_loss_periods` e os cadastros de tipos, aliquotas, centros e regra financeira possuem RLS. O cliente recebe SELECT, sem escrita direta nas tabelas financeiras.

`public.wms_loss_action` usa SECURITY INVOKER e encaminha comandos para a funcao privada. A funcao privada e a fronteira deliberada de escrita: autentica usuario, consulta perfil confiavel, verifica unidades, autor, estado e versao. Uma chave por comando protege repeticoes; a mesma chave com outro conteudo e rejeitada. Um bloqueio transacional serializa aprovacao, configuracao, exportacao e fechamento. O controle de versao impede que duas aprovacoes concorrentes sobrescrevam o registro.

Documentos ficam no bucket privado `wms-loss-files`. O caminho contem unidade e perda. PDF tem limite de 10 MB; XML, 5 MB. O banco compara tipo e tamanho com os metadados do arquivo armazenado. Downloads usam links assinados de 60 segundos. Arquivos existentes nao sao sobrescritos.

## Regras

- Tipo de perda define a DRE. O solicitante nao escolhe a classificacao diretamente.
- Competencia financeira e informada explicitamente, separada de `created_at`.
- Aliquota inicial de 0,48% cobre todas as competencias, conforme decisao do usuario.
- Administradores configuram tipos e faixas de aliquota. Faixas ativas nao podem se sobrepor.
- A aprovacao congela tipo, DRE, aliquota, valores e base do indicador.
- Indicadores oficiais usam apenas aprovadas e exportadas; a base inicial e o valor da NF, configuravel pelo administrador para aprovacoes futuras.
- Creditos aparecem separados das perdas brutas e reduzem a perda liquida.

## Verificacao

Testes SQL usam PGlite com papeis e RLS. Cobrem isolamento de unidades, aprovacoes, idempotencia, snapshots, historico de aliquotas, competencia, anexos e conciliacao. A verificacao `scripts/verify-losses-browser.mjs` usa navegador e banco temporario para XML, revisao, rateio, envio, aprovacao e exportacao Excel, com capturas desktop/mobile.

Integrações de inventario, importacao em massa de perdas e metas financeiras permanecem evolucoes posteriores previstas no pedido. Transferencia e Logistica Reversa podem ser vinculadas por referencia em um rascunho, sujeito a revisao e aprovacao. Nenhuma divergencia operacional gera perda financeira automaticamente.
