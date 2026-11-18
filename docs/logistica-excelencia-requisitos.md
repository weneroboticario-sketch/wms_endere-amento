# PROMPT MASTER — WMS ENDEREÇAMENTO | LOGÍSTICA DE EXCELÊNCIA

## 1. Contextualização do projeto

Atue como um arquiteto de software sênior, especialista em sistemas de gestão logística, indicadores operacionais, gestão de desempenho, experiência do usuário, segurança de dados e desenvolvimento de equipes.

Implemente dentro do WMS Endereçamento um novo módulo denominado:

**LOGÍSTICA DE EXCELÊNCIA**

Programa de Acompanhamento, Desenvolvimento e Reconhecimento Profissional.

O módulo deverá transformar os registros operacionais do WMS em informações úteis para a liderança acompanhar, desenvolver, avaliar e reconhecer os colaboradores.

O sistema deverá auxiliar na identificação de:

- Produtividade;
- Qualidade das entregas;
- Cumprimento das responsabilidades;
- Iniciativas;
- Autonomia;
- Organização;
- Prevenção de problemas;
- Trabalho em equipe;
- Comprometimento;
- Evolução profissional;
- Oportunidades de desenvolvimento.

O objetivo não é simplesmente criar um ranking de produtividade, mas construir uma ferramenta de gestão fundamentada em fatos e evidências.

---

## 2. Problema que precisamos resolver

A liderança possui maior proximidade com as atividades realizadas dentro do estoque, consequentemente consegue observar melhor os colaboradores que trabalham nesse ambiente.

Entretanto, os colaboradores que atuam na loja, no abastecimento e em outras atividades externas ao estoque também precisam ser acompanhados e reconhecidos de maneira justa.

O sistema deverá reduzir essa diferença de visibilidade, permitindo que todos tenham condições equivalentes de demonstrar seus resultados.

Não favorecer colaboradores por:

- Proximidade com a liderança;
- Quantidade de registros no sistema;
- Setor de atuação;
- Volume bruto de movimentações;
- Popularidade;
- Afinidade pessoal;
- Facilidade de demonstrar suas atividades.

A avaliação deverá considerar as responsabilidades efetivamente atribuídas a cada colaborador.

---

## 3. Segurança e preservação do WMS

Antes de iniciar a implementação, realizar uma auditoria técnica completa do projeto WMS Endereçamento.

Verificar:

- Repositório correto;
- Ambiente de produção;
- Estrutura do frontend;
- Estrutura do backend;
- Banco de dados Supabase;
- Autenticação;
- Permissões;
- Políticas RLS;
- Registros operacionais;
- Integrações;
- Histórico de atividades;
- Dependências;
- Desempenho atual;
- Estrutura de publicação no Vercel.

Confirmar a identificação do projeto antes de realizar alterações.

Não misturar o WMS Endereçamento com:

- WMS Dourados;
- CP ÁLAMO;
- Outros sistemas existentes.

Preservar integralmente:

- Endereçamento;
- Consulta SKU;
- Consulta de endereços;
- Reposição rápida;
- Solicitações;
- Bipagem;
- Leitura por câmera;
- Transferências;
- Conferências;
- Movimentações;
- Importações;
- Exportações;
- Saldos;
- Comunicação interna;
- Histórico operacional.

Não realizar alterações destrutivas.

Criar uma branch exclusiva para o desenvolvimento.

Utilizar migrações incrementais, estruturas isoladas, feature flags e mecanismos de reversão.

O novo módulo não deverá prejudicar o funcionamento ou a velocidade das operações atuais.

---

## 4. Estrutura geral do módulo

Criar uma nova aba denominada **Desempenho**, com a identidade visual do programa Logística de Excelência.

Organizar o módulo nas seguintes áreas:

### Área do colaborador

1. Meu desempenho;
2. Minhas atividades;
3. Rotina operacional;
4. Registrar iniciativa;
5. Minhas evidências;
6. Meus desafios;
7. Meu desenvolvimento;
8. Feedbacks;
9. Meus reconhecimentos.

### Área da liderança

1. Central de gestão;
2. Assistente de avaliação;
3. Acompanhamento da equipe;
4. Gestão de tarefas;
5. Rotinas por setor;
6. Auditorias;
7. Validação de iniciativas;
8. Central de evidências;
9. Avaliações individuais;
10. Desenvolvimento e PDI;
11. Premiações;
12. Relatórios;
13. Configurações.

