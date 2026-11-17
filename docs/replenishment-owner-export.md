# Exportação individual de reposição — proposta para validação

Base: produção WMS `d45288f4bfabf35799fa10fe0b1c8a7a8d87d857`. Branch isolada
`feat/wms-replenishment-export-owner-20261117`. Não aplicar a CP Álamo/Dourados.

## Investigação e compatibilidade

O modelo anterior guarda apenas o total atendido e o responsável atual da solicitação.
O RPC antigo exporta todos os concluídos da unidade. Não distingue parcelas atendidas
por pessoas diferentes. Os lotes existentes e o modelo `Materiais`/`Legenda` são reutilizados.

A migration proposta `20261117194313_replenishment_owner_export.sql` acrescenta o
detalhamento indispensável `wms_replenishment_fulfillments`, metadados aos lotes
existentes, controle privado de idempotência e um RPC público SECURITY INVOKER.
O executor privilegiado permanece no schema privado, validando autenticação, perfil
ativo, unidade e modalidade em todas as ações. Não há autorização por nome ou metadata.

O levantamento somente de leitura encontrou lotes históricos e solicitações com
responsável atual, mas não evidência confiável das parcelas de cada atendente.
**Não há backfill.** Totais antigos, inclusive a parte antiga de uma solicitação parcial,
não recebem autor inventado. Aparecem como legado, fora da nova exportação individual.
Histórico legado permanece disponível explicitamente ao administrador/supervisor.

## Atendimento e conclusão

- A quantidade é somada sob lock da solicitação por `ATTEND`, com chave idempotente
  vinculada ao auth.uid. O navegador não envia o autor do atendimento.
- O trigger registra apenas o incremento futuro de quantidade, com autoria real e
  instantâneos do SKU, descrição, localização e quantidade solicitada.
- A conclusão operacional existente mantém seu fluxo e os triggers de saldo existentes.
  Ela conclui as parcelas ainda abertas em nome do usuário que efetivamente concluiu,
  preservando separadamente a identidade de quem registrou a quantidade.
- Parcelas já concluídas não mudam de dono quando outro usuário conclui o restante.
- `Concluir minha parcela para exportação` permite que o próprio atendente finalize
  sua parcela antes de devolver o restante à fila. Essa ação não conclui a solicitação
  inteira e **não movimenta saldo**. O texto da interface informa essa distinção.
- Reduzir quantidades rastreadas ou trocar SKU/unidade exige correção auditada; não
  pode reescrever os atendimentos existentes pelo UPDATE genérico do navegador.
- Cancelamento, exclusão e pedido de cancelamento impedem novas exportações dessas parcelas.

## Exportação, falhas e histórico

`SELF` é o padrão para todos, incluindo administradores. Um `owner_id` diferente do
perfil autenticado é rejeitado. `ADMIN` exige perfil administrador/supervisor e seleção
explícita de um único colaborador; período e unidade continuam validados no banco.
O status exportável é sempre CONCLUIDO, nunca um filtro para incluir pendentes.

O RPC reserva as parcelas sob advisory lock por unidade + responsável e locks das
solicitações. Outra aba/dispositivo com outra chave não consegue reservar os mesmos
itens. A mesma chave recupera o lote; não cria outro. O navegador prepara os bytes
do Excel antes de confirmar. Somente CONFIRM carimba `exported_at`/`exported_by_id`.
RESERVE não altera status operacional, saldo ou endereços. CONFIRM também não.

Uma falha de geração tenta liberar a reserva. Desfechos de rede desconhecidos conservam
a chave ou um lote recuperável. O criador da reserva pode continuar/liberar no histórico.
Uma reserva de usuário que perdeu acesso exige intervenção administrativa auditada;
não há expiração automática que possa liberar itens enquanto um arquivo está sendo gerado.

Depois da confirmação, o navegador não consegue comprovar que o usuário salvou
fisicamente o arquivo. Se o download falhar, deve-se baixar novamente o mesmo lote
pelo histórico, sem criar outra exportação. Não há alteração de estoque na reimpressão.

Os snapshots mantêm `id` como ID da solicitação para compatibilidade com a exclusão
definitiva existente do Caixa; `fulfillment_ids` preserva todas as parcelas. A FK da
parcela e da chave de atendimento é CASCADE para não impedir a exclusão autorizada.
O Excel continua consolidando Material + Quantidade, com SKU texto e zeros à esquerda.
O lote registra responsável, exportador autenticado/nome, unidade, horário, nome de
arquivo e origens. Contagens são calculadas dos snapshots, sem contador desatualizado
após a rotina existente de exclusão definitiva.

Uma política RESTRICTIVE protege a leitura dos novos lotes mesmo diante da antiga
política permissiva ALL. Escrita direta em lotes/parcelas é revogada para usuários;
o acesso administrativo passa exclusivamente pelo RPC autenticado e explícito.
O RPC antigo é substituído por um wrapper seguro para não manter a exportação geral
acessível aos clientes antigos. Nenhum layout de outra exportação é modificado.

## Validação e limites

Resultado local final em 17/11/2026: **441 testes aprovados**, lint aprovado e build
aprovado (aviso preexistente de tamanho de bundle, sem erro). Prévia sintética Vercel:
`dpl_HDKBdvTWvgqwHacuKJcKwUwByeoe`, target preview, READY. A mesma verificação dos
arquivos Excel e três larguras passou na URL publicada, com dois perfis fictícios.
A branch tem deployment automático desabilitado para evitar uma prévia do app completo
apontando para o banco de produção sem a migration. Somente o artefato isolado foi publicado.

- Testes PGlite executam SQL/trigger/RLS reais com múltiplas identidades autenticadas
  simuladas: parcelas 6/3/1 do mesmo pedido, soma por SKU, zero à esquerda, legado,
  permissões, identidade do concludente, cancelamento entre reserva/confirmação,
  repetição de chave, falha/liberação, histórico/reimpressão e administração explícita.
- Chamadas concorrentes no PGlite são serializadas pela mesma instância. Elas verificam
  idempotência e exclusão de reservas; **não equivalem a duas conexões Postgres reais**.
- O teste extraído do frontend valida o uso do RPC e a reutilização da chave após falha.
  O caminho legado do outro aplicativo continua coberto separadamente.
- A prévia visual usa o componente real com backend **fictício**, de propósito,
  sem Supabase. Dados demonstrativos de Guilherme/Barreto/Administrador não são logins reais.
- O build isolado `node scripts/build-owner-export-preview.mjs` contém somente essa
  prévia e o template Excel. Não inclui login, configuração Supabase, APIs ou dados reais.
  Sua CSP bloqueia conexões externas, exceto a biblioteca Excel gratuita já usada pelo WMS.
- Chrome automatizado: 1280, 390 e 320 px, sem transbordamento; conferência dos arquivos
  gerados para dois perfis fictícios, cabeçalhos/Legenda/SKU texto e quantidades 6/4.
- Ainda é necessário ambiente Supabase de teste para validar o conjunto dos triggers
  implantados, dois logins reais, duas conexões concorrentes e Android físico.
  Não existe branch Supabase de homologação disponível neste momento.

**Não está aprovado para produção.** Nenhuma migration de produção, merge ou publicação
de produção é autorizada por esta implementação. A prévia sintética não dispensa os
testes integrados exigidos pelo usuário. Antes da liberação, aplicar a migration somente
em homologação, repetir os fluxos com usuários distintos e revisar advisors/índices.
Após aprovação, preparar a publicação de produção separadamente, na janela autorizada.
