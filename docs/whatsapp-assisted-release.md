# WhatsApp — importação assistida: entrega e ativação

## Exclusão da fila — atualização preparada em 29/10/2026

Atualização autorizada para publicação em 29/10/2026. Aplicada somente no WMS a migration `20261029134824_whatsapp_assisted_archive_requests.sql`, a partir da proposta complementar `supabase/proposals/whatsapp_assisted_archive.sql`. Confirmado após a instalação: zero solicitações excluídas. A interface oferece Excluir solicitação da fila, com motivo de 3 a 500 caracteres e confirmação explícita, somente na visão da supervisão. Excluídas podem ser consultadas pelo filtro Solicitações → Excluídas com autor, motivo e histórico preservados.

Operação protegida e transacional cancela tarefas abertas usando cancelar_tarefa, preserva concluídas e quantidades atendidas, marca o pedido com deleted_at/deleted_by/delete_reason e registra REQUEST_ARCHIVED. Repetição não duplica o evento. Locks de tarefas/itens precedem o pedido para serializar com o atendimento; falha de cancelamento reverte tudo. Operadores não enxergam itens de origem excluída e o banco impede reabertura das tarefas. Não há DELETE físico, alteração de saldo, reinterpretação ou criação de pedido.

Publicação depende de aprovação da alteração complementar de banco e do frontend juntos; publicar apenas o frontend antes de instalar as colunas interromperia a leitura da fila. Nenhuma solicitação real foi excluída nos testes. Motivo e checkbox não autorizam exclusão automática pelo agente: a exclusão individual será confirmada pelo usuário na interface.

## Registro da publicação autorizada

Em 28/10/2026, após autorização específica para preparar o banco e publicar desativado, aplicada no WMS `bzqulgdtfpcmkyaldssy` a migration `20261028210821_whatsapp_assisted_import_paused.sql`. Conferidos: entrada VDCG pausada, zero solicitações/itens/tarefas da integração, RLS nas quatro tabelas e ausência de escrita direta pelos clientes. Variável de ativação ausente no projeto Vercel do WMS. O restante deste documento descreve os procedimentos de homologação/ativação ainda pendentes. Não há autorização para retomar a entrada ou criar tarefas reais nesta publicação. A demonstração fica somente no arquivo local preview-whatsapp.html e não aparece no WMS com a integração desligada.

## Escopo implementado

Branch local `feature/whatsapp-assisted-import-20261028`, baseada em `main` b7603a4, conferida com o deployment de produção do WMS. Sem commit, push, merge, deploy ou alteração do banco remoto nesta entrega. CP Álamo não é habilitado. Não há leitor Windows, dependência do modo desenvolvedor, acesso ao aplicativo WhatsApp, automação de mensagens ou serviço pago.

Administrador/supervisor do VDCG cola a mensagem, revisa os SKUs, quantidades, operação e prioridade e confirma antes de aprovar. Itens podem ser incluídos manualmente. Toda interpretação é revisável; ausência de unidade/quantidade não é preenchida por suposição. A mensagem original não é sobrescrita pelas correções de itens. Respostas e citações ambíguas não produzem tarefas automaticamente.

Aprovação cria uma origem e linhas vinculadas, reutilizando criar_tarefa. CLIENTE corresponde a URGENTE, urgência operacional a ALTA; a fila própria ordena por prioridade individual, data de entrada e linha. Ajuste cria AVULSA de verificação, sem alteração de saldo ou inferência de entrada/saída. Nomes citados não atribuem pessoas.

Supervisão atribui operadores pelas funções existentes. Operador vê somente seus itens e registra quantidades parciais; atender 4 de 10 deixa 6 pendentes. Ao finalizar o item, operador passa pela validação existente do supervisor. O guard de banco impede concluir via fluxo genérico enquanto houver pendência; impede troca de origem, estoque, SKU ou quantidade da tarefa vinculada. Cancelamento conserva o histórico e não conta como atendimento físico. Solicitação com cancelamentos fica encerrada com cancelamentos, não totalmente atendida.

Histórico reúne aprovação e quantidades da integração com os eventos existentes das tarefas. Campos de texto usam textContent; nada é executado como HTML, SQL ou comando. Filtros: cliente, prioridade, status, responsável e datas. Indicadores mostram unidades e ajustes separadamente. A consulta administrativa mostra até 50 solicitações recentes com aviso explícito; itens são paginados. Não há polling pesado; atualizar é manual.

## Banco e autorização

Proposta revisável: `supabase/proposals/whatsapp_assisted_approval.sql`. Não foi aplicada.

- `wms_assisted_settings`: entrada pausada por padrão, último ator/instante de alteração.
- `wms_assisted_requests`: texto original, grupo fixo, estoque VDCG, ator e instante de aprovação, conteúdo revisado e informação de retenção.
- `wms_assisted_request_items`: vínculo de origem e tarefa, SKU, quantidades, prioridade, parciais, revisão e verificação de ajuste.
- `wms_assisted_request_events`: histórico da integração e chaves idempotentes de operações.