### Área da gerência

1. Indicadores consolidados;
2. Desempenho por setor;
3. Evolução da equipe;
4. Validação das avaliações;
5. Aprovação de premiações;
6. Relatórios gerenciais.

---

## 5. Integração automática com o WMS

Aproveitar os registros já produzidos durante a utilização normal do sistema.

Mapear as funcionalidades existentes e identificar quais informações podem ser utilizadas como evidências.

| Processo | Informações a aproveitar |
|---|---|
| Reposição | Solicitações, itens, executores, horários, conclusão e divergências |
| Endereçamento | Localizações, conferências, correções e regularizações |
| Tarefas | Responsáveis, prioridades, prazos e conclusão |
| Transferências | Conferências, divergências e responsáveis |
| Movimentações | Produtos, quantidades, origem, destino e executor |
| Contagens | Itens conferidos, divergências e resultados |
| Ajustes | Pendências, regularizações e responsáveis |
| Mensageria | Apenas registros operacionais explicitamente vinculados a atividades |
| Histórico | Comprovação de eventos e entregas |

Não utilizar mensagens privadas para monitoramento comportamental.

Sempre que possível, coletar as informações automaticamente.

Não exigir que o colaborador registre novamente uma atividade que já foi comprovada pelo WMS.

Os registros deverão identificar:

- ID da atividade original;
- Usuário autenticado;
- Executor efetivo;
- Solicitante;
- Responsável;
- Participantes;
- Setor;
- Data;
- Horário;
- Status;
- Resultado;
- Origem da informação;
- Evidência vinculada.

Não atribuir automaticamente todo o mérito a quem concluiu a última etapa de uma operação.

Permitir identificar atividades executadas em conjunto.

Evitar duplicidade de registros por meio de chaves de origem e mecanismos de idempotência.

---

## 6. Gestão de setores e responsabilidades

O sistema deverá permitir que a liderança configure livremente os setores operacionais.

Estrutura inicial:

- Loja;
- Estoque;
- Rua 1;
- Rua 2;
- Rua 3;
- Grupo;
- Retirada;
- Recebimento;
- Conferência;
- Apoio operacional.

Permitir cadastrar subdivisões, linhas e áreas de responsabilidade.

Cada colaborador poderá atuar em diferentes setores dentro do mesmo dia.

Exemplo:

- Manhã: Grupo;
- Tarde: Rua 1.

O sistema deverá avaliar o colaborador conforme a atividade e a responsabilidade atribuídas naquele período.

Permitir configurar:

- Escalas;
- Horários;
- Responsabilidades principais;
- Responsabilidades temporárias;
- Substituições;
- Apoios;
- Férias;
- Folgas;
- Ausências autorizadas.

Não utilizar ausências justificadas como penalidade.

---

## 7. Rotinas operacionais inteligentes

Criar rotinas recorrentes que possam ser configuradas pela liderança.

### Loja

- Conferir rupturas;
- Identificar produtos disponíveis no estoque;
- Realizar abastecimento;
- Organizar exposição;
- Conferir validades;
- Verificar divergências;
- Atender solicitações;
- Conferir prioridades;
- Regularizar pendências.

### Estoque

- Organizar ruas;
- Conferir endereçamentos;
- Regularizar produtos sem localização;
- Realizar contagens cíclicas;
- Conferir validades;
- Investigar divergências;
- Preparar FACs;
- Executar ajustes autorizados;
- Organizar áreas operacionais.

### Grupo

- Atender solicitações;
- Separar produtos;
- Conferir separações;
- Atender prioridades;
- Tratar demandas urgentes;
- Regularizar pendências;
- Organizar a área de separação.

### Retirada

- Montar lotes de pedidos;
- Conferir produtos;
- Identificar cortes evitáveis;
- Organizar pedidos;
- Controlar pendências;
- Atender solicitações de entrega;
- Comunicar divergências.

### Recebimento e conferência

- Conferir mercadorias;
- Identificar divergências;
- Verificar quantidades;
- Conferir condições dos produtos;
- Regularizar pendências;
- Encaminhar produtos para armazenamento.

Todas as rotinas deverão ser configuráveis.

Permitir definir frequência diária, semanal, mensal ou personalizada.

Utilizar a escala operacional para atribuir as rotinas automaticamente.

Evitar gerar tarefas em dias nos quais o colaborador não estará trabalhando.

---

