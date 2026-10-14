# Roteiro de Demonstracao WMS - CP Alamo

## Ativacao e seguranca

Entre no CP Alamo com ADMINISTRADOR e abra **MODO DEMONSTRACAO**, no menu Processos.
O banner identifica **AMBIENTE DE DEMONSTRACAO - DADOS FICTICIOS**.
FEATURE_DEMO_MODE inicia false. A abertura administrativa habilita apenas a sessao local.
Nao muda perfil, estoque ativo real, permissao de outros usuarios ou configuracao do banco.
Operador, Supervisor, Compras e Atendente nao recebem este menu nem podem ativar o controlador.

Todos os dados simulados ficam somente em memoria e possuem is_demo=true.
Nao sao usados Supabase INSERT/UPDATE/DELETE, RPC de escrita, Storage, notificacoes reais,
IndexedDB ou localStorage. Nenhuma migration e necessaria para a DEMO.
O controlador nao recebe um cliente de banco: apenas uma funcao restrita de consulta SKU.
Como defesa adicional, o cliente bloqueia POST/PATCH/PUT/DELETE para REST, RPC,
Storage e Edge Functions enquanto a DEMO esta ativa. GET de consulta e renovacao de
autenticacao continuam funcionando. Ao sair, o comportamento normal do cliente e preservado.
Sincronizacao operacional e alertas normais sao pausados durante a apresentacao e retomados ao sair.

## Cenario preparado

- DEMO-COMPRAS-001: Compras DEMO -> DESTINO DEMO, tres itens, duas caixas.
- SKU 01302: solicita 4 e separa/confere 4.
- SKU 84390: solicita 3 e separa/confere 3.
- SKU 94137: solicita 2 e separa/confere 1.
- Total: solicita 9, separa/confere 8, divergencia de 1.
- REP-DEMO-001: solicita 2, separa 2 e conclui localmente.
- GDV-DEMO-2026-001/002/003: 12, 20 e 40 caixas enviadas, NFE-DEMO-001/002/003.
- Meta Outubro/2026: 100 caixas; realizado 72; percentual 72%; restante 28.

Nomes, responsaveis, destinos, documentos, quantidades e processos sao ficticios.
Unidade existente e apenas referencia visual autorizada. Nenhum produto DEMO e criado na CAPTACAO.
Zeros iniciais do SKU 01302 continuam presentes.

## Sequencia Para Apresentar

1. Dashboard DEMO: mostre o cenario preparado e os indicadores locais.
2. Consulta SKU: a consulta real da CAPTACAO e somente leitura, busca um SKU exato
   e carrega no maximo uma posicao ativa da unidade autorizada. O saldo exibido e da posicao,
   nao um total inventado. Se nao existir, continue com os tres produtos ficticios.
3. Compras cria: escolha a unidade de referencia, mantenha DESTINO DEMO e clique
   **Criar solicitacao DEMO**. Nao e criado nenhum pedido real.
4. Estoque: **Iniciar separacao** mostra Colaborador DEMO e o horario local.
5. **Concluir conferencia** mostra 9 solicitadas, 8 separadas/conferidas e divergencia 1.
6. **Finalizar montagem** confirma duas caixas DEMO.
7. **Disponibilizar para NF** passa responsabilidade para COMPRAS DEMO e registra aviso local.
8. Compras / NF: mostre que **Liberar para envio** esta desabilitado sem PDF.
9. **Simular PDF DEMO anexado** registra NF_DEMO_000001.pdf, explicitamente como simulacao.
   Alternativa: selecionar um PDF valido de ate 10 MB; ele fica apenas no navegador, nunca no Storage.
10. **Liberar para envio** passa responsabilidade para ESTOQUE / EXPEDICAO DEMO.
11. **Marcar como despachada**, **Marcar como recebida**, **Concluir processo**.
12. Reposicao DEMO: avance PENDENTE -> EM_SEPARACAO -> SEPARADO -> CONCLUIDO.
    Nenhum credito ou reserva real e executado.
13. Logistica Reversa / Meta mensal: mostre os tres registros e a barra de 72%.
14. Dashboard final: processos concluidos deixam a fila local; realizado permanece 72/100.

**Avancar etapa DEMO** executa o proximo passo local permitido; na aba Reposicao avanca
somente a reposicao. O bloqueio sem PDF continua valendo mesmo nesse atalho.
**Roteiro DEMO** abre a sequencia dentro da tela.

## Indicadores Durante o Fluxo

Antes de disponibilizar para NF, Aguardando NF e zero: e uma pendencia prevista, ainda nao efetivada.
Depois da conferência/disponibilizacao, Dashboard mostra uma transferencia aberta, uma aguardando NF,
uma com divergencia, uma reposicao pendente e 72/100 caixas de reversa.
Depois de concluir, abertas e aguardando NF voltam a zero. Essa variacao evita indicadores incoerentes.

## Reset e Saida

**Resetar DEMO** e **Carregar cenario DEMO** restauram exclusivamente o estado em memoria.
Repetir a carga de reversa nao duplica as 72 caixas. PDFs locais tem URLs revogadas no reset/saida.
**Sair da DEMO**, navegar a uma tela normal ou encerrar sessao descarta a simulacao.
Sem DEMO, os registros nao aparecem em filas, exportacoes, alertas ou contadores reais.
Nao e necessario F5. Reabrir inicia um cenario limpo.

## Verificacao

Testes unitarios: permissao administrativa, flag inicialmente desligada, bloqueio sem PDF,
avanco de etapas, 9/8/8/1 unidades, zeros iniciais, reset/saida, reversa 72%, reposicao e ausencia
de clientes de persistencia nos modulos. Verificacao visual adicional usa fixtures isoladas com
Playwright em desktop e celular, mantendo os indicadores normais inalterados.
