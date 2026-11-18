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