## 8. Gestão inteligente de tarefas

Cada tarefa deverá apresentar:

- Título;
- Descrição;
- Setor;
- Responsável;
- Participantes;
- Prioridade;
- Complexidade;
- Data de atribuição;
- Prazo;
- Horário de início;
- Horário de conclusão;
- Resultado esperado;
- Evidências;
- Status;
- Validação;
- Impedimentos.

### Status

- Pendente;
- Em andamento;
- Bloqueada;
- Aguardando validação;
- Concluída;
- Necessita de correção;
- Reprogramada;
- Cancelada.

### Prioridades

- Baixa;
- Normal;
- Alta;
- Urgente.

### Complexidade preliminar

- Simples: peso 1;
- Intermediária: peso 2;
- Complexa: peso 3.

Esses parâmetros deverão ser configuráveis.

A complexidade deverá ser estabelecida antes da execução sempre que possível.

Não permitir alterações retroativas sem justificativa e registro de auditoria.

Uma atividade complexa não deverá ser comparada diretamente com uma atividade simples apenas pela quantidade de conclusões.

Permitir que o sistema associe automaticamente uma operação existente do WMS à conclusão de uma tarefa.

---

## 9. Gestão de impedimentos

Permitir ao colaborador informar quando uma tarefa não puder ser executada.

Motivos iniciais:

- Indisponibilidade de produtos;
- Falha do sistema;
- Dependência de outro setor;
- Alteração de prioridade;
- Atendimento emergencial;
- Falta de recursos;
- Ausência autorizada;
- Divergência de estoque;
- Outros motivos justificados.

A liderança deverá conseguir validar o impedimento.

Impedimentos comprovados e fora da responsabilidade do colaborador deverão ser tratados separadamente dos descumprimentos injustificados.

Quando uma prioridade for alterada pela liderança, preservar o prazo anterior no histórico e registrar a nova programação.

---

## 10. Central de iniciativas

Criar um botão de acesso rápido denominado **Registrar iniciativa**.

O colaborador deverá conseguir registrar uma iniciativa em poucos passos.

Informações:

- Problema identificado;
- Local;
- Produto ou processo envolvido;
- Ação proposta;
- Ação executada;
- Resultado obtido;
- Pessoas envolvidas;
- Evidência.

Permitir anexar fotografias e vincular registros existentes do WMS.

### Categorias

- Identificação de problemas;
- Prevenção de perdas;
- Resolução de problemas;
- Melhoria de processo;
- Apoio a outro setor;
- Melhoria de produtividade;
- Melhoria de qualidade;
- Organização;
- Antecipação de demandas.

### Classificação preliminar

Nível 1 — Identificou e comunicou um problema.

Nível 2 — Identificou e apresentou uma proposta de solução.

Nível 3 — Contribuiu efetivamente para solucionar um problema.

Nível 4 — Resolveu ou preveniu um problema relevante, dentro das suas atribuições.

Nível 5 — Desenvolveu uma melhoria validada que reduz a recorrência de problemas ou gera benefício operacional comprovado.

Esses níveis representam classificações experimentais e não deverão gerar pontuação definitiva automaticamente.

Não incentivar soluções que ultrapassem as permissões ou os procedimentos de segurança do colaborador.

### Validação

Registrada → Em análise → Validada, Necessita de complementação ou Não validada.

Permitir que a liderança também registre iniciativas observadas, vinculando-as aos colaboradores responsáveis.

Identificar possíveis duplicidades e iniciativas compartilhadas.

Avaliar impacto e contribuição, e não simplesmente quantidade de iniciativas.

---

## 11. Auditoria operacional

Criar uma central de auditorias para acompanhar a qualidade das atividades.

Permitir auditorias por:

- Colaborador;
- Setor;
- Linha;
- Rua;
- SKU;
- Endereço;
- Tarefa;
- Processo.

### Auditoria de loja

Verificar:

- Disponibilidade de produtos;
- Rupturas com saldo disponível;
- Qualidade do abastecimento;
- Organização;
- Validades;
- Divergências;
- Pendências.

Quando houver divergência entre disponibilidade sistêmica e exposição, gerar uma indicação de conferência.

Não classificar automaticamente o colaborador como responsável pela falha sem investigação.

### Auditoria de estoque

Verificar:

- Assertividade dos endereços;
- Organização;
- Saldo físico;
- Validades;
- Produtos sem endereço;
- Qualidade das conferências;
- Regularização de pendências.

