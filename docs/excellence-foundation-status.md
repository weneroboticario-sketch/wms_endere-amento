# Fundação Logística de Excelência — estado técnico

Branch: feat/wms-logistica-excelencia-foundation-20261118. Base WMS: 036c0d2; regras anteriores reaproveitadas. Custo adicional autorizado: ZERO. Não criar projetos, upgrades ou serviços pagos. Produção não modificada.

## Implementado localmente

- PostgreSQL PGlite com schemas, FKs, índices, RLS e RPC protegida. SQL proposto: supabase/proposals/excellence_foundation.sql e excellence_api.sql; ainda não são migrations liberadas para produção.
- Nove tabelas isoladas: versões de critérios, ciclos, evidências, notas manuais, iniciativas, avaliações, calibrações, premiações (estrutura sem concessão) e auditoria.
- Papéis autenticados e escopo por estoque/pessoa, autovalidação rejeitada, critérios imutáveis e audit log append-only.
- Ciclo desativado por padrão. Feature flag de build VITE_LOGISTICA_EXCELENCIA_ENABLED=false por omissão; carregamento modular sob demanda. Nenhuma rotina automática nos módulos operacionais.
- Processamento explícito por ciclo para tarefas, reposições e eventos de transferência. Evidências de responsabilidade não comprovam execução exclusiva. Endereçamento sem ID verificável não gera autoria individual. Nenhuma leitura de wms_stock_positions ou mensagens privadas.
- Prévia com PostgreSQL no servidor local: http://127.0.0.1:4189/. Iniciar com node tests/excellence/server.mjs. Apenas loopback, personas sintéticas, banco temporário, sem credenciais reais ou acesso à produção. Não expor este servidor na rede nem hospedá-lo como backend final.
- Tela colaborador/liderança, critérios, evidências, iniciativas, notas manuais, revisão de observação e propostas de calibração.
- Cálculo preliminar a partir da configuração persistida; ausência de dados fica N/D. Observações operacionais ainda dependem de revisão humana. Proposta de calibração não altera nota calculada ou fecha avaliação.

## Validação executada