Todas as tabelas têm RLS e não concedem INSERT/UPDATE/DELETE direto aos clientes. Funções públicas são invoker; os brokers privados definer verificam auth.uid, perfil e estoque explicitamente. O privilégio definer é necessário para operações transacionais protegidas em tabelas sem escrita direta; não é um contorno das políticas existentes. Não alteram permissões de tabelas antigas. Operador recebe leitura apenas de itens vinculados a tarefas atribuídas a ele, e não do texto bruto de solicitações. A supervisão lê somente seu estoque autorizado.

Aprovação é idempotente por UUID e conteúdo. Texto semelhante em 24 horas é suspeita, exigindo revisão explícita. Não constitui prova absoluta de identidade da mensagem. Pausa de entrada é aplicada no servidor, serializada com aprovações. Reenvio idempotente de aprovação já confirmada e atendimento de tarefas existentes continuam possíveis durante a pausa.

Atendimento trava a tarefa e o item, exige revisão atual e quantidade válida; repetição da mesma operação não soma novamente. Trocar conteúdo/ator com a mesma chave falha. Falha em qualquer tarefa da aprovação reverte tudo. O cliente preserva chave/conteúdo nas tentativas de resultado incerto e bloqueia edição; falha de validação confirmada permite corrigir. Mudança de perfil/estoque impede uso de respostas atrasadas.

## Instalação e ativação — somente após aprovação

1. Revisar SQL e diff da branch. Não executar o arquivo automaticamente em produção.
2. Em ambiente separado autorizado, aplicar a proposta como uma migration única e transacional. Conferir helpers existentes, grants/RLS e esquema da Central. Não criar projeto pago ou contratar serviço.
3. Configurar no build desse ambiente `VITE_WMS_WHATSAPP_ASSISTED=true`. A variável não é uma credencial nem autorização; as verificações de servidor continuam obrigatórias.
4. Manter a entrada do servidor pausada inicialmente. Verificar login real de supervisor e operador do VDCG, negação de outro estoque e ATENDENTE, atribuição e notificações antigas. Nenhuma tarefa real deve ser criada nesses testes: usar somente ambiente separado e usuários/dados sintéticos.
5. Supervisor retoma novas importações pelo botão da tela, somente no ambiente autorizado para o teste. Executar colagem → revisão → aprovação → atribuição → início → parcial → conclusão → validação. Testar perda de rede, repetição e histórico. Confirmar nenhum saldo alterado.
6. Aprovar política de retenção e o diagnóstico de homologação. Só então solicitar aprovação específica para migration e publicação em produção. Não basta ativar uma variável para instalar o banco.

`VITE_WMS_WHATSAPP_ASSISTED` ausente ou diferente de true mantém o caminho real desligado. A demonstração experimental em memória continua identificada como simulação. `VITE_WMS_WHATSAPP_ASSISTED_INTAKE=false` pode ocultar o formulário sem ocultar a fila operacional; a pausa efetiva é o controle do servidor. Não inserir service_role ou segredos no build.

## Retenção e rollback

Não há exclusão automática de mensagens. A função administrativa de retenção aceita apenas solicitações com todas as tarefas encerradas/canceladas e limite de pelo menos 30 dias; remove texto e observações, mas preserva IDs, quantidades e vínculos. É irreversível: deve ser executada somente após confirmação específica e política aprovada. Nunca usar texto real em testes ou telemetria.

Rollback inicial: pausar novas importações no servidor. Manter a fila e funções de atendimento para terminar tarefas já aprovadas. Não desativar a única tela operacional enquanto houver pendências; o guard continua protegendo a conclusão genérica. Reverter o frontend integralmente só após encerrar pendências ou disponibilizar uma versão operacional compatível. Não dropar tabelas com dados nem desabilitar RLS. Antes de aplicar a proposta, o rollback é apenas descartar o diff da branch; produção está intacta.

## Verificação e limites

Testes locais cobrem interpretador, simulação, gateway, idempotência, permissões, RLS, rollback transacional, ajuste, parcial, bloqueio de conclusão, pausa e retenção. PGlite executa SQL isolado; um teste usa as definições reais de criar/atribuir/iniciar/concluir/validar da migration da Central, com tabelas e identidade sintéticas. A tela simulada foi operada no navegador e mostrou 4 atendidas / 6 pendentes. Isso não equivale a homologação de autenticação, Supabase REST ou notificações em um ambiente real separado, que continua necessária antes da produção.

Uma falha preexistente da suíte completa foi reproduzida na main: teste `stock screen clears completed loading without hiding import messages`, em import-bindings-natural-key.test.js, usa um mock sem activeWarehouseCode para uma função que já exige esse helper. Não foi alterado código de estoque para mascarar essa falha. Build tem aviso preexistente de tamanho de chunk; não houve refatoração geral.

Não há promessa de reconhecer todas as grafias nem prova de captura automática. A alternativa é assistida, exige copiar/colar e revisar. O horário de aprovação não é o de envio no WhatsApp. Conexão perdida pode deixar resultado incerto: atualizar/conferir antes de iniciar uma aprovação diferente. Não há fila offline persistindo dados pessoais no navegador.