### Resultados

- Conforme;
- Parcialmente conforme;
- Não conforme;
- Não aplicável;
- Pendente de investigação.

Registrar:

- Auditor;
- Responsável pela atividade;
- Data;
- Amostra;
- Evidência;
- Resultado;
- Necessidade de regularização.

Criar um mecanismo de amostragem que distribua auditorias entre os colaboradores e setores.

O objetivo é garantir que a loja receba acompanhamento equivalente ao estoque.

---

## 12. Central de evidências

Criar uma estrutura unificada de comprovação das atividades.

Aceitar:

- Registros sistêmicos;
- Fotografias;
- Documentos;
- Checklists;
- Auditorias;
- Conferências;
- Observações autorizadas;
- Tarefas;
- Solicitações;
- Movimentações;
- Iniciativas.

Classificar a origem da evidência:

- Automática;
- Registrada pelo colaborador;
- Registrada pela liderança;
- Registrada pela gerência;
- Validada por auditoria.

Toda evidência deverá possuir identificação, data, origem e vínculo com o evento correspondente.

O colaborador não poderá validar a própria evidência quando esta exigir validação independente.

Não exigir fotografias de todas as atividades.

Priorizar os dados já disponíveis no WMS.

Implementar acesso restrito aos arquivos, política de retenção, exclusão controlada e proteção dos dados pessoais.

---

## 13. Assistente de inteligência gerencial

Esta será uma das principais funcionalidades do projeto.

Criar uma tela denominada **Assistente de Avaliação**, responsável por analisar os registros operacionais e apresentar informações relevantes à liderança.

O sistema deverá organizar os acontecimentos automaticamente, reduzindo a necessidade de acompanhar cada colaborador individualmente durante todo o expediente.

### Identificar entregas relevantes

Exemplos:

- Colaborador concluiu as responsabilidades dentro do prazo;
- Colaborador auxiliou outro setor após finalizar suas prioridades;
- Colaborador apresentou melhora no índice de conformidade;
- Colaborador solucionou uma pendência relevante.

### Identificar iniciativas

Exemplos:

- Problema identificado antes de gerar impacto;
- Ruptura regularizada;
- Divergência investigada e solucionada;
- Melhoria operacional implementada;
- Risco de perda identificado.

### Identificar pontos de acompanhamento

Exemplos:

- Tarefas recorrentes não concluídas;
- Retrabalho comprovado;
- Pendências sem atualização;
- Não conformidades recorrentes;
- Dificuldades em determinado processo.

### Identificar falta de informações

Exemplos:

- Colaborador da loja com poucas atividades auditadas;
- Setor com ausência de evidências;
- Critério sem informações suficientes;
- Atividades que não possuem executor identificado;
- Diferenças relevantes na cobertura de acompanhamento.

### Identificar oportunidades de desenvolvimento

Apresentar tendências verificáveis, permitindo que a liderança analise:

- Evolução no cumprimento de tarefas;
- Redução de erros;
- Melhoria na organização;
- Desenvolvimento de autonomia;
- Participação em atividades coletivas.

Não realizar inferências sobre personalidade, motivação ou comprometimento com base apenas em quantidade de registros ou frequência de acesso.

Cada informação apresentada deverá conter:

- Colaborador;
- Período;
- Fato observado;
- Indicador correspondente;
- Evidências;
- Origem dos dados;
- Limitações;
- Sugestão de ação gerencial.

Disponibilizar botões:

- Consultar evidências;
- Validar informação;
- Solicitar esclarecimento;
- Registrar feedback;
- Criar tarefa;
- Vincular à avaliação;
- Desconsiderar com justificativa.

Inicialmente, utilizar regras determinísticas, indicadores e consultas estruturadas, sem depender de APIs pagas de inteligência artificial.

O assistente deverá apoiar a liderança, nunca substituir a decisão humana.

---

## 14. Avaliação de desempenho — Arquitetura inicial

Preparar uma estrutura configurável de avaliação de até 100 pontos.

| Critério | Peso preliminar |
|---|---:|
| Execução e conclusão de tarefas | 25 |
| Qualidade e assertividade | 25 |
| Iniciativa e autonomia | 20 |
| Organização e prevenção | 10 |
| Trabalho em equipe | 10 |
| Postura profissional e comprometimento | 10 |
| Total | 100 |

Preparar a possibilidade de combinar avaliações automáticas e avaliações humanas.

