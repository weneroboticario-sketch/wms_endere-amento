# Rastreabilidade da montagem — WMS Endereçamento

Base: produção `adb496091adae4687ef6fd828617d67f35f24b13`.
Branch isolada: `fix/wms-transfer-traceability-20261109`.

## Escopo e implantação

Correção local de Transferências Enviadas / Montagem / Resultado por SKU. Não inclui o trabalho de OCR, recebimentos, reposição, endereçamento ou CP Álamo. Nenhuma migration foi executada no Supabase remoto, nenhum registro histórico foi corrigido e nenhum deploy foi realizado.

A migration `20261109140435_wms_packing_traceability.sql` precisa ser aplicada durante uma publicação autorizada, junto com o cliente atualizado. Clientes antigos não podem continuar gravando quantidades de montagem sem auditoria: os novos gatilhos rejeitam essas operações. Sem a migration, o cliente novo mostra o erro da RPC e não recorre a uma gravação parcial.

## Quantidades e evidência

- `quantidade_solicitada`: quantidade original, na unidade do pedido.
- `quantidade_separada`: quantidade separada, na unidade do pedido; a nova montagem não a altera.
- `quantidade_lacrada`: quantidade registrada na montagem; em CX representa caixas.
- `quantidade_lacrada_unidades`: unidades efetivas dentro das caixas, inclusive caixas mistas.
- Na RPC de montagem, `quantidade_enviada` é o retrato em UN da quantidade confirmada na caixa, conforme a conversão usada no fluxo existente. Não representa uma nova emissão fiscal nem uma baixa de saldo físico.
- `diferenca`: unidades registradas na caixa menos unidades previstas. Faltante e excedente são derivados desse cálculo.
- Sem conversão UN/CX, a previsão e a diferença em UN ficam indisponíveis. Não se somam caixas e unidades no total. Caixas mistas mantêm o total real informado.

Método de captura do código e método da quantidade são campos distintos. Uma leitura de código mais quantidade manual 4 representa 1 leitura, 4 manuais e 0 unitárias. Somente quatro eventos unitários de +1 representam quatro unidades por leitura unitária. O modo scanner é declarado: leitores que emulam teclado não comprovam a captura física.

Correções são novos eventos. A reconciliação consome reduções das parcelas mais recentes (LIFO), preservando as parcelas anteriores restantes e sem duplicar a quantidade corrigida. A coluna Ajustes é informativa; seu saldo já está incorporado nas quantidades líquidas. O histórico bruto continua disponível.

## Transação, acesso e repetição

A RPC pública usa SECURITY INVOKER e chama uma função privada SECURITY DEFINER com `search_path` vazio e validação explícita da sessão, perfil ativo, estoque e responsável. Essa função privada é necessária para inserir a auditoria sem conceder INSERT direto aos clientes. Não há service_role no navegador.

Quantidade, evento, divergência atual e resumo são gravados na mesma transação. O servidor define ator, nome e horário. Bloqueio da transferência e revisão do item impedem sobrescrita concorrente. UUID da ação garante repetição idempotente; reutilizar UUID para outro conteúdo é rejeitado. O cliente guarda a requisição exata em sessionStorage antes de enviar, mantém-na quando a resposta é incerta e disponibiliza Tentar novamente.

SELECT dos eventos exige perfil ADMINISTRADOR, SUPERVISOR ou OPERADOR e estoque autorizado. CAIXA, anônimo e outro estoque são excluídos. UPDATE/DELETE dos eventos auditados são bloqueados. Gatilhos diferidos também rejeitam quantidades sem evento correspondente, alterações de identidade e resumos incompatíveis. Transferências com nova auditoria não podem ser excluídas permanentemente: os eventos devem ser preservados e as correções registradas.

Finalização é explícita. O servidor compara previsão, quantidade real, revisão e eventos. Divergências ou origem incompleta impedem finalização normal; o fluxo com divergência exige motivo. Registros antigos continuam consultáveis. A revisão explícita de uma caixa histórica sem conversão exige UN/CX e motivo e mantém a origem anterior sem rastreio.

## Caso HYPE: evidência preservada

Consulta remota somente de leitura confirmou a transferência `TRF-20261105-093644-VDCG-HYPE-2`: SKUs 49878=4, 51173=4, 53386=2, 59845=4, 72052=8, 94200=2. São 24 solicitadas e 24 lacradas, quantidade enviada antiga zerada e ausência de eventos individuais. O relatório calcula **24 unidades registradas na caixa; origem não rastreada**, sem atualizar essas linhas e sem inventar leituras, ator ou horário.

## Arquivos

- `script.js`: integração limitada à montagem de saída, carregamento de histórico ao abrir a transferência, correção/remoção, extras, finalização e relatório.
- `src/transfer-packing-audit.js`: reconciliação e dados comuns para exportação.
- `src/transfer-packing-api.js`: RPC, requisição idempotente e leitura paginada do histórico selecionado.
- `src/transfer-packing-view.js`, `src/transfer-packing.css`: modos de entrada, resumo do item, histórico e resultado responsivo.
- `supabase/migrations/20261109140435_wms_packing_traceability.sql`: transação e proteções.
- `tests/transfer-packing-*.test.js`: regressões de cálculo, transporte e PostgreSQL isolado (PGlite).
- `tests/transfer-back-navigation.test.js`: adaptação da fixture ao carregamento de histórico.
- `tests/packing-visual.html`: cenário sintético de navegação, sem conexão com produção.

## Validação

`npm test`: 333 testes aprovados, zero falhas. `npm run lint`: aprovado. `npm run build`: aprovado (permanece o aviso do Vite sobre o tamanho do bundle principal). Testes de banco são locais, não representam uma migration já aplicada no Supabase remoto.

Testes abrangem unitárias versus quantidade manual, ajustes líquidos, caso HYPE, faltas, excessos, extras/remoção preservada, 3 CX × 24 = 72, caixa mista 70, conversão histórica explícita, revisão concorrente obsoleta, repetição da mesma ação, rejeição de outro código, isolamento de eventos, imutabilidade, falha de auditoria com rollback e finalização normal/com divergência.

No navegador local foram conferidos uma leitura + quatro manuais, quatro leituras unitárias, histórico com eventos e cartões a 390 px. Essa prévia usa respostas sintéticas; a lógica SQL foi validada separadamente em PostgreSQL isolado. Não foi exercitado um scanner físico nem uma sessão real de produção com a migration ainda não publicada.

CSV, Excel HTML (.xls), JSON e impressão/Salvar como PDF usam a mesma reconciliação. Excel mantém códigos como texto; CSV contém os códigos literais, devendo-se importar a coluna SKU como texto quando o Excel oferecer conversão automática. O histórico e os responsáveis são incluídos nos arquivos. Não há dependências pagas novas.

Pendência de implantação: aprovação de publicação e aplicação controlada da migration; depois, conferir a RPC e o fluxo publicado. Até lá, a produção permanece inalterada.