433 testes passaram com node --test --test-isolation=none tests/*.test.js tests/excellence/*.test.js. Incluem dois testes de integração PostgreSQL do módulo, além dos sete testes anteriores de domínio. ESLint completo passou. Build Vite passou com execução local autorizada fora do sandbox (esbuild inicialmente retornou EPERM). Prévia aberta no navegador e evidências de três fontes verificadas na tela.

## Infraestrutura consultada (somente leitura)

Supabase bzqulgdtfpcmkyaldssy ACTIVE_HEALTHY. Banco: 688600755 bytes. wms_stock_positions: 606060544 bytes, estimativa 873631 linhas vivas e 131442 mortas. wms_replenishment_requests: 4104192 bytes; operacao_tarefas: 2605056; wms_history: 1196032; wms_transfer_events: 360448. Conexões na amostra: 25 totais, 3 ativas. Estatísticas são fotografias de momento, não garantia de capacidade ou quota disponível. Nenhum vacuum, índice, limpeza ou backfill executado em produção. Cotas de egress, compute e storage/faturamento não foram comprovadas.

## Pendências que bloqueiam considerar a fundação concluída

- Supabase CLI/Docker não encontrados no PATH ou localizações verificadas. PGlite valida Postgres/RLS, mas não Auth/Storage/Gateway reais. Testes desses serviços completos continuam pendentes em stack gratuita compatível.
- Converter SQL proposto em migrations via CLI após revisão completa; ainda não aplicar no banco existente.
- Endurecer constraints/configuração versionada e ciclo fechado; fechamento com snapshot, avaliação consolidada e reabertura ainda indisponíveis. Estrutura de assessments existe, fechamento não implementado.
- Implementar criação/edição versionada pela administração, critérios com composição específica, ausência/oportunidade, setores/escalas, impedimentos, validação de iniciativas e revisão de registros.
- Processador atual usa lote limitado e consultas JSON; precisa de paginação/cursor e plano de execução sobre colunas/indexes existentes antes de produção. Não rodar backfill real ainda. Falta registrar relatório persistido de insuficiência/autoria nas fontes ignoradas.
- Idempotência de escrita da UI (iniciativa/calibração) e proteção contra clique concorrente entre abas ainda pendentes; evidências já têm chave única.
- Ver origem mostra referência, ainda não abre detalhe operacional. Falta paginação das telas.
- Anexos privados e retenção, relatórios PDF/Excel, confiança avançada/fairness, configurações gerenciais e fluxo de reconhecimento completo pendentes.
- Interface usa prompts provisórios; precisa formulários acessíveis e testes físicos Android/teclado. Sem certificação mobile ainda.
- Serviço final usa RPC Supabase existente; instalação e teste integrado com auth existente só após validação técnica, autorização e revisão do consumo/cotas. Não habilitar via flag antes disso.

## Reversão e limites

Desativar flag remove acesso ao módulo; carregamento sob demanda evita trabalho de background. SQL ainda só local: nenhum rollback de produção necessário. Quando houver implantação, preservar tabelas e histórico; não derrubar dados como reversão. A prévia local comprova uma vertical sintética e não comprova funcionamento com dados reais, todos os dispositivos ou todas as regras do programa. Fundação completa ainda pendente.

## Motor de avaliação solicitado — incremento local

Requisitos detalhados preservados em docs/excellence-evaluation-requirements.md.
Novo src/excellence/evaluation-engine.js implementa fórmulas parametrizadas de execução (prazo no período e complexidade anterior), qualidade/organização com amostra independente, avaliação assistida com fatos/oportunidade, e composição de pontos apurados/pendentes/não obtidos. Cada resultado mantém numerador, denominador, fontes/exclusões e regra. Zero assistido só é aceito com oportunidade e fundamento; ausência retorna null.

Cinco novos testes do motor passaram e dois testes PostgreSQL de integração anteriores passaram; lint src/excellence/tests/excellence passou. Não foi repetida regressão total neste incremento, pois as novas funções ainda não estão conectadas à aplicação. Os 433 testes do incremento anterior não são apresentados como resultado da versão atual.

Importante: o novo motor AINDA NÃO substitui src/excellence/scoring.js na tela nem no backend. A composição 55/45 uniforme da prévia anterior não satisfaz a nova distribuição por critério. Antes de disponibilizar é obrigatório conectar a configuração versionada correta (25/0,20/5,0/20,10/0,0/10,0/10), persistir os fatos elegíveis, validar parâmetros na RPC e calcular snapshots no servidor. Não reutilizar notas manuais como pontuação automática.

Dashboard/gráficos solicitados, exportações, evolução entre períodos comparáveis, confiança estatística completa, simulador e fechamento permanecem pendentes. Nenhum gráfico decorativo com dados inventados foi acrescentado. Nenhuma publicação, custo adicional ou alteração do banco de produção.

## Integração do novo motor — 18/11/2026

- Cálculo anterior 55/45 uniforme substituído em src/excellence/scoring.js por composição por critério da versão persistida: 25/0 execução, 20/5 qualidade, 0/20 iniciativa, 10/0 organização, 0/10 equipe, 0/10 postura. Defaults estão centralizados na criação de NOVOS ciclos; versões anteriores não são recalculadas silenciosamente.
- api/excellence-evaluation.js verifica JWT com Auth, usa chave pública e token do próprio usuário para RPC autorizada e calcula no servidor. Não usa service_role. Requer LOGISTICA_EXCELENCIA_ENABLED=true, além da flag de interface. Endpoint ainda não implantado nem validado contra Auth de produção.
- A tela agora exige calculation do servidor. Mostra pontos apurados, pendentes e não obtidos, composição gráfica e explicação por critério, com fórmula, numerador/denominador, período, versão e exclusões.
- Notas assistidas exigem IDs de evidências do mesmo ciclo/colaborador e justificativa. Backend rejeita manual para execução/organização (máximo assistido zero), evidência estrangeira e autovalidação. Evidências usadas como complementação assistida são excluídas do cálculo automático para evitar dupla contabilização.
- Limite de 100 evidências agora é sinalizado como truncado e impede resultado completo. Paginação continua pendente.
- Período confirmado no banco com fuso America/Cuiaba e intervalo final exclusivo. Nenhum fato é inventado para completar amostras.
- Validação: 439 testes de regressão passaram antes do ajuste final do período; depois os oito testes específicos do módulo passaram com o período local, incluindo integração SQL/configuração/avaliação. Lint completo passou após ajustes finais da interface. Build passou durante integração. Nova prévia local em http://127.0.0.1:4190/; servidor anterior 4189 pode estar com versão antiga e não deve ser usado para validar este incremento.

Limitações mantidas: fatos operacionais normalizados para execução/qualidade/organização ainda precisam de persistência/proveniência confiável. Portanto evidências antigas sem autoria/complexidade/verificação continuam N/D. As notas assistidas por dimensão, sugestões fundamentadas avançadas, demais gráficos, ausência/escala, fechamento/snapshots, paginação, anexos/Storage e teste com Auth real permanecem pendentes. A integração local é funcional, mas não equivale a prontidão para produção. Sem publicação ou custo adicional.

## Paginação e fechamento protegido — incremento validado

- SYNC substituído por paginação keyset (timestamp + ID), 500 registros por fonte/página. Filtros usam colunas nativas e período no fuso do ciclo. Cursor rejeitado fora do período; repetição de página preserva idempotência. Teste com 1205 eventos adicionais no mesmo horário, fonte de outra unidade e evento fora do dia local passou. A interface acompanha as páginas sequencialmente, com limite retomável de requisições.
- readEvaluation lê todas as páginas de evidência do colaborador antes de calcular. Se a revisão mudar entre páginas, interrompe o cálculo. Limite de segurança de 10000 evidências por avaliação é explícito, não truncamento silencioso. Revisão usa ciclo + última sequência de auditoria da unidade, com índice próprio; não agrega todo histórico a cada página.
- prepareCycleClosure calcula todas as avaliações da equipe a partir das mesmas regras/versionamento. Rejeita cobertura insuficiente ou mudanças de revisão. Sem exceção automática para ausências; mecanismo formal de elegibilidade ainda pendente.
- excellence_closure.sql propõe fechamento atômico com snapshots por colaborador, critérios/evidências/notas e nota definitiva. Ciclo guarda apenas metadados coletivos; resultados privados ficam na tabela de avaliações com RLS individual. Snapshots e ciclos fechados são imutáveis. Reabertura ainda indisponível.
- RPC final exclusiva de service_role: navegadores/autenticados não podem enviar snapshots. Endpoint autentica usuário, lê via token desse usuário, calcula no backend e somente então usa credencial administrativa de servidor para gravar. Banco revalida administrador ativo, unidade, revisão, equipe completa, critérios, cobertura e soma dos pontos. Chave nunca vai ao frontend. SUPABASE_SERVICE_ROLE_KEY só seria configurada no backend após validação; nenhuma credencial foi obtida/gravação em produção nesta tarefa.
- Propostas de calibração seguem separadas da nota calculada; não alteram automaticamente a fórmula. Fechamento exige confirmação administrativa e avaliações completas. Concessão de prêmio não implementada.
- Testes do armazenamento usam payload de worker sintético para avaliar fronteiras e também cenário completo com cálculo do motor para toda equipe, snapshots 100 pontos, leitura RLS e preservação após mudança na fonte operacional local. Os fatos são deliberadamente sintéticos e não provam disponibilidade desse grau de autoria nos dados reais.

Validação: 444 testes completos passaram; ESLint completo e build Vite passaram. Prévia atual: http://127.0.0.1:4191/ (dados sintéticos reiniciados, nenhuma conexão à produção); interface administrativa abriu e botão de processamento confirmou paginação. Ambiente: wsl --status confirmou WSL não instalado; Docker/CLI ausentes. Nenhum componente foi instalado e nenhum custo gerado.

Pendências de liberação: stack Auth/Storage completa ou validação técnica equivalente, migrações formais revisadas em vez de propostas, configuração segura do backend final, comprovação dos dados reais normalizados, amostras/ausências/elegibilidade, notas assistidas por dimensão, anexos, formulários definitivos, gráficos/relatórios restantes e ensaio Android. Fundação não é declarada concluída nem publicada.