Distribuição experimental:

| Critério | Dados operacionais | Validação humana |
|---|---:|---:|
| Execução | 25 | 0 |
| Qualidade | 20 | 5 |
| Iniciativa | 0 | 20 |
| Organização | 10 | 0 |
| Trabalho em equipe | 0 | 10 |
| Postura | 0 | 10 |
| Total | 55 | 45 |

Os indicadores operacionais deverão utilizar registros confiáveis e auditados.

A distribuição acima é apenas uma hipótese inicial.

Não estabelecer esses pesos como regras definitivas.

Permitir configurar:

- Critérios;
- Subcritérios;
- Pesos;
- Fórmulas;
- Metas;
- Faixas;
- Cobertura mínima de evidências;
- Regras de elegibilidade;
- Regras de desempate.

Versionar as configurações por ciclo de avaliação.

Não modificar retroativamente um ciclo fechado quando os critérios forem atualizados.

---

## 15. Motor de indicadores

Preparar uma estrutura para calcular indicadores de desempenho.

### Cumprimento de tarefas

Calcular a proporção entre tarefas elegíveis concluídas dentro dos critérios acordados e tarefas elegíveis atribuídas no período.

Considerar a complexidade previamente definida.

Separar tarefas bloqueadas, canceladas, reprogramadas e não aplicáveis.

### Qualidade

Calcular a conformidade com base em atividades efetivamente verificadas.

Apresentar o tamanho da amostra.

Não interpretar ausência de erros registrados como qualidade de 100%.

### Organização

Utilizar checklists, auditorias e regularizações validadas.

### Iniciativa

Apresentar iniciativas validadas, resultados e impacto comprovado.

Não converter automaticamente quantidade de iniciativas em mérito.

### Evolução

Comparar períodos equivalentes considerando:

- Função;
- Responsabilidades;
- Jornada;
- Complexidade;
- Cobertura de evidências.

### Cobertura de avaliação

Criar um indicador específico de suficiência de informações.

Considerar:

- Atividades acompanhadas;
- Auditorias realizadas;
- Critérios com evidências;
- Período efetivamente trabalhado;
- Setores de atuação.

Classificações:

- Cobertura suficiente;
- Cobertura parcial;
- Dados insuficientes.

Quando não houver dados suficientes, apresentar N/D.

Nunca substituir ausência de informações por zero.

Não publicar classificação definitiva enquanto os critérios obrigatórios estiverem sem evidências suficientes.

---

## 16. Avaliação semanal assistida

Criar uma tela que organize automaticamente as informações da semana de cada colaborador.

Apresentar:

- Responsabilidades atribuídas;
- Atividades concluídas;
- Cumprimento de prazos;
- Atividades bloqueadas;
- Resultados das auditorias;
- Iniciativas;
- Regularizações;
- Apoios prestados;
- Pontos positivos;
- Pontos de atenção;
- Informações que precisam ser verificadas.

A liderança deverá conseguir revisar as informações, complementar observações e concluir o acompanhamento semanal.

Evitar a necessidade de preencher avaliações extensas diariamente.

Permitir que os registros semanais sejam consolidados no fechamento mensal.

---

## 17. Painel individual — Meu desempenho

Criar uma interface individual adaptada aos celulares corporativos.

Apresentar:

- Minhas responsabilidades;
- Tarefas de hoje;
- Progresso semanal;
- Atividades concluídas;
- Pendências;
- Iniciativas registradas;
- Iniciativas validadas;
- Resultados das auditorias;
- Feedbacks;
- Metas individuais;
- Desafios;
- Histórico de evolução;
- Reconhecimentos.

O colaborador deverá entender claramente:

- O que precisa entregar;
- O que já entregou;
- Quais são seus pontos positivos;
- O que precisa melhorar;
- Quais informações fundamentam sua avaliação.

Permitir apresentar esclarecimentos e solicitar revisão de registros.

Não permitir visualizar avaliações privadas de outros colaboradores.

---

## 18. Dashboard gerencial

Criar uma central de gestão completa.

### Indicadores principais

- Colaboradores acompanhados;
- Tarefas atribuídas;
- Tarefas concluídas;
- Cumprimento de prazos;
- Qualidade das atividades verificadas;
- Iniciativas validadas;
- Auditorias realizadas;
- Não conformidades;
- Pendências;
- Cobertura de acompanhamento;
- Evolução da equipe.

### Análises

- Desempenho por colaborador;
- Desempenho por setor;
- Evolução semanal;
- Evolução mensal;
- Distribuição das atividades;
- Cobertura de auditorias;
- Distribuição de responsabilidades;
- Complexidade das tarefas;
- Principais tipos de impedimentos;
- Processos com maior retrabalho.

### Filtros

- Colaborador;
- Setor;
- Período;
- Processo;
- Prioridade;
- Complexidade;
- Status;
- Tipo de evidência.

Permitir abrir os registros originais que fundamentam cada número.

Destacar diferenças de cobertura entre loja e estoque.

Não apresentar comparações diretas de produtividade bruta entre funções diferentes.

---

## 19. Feedbacks e PDI

Criar uma central de desenvolvimento profissional.

Permitir registrar:

- Feedback positivo;
- Feedback de desenvolvimento;
- Ponto de melhoria;
- Objetivo individual;
- Competência a desenvolver;
- Desafio semanal;
- Plano de ação;
- Prazo;
- Evidências;
- Resultados;
- Retorno do colaborador.

Criar acompanhamento de PDI com:

- Competência atual;
- Comportamento esperado;
- Ações de desenvolvimento;
- Indicador de evolução;
- Responsável pelo acompanhamento;
- Prazo;
- Status.

O sistema poderá destacar registros relevantes para subsidiar feedbacks, mas não deverá gerar julgamentos pessoais automaticamente.

---

## 20. Programa de reconhecimento e premiações

Preparar uma central denominada **Reconhecimento**.

Categorias iniciais:

- Destaque do mês;
- Destaque em iniciativa;
- Excelência operacional;
- Destaque em evolução;
- Trabalho em equipe;
- Prevenção de perdas;
- Conquista coletiva.

Tipos de prêmio:

- Folga programada;
- Produtos;
- Tickets;
- Vales;
- Benefícios autorizados.

Permitir configurar campanhas de reconhecimento.

Cada campanha deverá possuir:

- Nome;
- Período;
- Categoria;
- Objetivo;
- Critérios;
- Prêmio;
- Regras de elegibilidade;
- Regras de desempate;
- Evidências exigidas;
- Responsáveis pela aprovação.

### Processo de reconhecimento

1. Consolidação das informações;
2. Verificação da cobertura de avaliação;
3. Consulta das evidências;
4. Análise pela liderança;
5. Indicação de candidatos elegíveis;
6. Validação da gerência;
7. Aprovação conforme regras internas;
8. Comunicação do reconhecimento;
9. Entrega do prêmio;
10. Registro no histórico.

Não conceder automaticamente prêmios.

Não definir vencedores sem avaliação humana e comprovação.

Preparar o funcionamento das campanhas, mas manter as premiações competitivas desativadas durante a fase experimental.

---

## 21. Relatório comprobatório de reconhecimento

Criar um relatório que permita demonstrar por que determinado colaborador foi reconhecido.

O relatório deverá apresentar:

- Nome;
- Período;
- Setores de atuação;
- Responsabilidades;
- Categoria de reconhecimento;
- Critérios utilizados;
- Indicadores;
- Atividades relevantes;
- Iniciativas;
- Evidências;
- Impacto operacional;
- Evolução;
- Justificativa da liderança;
- Aprovação da gerência;
- Prêmio concedido.

Permitir exportação em PDF e Excel.

Preservar a versão dos critérios utilizados naquele período.

As avaliações privadas dos demais colaboradores não deverão constar nos documentos de divulgação pública.

Criar uma versão gerencial restrita para comparação dos candidatos, quando necessário.

---

## 22. Indicadores coletivos da operação

Criar uma estrutura para acompanhar resultados gerais da logística.

Indicadores iniciais:

- Perdas de estoque;
- Divergências;
- Assertividade de endereçamento;
- Produtos sem localização;
- Rupturas evitáveis;
- Tempo de reposição;
- Qualidade das separações;
- Cortes na Retirada;
- Volume de pedidos de Retirada;
- Percentual de pedidos faturados;
- Regularização de pendências;
- Controle de validades.

Permitir configurar metas coletivas.

Não atribuir individualmente indicadores comerciais ou operacionais que dependam de fatores externos à responsabilidade do colaborador.

Exemplo: não penalizar o responsável pela Retirada quando uma revendedora não comparecer para buscar seu pedido.

Quando um indicador depender de uma fonte externa ainda não integrada, apresentar sua origem e indisponibilidade.

---

## 23. Regras obrigatórias de imparcialidade

Implementar as seguintes proteções:

1. Não favorecer colaboradores pela proximidade com a liderança.
2. Não comparar produtividade bruta entre funções diferentes.
3. Não penalizar ausências justificadas.
4. Não penalizar impedimentos comprovados.
5. Não transformar ausência de evidências em nota zero.
6. Não permitir autovalidação.
7. Não contabilizar a mesma atividade diversas vezes.
8. Não aplicar penalidades duplicadas pelo mesmo acontecimento.
9. Diferenciar quem causou um erro de quem identificou o erro.
10. Considerar atividades realizadas em conjunto.
11. Considerar responsabilidades e jornadas diferentes.
12. Não incentivar velocidade em detrimento da qualidade.
13. Permitir revisão de registros.
14. Exigir justificativas para alterações manuais.
15. Manter histórico de auditoria.
16. Garantir cobertura de avaliação entre loja e estoque.
17. Não utilizar vigilância, geolocalização ou monitoramento de mensagens privadas.
18. Não avaliar automaticamente aspectos comportamentais subjetivos.
19. Não definir vencedores exclusivamente por algoritmos.
20. Não transformar indicadores experimentais em medidas disciplinares automáticas.

---

## 24. Estrutura sugerida de banco de dados

Adaptar os nomes e relacionamentos à arquitetura existente.

Criar estruturas isoladas para:

- Configurações do programa;
- Setores;
- Responsabilidades;
- Escalas operacionais;
- Rotinas;
- Instâncias de rotinas;
- Eventos de desempenho;
- Participantes das atividades;
- Impedimentos;
- Iniciativas;
- Evidências;
- Auditorias;
- Itens de auditoria;
- Indicadores;
- Critérios de avaliação;
- Versões dos critérios;
- Ciclos de avaliação;
- Avaliações individuais;
- Itens de avaliação;
- Esclarecimentos;
- Feedbacks;
- PDIs;
- Campanhas de reconhecimento;
- Indicações;
- Premiações;
- Histórico de alterações.

Reaproveitar a estrutura de usuários existente.

Não criar um segundo sistema de autenticação.

Criar chaves estrangeiras, índices, restrições de integridade e políticas RLS adequadas.

Implementar consultas otimizadas e paginação.

Evitar consultas completas aos históricos operacionais a cada abertura de tela.

Preservar o isolamento dos dados entre projetos e unidades.

---

## 25. Permissões

### Colaborador

- Visualizar suas responsabilidades;
- Registrar atividades;
- Informar impedimentos;
- Registrar iniciativas;
- Anexar evidências;
- Consultar desempenho individual;
- Consultar feedbacks;
- Apresentar esclarecimentos.

### Liderança

- Atribuir responsabilidades;
- Configurar rotinas;
- Validar evidências;
- Realizar auditorias;
- Consultar indicadores;
- Elaborar avaliações;
- Registrar feedbacks;
- Gerenciar PDIs;
- Indicar reconhecimentos.

### Gerência

- Consultar indicadores consolidados;
- Revisar avaliações;
- Validar reconhecimentos;
- Aprovar premiações;
- Consultar relatórios autorizados.

Aplicar permissões no backend e banco de dados, não apenas na interface.

Testar tentativas de acesso indevido a dados de outros colaboradores.

---

## 26. Interface e experiência do usuário

Manter a identidade visual do WMS Endereçamento.

Desenvolver uma interface profissional, moderna, responsiva e objetiva.

Priorizar:

- Carregamento rápido;
- Poucos cliques;
- Navegação simples;
- Indicadores visuais;
- Barras de progresso;
- Timeline de atividades;
- Filtros;
- Acesso rápido às evidências;
- Utilização nos celulares corporativos.

Criar notificações discretas e centralizadas.

Não utilizar mensagens fixas que comprometam a visualização das demais abas.

Não adicionar bloqueios ou etapas extras aos fluxos atuais somente para alimentar a avaliação.

---

## 27. Modo experimental e calibração

Disponibilizar um modo denominado **Período de Calibração**.

Sugestão inicial: 30 dias, configuráveis pela liderança.

Durante esse período:

- Coletar informações operacionais;
- Acompanhar atividades;
- Registrar iniciativas;
- Realizar auditorias;
- Identificar diferenças entre setores;
- Verificar a confiabilidade dos indicadores;
- Testar critérios;
- Identificar informações ausentes;
- Simular avaliações privadas;
- Ajustar regras.

Não publicar rankings competitivos.

Não conceder premiações automaticamente.

Ao finalizar o período, gerar um diagnóstico contendo:

- Critérios que possuem dados suficientes;
- Critérios que dependem de acompanhamento humano;
- Indicadores confiáveis;
- Indicadores que precisam de melhorias;
- Diferenças de cobertura entre colaboradores;
- Propostas de ajustes para a metodologia definitiva.

---

## 28. Ordem de implementação

### P0 — Auditoria e arquitetura

- Identificar corretamente o projeto;
- Mapear funcionalidades existentes;
- Mapear registros operacionais;
- Criar estratégia de segurança;
- Preparar estrutura isolada;
- Documentar riscos.

### P1 — Coleta e acompanhamento

- Integrar registros existentes;
- Configurar setores;
- Configurar responsabilidades;
- Criar rotinas;
- Implementar evidências;
- Registrar impedimentos.

### P2 — Qualidade e iniciativas

- Criar auditorias;
- Implementar registro de iniciativas;
- Criar validações;
- Implementar cobertura de acompanhamento.

### P3 — Inteligência gerencial

- Criar motor de indicadores;
- Implementar Assistente de Avaliação;
- Desenvolver acompanhamento semanal;
- Criar dashboards individuais e gerenciais.

### P4 — Desenvolvimento

- Implementar avaliações experimentais;
- Criar feedbacks;
- Criar PDI;
- Implementar histórico de evolução.

### P5 — Reconhecimento

- Criar campanhas;
- Preparar regras configuráveis;
- Implementar indicações;
- Desenvolver relatórios comprobatórios;
- Preparar gerenciamento de prêmios.

Implementar progressivamente todas as etapas, mantendo a avaliação definitiva e as premiações automáticas desativadas.

---

## 29. Testes obrigatórios

Realizar testes funcionais, de integração, segurança e regressão.

Validar cenários:

- Colaborador atuando em dois setores;
- Tarefa compartilhada;
- Reposição com participantes diferentes;
- Tarefa bloqueada;
- Mudança de prioridade;
- Iniciativa duplicada;
- Auditoria sem evidência suficiente;
- Colaborador com baixa cobertura de acompanhamento;
- Colaborador em férias;
- Divergência identificada por pessoa diferente de quem causou;
- Alteração de critérios;
- Tentativa de acesso indevido;
- Fechamento de avaliação;
- Exportação de relatórios;
- Aprovação de reconhecimento.

Verificar também:

- Endereçamento;
- Consulta SKU;
- Reposição rápida;
- Bipagem;
- Leitura por câmera;
- Transferências;
- Saldos;
- Exportações;
- Desempenho geral do WMS.

Testar em ambiente de prévia antes de disponibilizar em produção.

Não ativar funcionalidades que apresentem riscos ou falhas.

---

## 30. Entrega técnica obrigatória

Ao finalizar, apresentar um relatório completo contendo:

1. Funcionalidades implementadas;
2. Arquivos criados e modificados;
3. Estruturas adicionadas ao banco;
4. Informações reaproveitadas;
5. Indicadores automáticos disponíveis;
6. Indicadores que dependem de alimentação manual;
7. Limitações identificadas;
8. Permissões implementadas;
9. Testes realizados;
10. Resultados dos testes;
11. Impacto no desempenho;
12. Procedimento de reversão;
13. Funcionalidades pendentes;
14. Recomendações para evolução.

Disponibilizar uma prévia funcional para validação da liderança.

Não declarar que uma funcionalidade está completamente operacional sem testes que comprovem seu funcionamento.

## Diretriz final

O WMS Endereçamento deverá evoluir de uma ferramenta exclusivamente operacional para uma ferramenta de apoio à gestão e ao desenvolvimento da equipe.

O sistema deverá ajudar a liderança a enxergar o trabalho de todos, identificar contribuições, reconhecer boas entregas, acompanhar dificuldades e tomar decisões fundamentadas.

A avaliação deverá ser justa, transparente, verificável e proporcional às responsabilidades de cada colaborador.

Preservar integralmente os processos existentes.

Preparar toda a arquitetura para que a metodologia de avaliação e as regras de reconhecimento possam continuar evoluindo sem necessidade de reconstruir o sistema.