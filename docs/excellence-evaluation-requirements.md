# WMS ENDEREÇAMENTO — MOTOR DE AVALIAÇÃO, PONTUAÇÃO E DASHBOARD DE DESEMPENHO

## 1. Objetivo

Dar continuidade à implementação do módulo Logística de Excelência no WMS Endereçamento, desenvolvendo um sistema completo de avaliação assistida, cálculo automático de pontuações, indicadores, gráficos, acompanhamento individual e reconhecimento profissional.

O sistema deverá reduzir significativamente o trabalho manual da liderança, utilizando os registros operacionais para construir avaliações fundamentadas em resultados e evidências.

O objetivo é permitir que a liderança acompanhe igualmente todos os colaboradores, independentemente de atuarem na loja, estoque, Grupo, Retirada ou demais áreas operacionais.

## 2. Restrições obrigatórias

- Não gerar custos adicionais.
- Não criar novos projetos no Supabase.
- Não contratar APIs de inteligência artificial.
- Utilizar regras determinísticas e análises estatísticas.
- Aproveitar a infraestrutura existente.
- Utilizar ambiente local para desenvolvimento e testes.
- Preservar integralmente as funcionalidades atuais.
- Não misturar o WMS Endereçamento com o WMS Dourados ou CP ÁLAMO.
- Não duplicar dados operacionais.
- Não comprometer o desempenho do sistema.
- Não publicar alterações sem testes de segurança e regressão.

Antes de implementar, verificar o que já foi desenvolvido no módulo Logística de Excelência e dar continuidade à estrutura existente.

## 3. Motor de avaliação automática

Criar um motor de avaliação configurável, com pontuação máxima de 100 pontos.

Utilizar inicialmente a seguinte distribuição experimental:

| Critério | Automático | Assistido | Total |
|---|---:|---:|---:|
| Execução de tarefas | 25 | 0 | 25 |
| Qualidade e assertividade | 20 | 5 | 25 |
| Iniciativa e autonomia | 0 | 20 | 20 |
| Organização e prevenção | 10 | 0 | 10 |
| Trabalho em equipe | 0 | 10 | 10 |
| Postura profissional | 0 | 10 | 10 |
| Total | 55 | 45 | 100 |

Os 55 pontos automáticos deverão ser calculados pelo sistema a partir de registros confiáveis.

Os 45 pontos assistidos deverão ser sugeridos quando houver evidências suficientes, permitindo revisão e validação pela liderança.

A ausência de informações não deverá gerar nota zero.

Todos os pesos, fórmulas, limites e critérios deverão ser configuráveis e versionados por ciclo de avaliação.

## 4. Execução de tarefas — 25 pontos

Considerar:

- Tarefas atribuídas;
- Tarefas concluídas;
- Cumprimento dos prazos;
- Complexidade;
- Prioridades;
- Responsabilidades;
- Impedimentos;
- Validação das entregas.

Utilizar inicialmente os seguintes pesos de complexidade:

- Simples: 1;
- Intermediária: 2;
- Complexa: 3.

Fórmula experimental:

Percentual de execução = soma dos pesos das tarefas elegíveis concluídas dentro do prazo ÷ soma dos pesos das tarefas elegíveis previstas para o período × 100.

Pontuação de execução = percentual de execução ÷ 100 × 25.

Considerar somente tarefas cujo prazo esteja dentro do período avaliado.

Exemplo:

- Peso total das tarefas elegíveis: 50;
- Peso das tarefas concluídas dentro do prazo: 48;
- Percentual de execução: 96%;
- Pontuação: 24 de 25.

Apresentar separadamente as tarefas concluídas com atraso.

Não considerar como descumprimento:

- Tarefas bloqueadas por terceiros;
- Falhas de sistema;
- Indisponibilidade de produtos;
- Mudanças de prioridade autorizadas;
- Ausências justificadas;
- Cancelamentos legítimos.

Os impedimentos deverão ser validados.

Não permitir divisão artificial de tarefas para aumentar indicadores.

## 5. Qualidade e assertividade — 25 pontos

Dividir em:

- 20 pontos calculados automaticamente;
- 5 pontos de avaliação assistida.

Considerar:

- Conferências;
- Auditorias;
- Assertividade das separações;
- Endereçamento correto;
- Qualidade do abastecimento;
- Divergências comprovadas;
- Retrabalho;
- Cumprimento dos procedimentos.

Fórmula experimental:

Índice de qualidade = verificações conformes ÷ verificações válidas realizadas × 100.

Pontuação automática = índice de qualidade ÷ 100 × 20.

Exemplo:

- 50 verificações realizadas;
- 48 verificações conformes;
- Qualidade: 96%;
- Pontuação automática: 19,2 de 20.

Exibir o tamanho da amostra analisada.

Não considerar ausência de erros registrados como qualidade de 100%.

Não penalizar quem identificou e comunicou uma divergência causada por outro colaborador ou processo.

Os 5 pontos assistidos deverão considerar evidências complementares de qualidade não contempladas pelo indicador automático, evitando dupla contabilização.

## 6. Iniciativa e autonomia — 20 pontos

Criar um mecanismo de sugestões de avaliação baseado em iniciativas validadas.

Considerar quatro dimensões:

| Dimensão | Pontuação máxima |
|---|---:|
| Antecipação de necessidades | 5 |
| Autonomia na execução | 5 |
| Resolução de problemas | 5 |
| Prevenção e melhoria de processos | 5 |

Para cada dimensão, utilizar uma régua de 0 a 5:

- 0: ausência comprovada do comportamento esperado, diante de oportunidades reais;
- 1: desempenho muito abaixo do esperado;
- 2: necessita de direcionamento frequente;
- 3: atende parcialmente às expectativas;
- 4: demonstra autonomia e contribuição consistente;
- 5: supera as expectativas com resultados comprovados.

Quando não houver oportunidades ou evidências suficientes, apresentar N/D.

O sistema deverá analisar os registros de iniciativas e sugerir uma pontuação preliminar fundamentada.

Não utilizar somente o número de iniciativas.

Considerar:

- Relevância;
- Complexidade;
- Resultado;
- Impacto;
- Recorrência;
- Contribuição individual;
- Respeito às atribuições;
- Evidências disponíveis.

Não incentivar ações que ultrapassem permissões ou procedimentos autorizados.

A liderança deverá validar a sugestão.

## 7. Organização e prevenção — 10 pontos

Considerar:

- Organização do setor;
- Controle de validades;
- Regularização de pendências;
- Endereçamento;
- Prevenção de rupturas;
- Cumprimento das rotinas;
- Resultados das auditorias específicas de organização.

Fórmula experimental:

Índice de organização = verificações conformes de organização ÷ verificações válidas de organização × 100.

Pontuação = índice de organização ÷ 100 × 10.

As verificações utilizadas neste critério deverão ser diferenciadas das utilizadas no cálculo de qualidade, evitando duplicidade.

Adaptar os indicadores ao setor de atuação.

## 8. Trabalho em equipe — 10 pontos

Dividir em:

- Cooperação e apoio operacional: 5 pontos;
- Comunicação e contribuição coletiva: 5 pontos.

O sistema deverá reunir evidências relacionadas a:

- Apoio prestado a outros setores;
- Participação em tarefas compartilhadas;
- Comunicação de impedimentos;
- Contribuição para resolver problemas coletivos;
- Cumprimento de responsabilidades compartilhadas.

Gerar sugestões somente quando houver evidências suficientes.

Não utilizar frequência de mensagens, popularidade ou quantidade de interações como indicador de trabalho em equipe.

A liderança deverá validar a pontuação.

## 9. Postura profissional — 10 pontos

Dividir em:

- Responsabilidade e cumprimento dos procedimentos: 5 pontos;
- Comprometimento com as responsabilidades e prioridades: 5 pontos.

Considerar somente fatos documentados, observações justificadas e ocorrências verificáveis.

Não avaliar automaticamente personalidade, emoções ou motivações.

Não utilizar monitoramento de mensagens privadas, localização ou tempo de permanência no aplicativo.

Não penalizar ausências justificadas.

O sistema deverá organizar as evidências para facilitar a avaliação humana.

## 10. Classificação geral

Criar faixas configuráveis de desempenho.

| Pontuação | Classificação |
|---|---|
| 90 a 100 | Excelência |
| 85 a menos de 90 | Alto desempenho |
| 80 a menos de 85 | Bom desempenho |
| 60 a menos de 80 | Em desenvolvimento |
| Abaixo de 60 | Necessita de acompanhamento |

A classificação será experimental durante o período de calibração.

Não utilizar pontuações experimentais para medidas disciplinares.

Separar claramente:

- Pontuação automática;
- Pontuação sugerida;
- Pontuação validada;
- Pontuação definitiva;
- Critérios pendentes.

Não apresentar uma pontuação parcial como resultado definitivo.

Quando faltarem informações, apresentar a pontuação apurada e a quantidade de pontos ainda não avaliados.

## 11. Inteligência de avaliação

Desenvolver um assistente gerencial utilizando regras condicionais, cálculos e cruzamento de informações.

O assistente deverá identificar automaticamente:

### Destaques positivos

- Entregas dentro do prazo;
- Melhoria na qualidade;
- Iniciativas relevantes;
- Problemas solucionados;
- Redução de retrabalho;
- Evolução profissional;
- Apoios operacionais;
- Prevenção de perdas.

### Pontos de atenção

- Tarefas com atrasos recorrentes;
- Pendências sem atualização;
- Não conformidades comprovadas;
- Necessidade de treinamento;
- Processos com retrabalho recorrente;
- Dificuldades documentadas.

### Falta de acompanhamento

- Colaboradores com poucas evidências;
- Setores com poucas auditorias;
- Critérios sem informações;
- Diferenças de cobertura entre loja e estoque;
- Atividades sem executor identificado.

Cada sugestão deverá apresentar:

- O que aconteceu;
- Quando aconteceu;
- Qual colaborador participou;
- Qual critério está relacionado;
- Quais evidências sustentam a informação;
- Qual regra foi utilizada;
- Qual pontuação foi sugerida, quando aplicável;
- Quais são as limitações;
- Qual ação a liderança poderá realizar.

Não gerar conclusões sem evidências.

## 12. Dashboard gerencial completo

Criar um dashboard moderno, profissional, responsivo e integrado à identidade visual do WMS Endereçamento.

Apresentar os seguintes indicadores principais:

- Média de desempenho da equipe;
- Percentual de conclusão das tarefas;
- Índice de qualidade;
- Iniciativas validadas;
- Auditorias realizadas;
- Tarefas bloqueadas;
- Pendências;
- Cobertura da avaliação;
- Evolução em relação ao período anterior;
- Avaliações aguardando validação.

Todos os indicadores deverão permitir consultar os registros que fundamentam os resultados.

## 13. Gráficos obrigatórios

### Gráfico 1 — Classificação de desempenho

Gráfico de barras horizontais contendo:

- Nome do colaborador;
- Setor;
- Pontuação automática;
- Pontuação assistida validada;
- Pontuação total;
- Pontos pendentes;
- Classificação.

Disponibilizar ordenação por pontuação final.

Não posicionar colaboradores com avaliação incompleta no ranking definitivo.

A visualização completa deverá ser restrita à liderança e gerência.

### Gráfico 2 — Evolução individual

Gráfico de linhas mostrando:

- Evolução semanal;
- Evolução mensal;
- Pontuação por período;
- Meta individual;
- Média de períodos comparáveis.

Permitir selecionar o colaborador e o intervalo de análise.

Sinalizar períodos com dados insuficientes.

### Gráfico 3 — Radar de competências

Criar gráfico radar com seis dimensões:

- Execução;
- Qualidade;
- Iniciativa;
- Organização;
- Trabalho em equipe;
- Postura profissional.

Normalizar cada dimensão para uma escala de 0 a 100.

Permitir comparar:

- Período atual;
- Período anterior;
- Meta esperada.

Não substituir critérios sem avaliação por zero.

### Gráfico 4 — Distribuição das pontuações

Gráfico de barras empilhadas ou rosca mostrando:

- Pontuação automática obtida;
- Pontuação assistida validada;
- Pontos ainda pendentes;
- Pontos não obtidos.

Permitir visualizar a composição dos 100 pontos.

### Gráfico 5 — Tarefas operacionais

Gráfico contendo:

- Concluídas no prazo;
- Concluídas com atraso;
- Pendentes;
- Bloqueadas;
- Reprogramadas;
- Canceladas.

Permitir filtros por colaborador, setor e período.

### Gráfico 6 — Qualidade operacional

Apresentar evolução dos índices de:

- Conformidade;
- Não conformidade;
- Retrabalho;
- Assertividade.

Exibir a quantidade de verificações realizadas.

### Gráfico 7 — Iniciativas

Gráfico de barras apresentando:

- Iniciativas registradas;
- Iniciativas validadas;
- Iniciativas aguardando análise;
- Problemas solucionados;
- Melhorias implementadas.

Permitir consulta por categoria e impacto comprovado.

Não classificar automaticamente o melhor colaborador apenas pelo volume de iniciativas.

### Gráfico 8 — Cobertura de avaliação

Apresentar a cobertura de acompanhamento por:

- Colaborador;
- Setor;
- Critério;
- Período.

Destacar diferenças entre loja e estoque.

A cobertura deverá considerar a suficiência das amostras e evidências exigidas para cada critério.

Não confundir cobertura de avaliação com desempenho profissional.

### Gráfico 9 — Mapa de calor operacional

Criar um mapa de calor por colaborador e semana, mostrando:

- Cumprimento de tarefas;
- Qualidade;
- Organização;
- Cobertura da avaliação.

Utilizar cores neutras para ausência de informações.

### Gráfico 10 — Evolução coletiva

Apresentar indicadores operacionais gerais:

- Perdas;
- Cortes evitáveis;
- Divergências;
- Rupturas;
- Endereçamento;
- Reposição;
- Validades;
- Pendências.

Permitir acompanhar as metas da equipe sem atribuir automaticamente responsabilidades individuais.

## 14. Filtros e interatividade

Todos os gráficos deverão possuir filtros compatíveis com seus indicadores.

Filtros gerais:

- Hoje;
- Semana atual;
- Semana anterior;
- Mês atual;
- Mês anterior;
- Período personalizado;
- Colaborador;
- Setor;
- Processo;
- Critério;
- Complexidade;
- Status.

Ao clicar em uma barra, linha, indicador ou segmento de gráfico, abrir o detalhamento dos registros correspondentes.

Utilizar os mesmos critérios de cálculo no dashboard e nos relatórios exportados.

Não utilizar dados fictícios em produção.

## 15. Acompanhamento por setor

Criar indicadores específicos para cada área.

### Loja

- Abastecimento;
- Rupturas evitáveis;
- Organização;
- Controle de validades;
- Conferência de saldos;
- Atendimento às solicitações;
- Qualidade das rotinas.

### Estoque

- Assertividade de endereçamento;
- Organização das ruas;
- Contagens cíclicas;
- Regularização de divergências;
- Produtos sem endereço;
- Controle de validades;
- Conferências.

### Grupo

- Atendimento das solicitações;
- Qualidade das separações;
- Cumprimento das prioridades;
- Agilidade;
- Tratamento de pendências.

### Retirada

- Montagem dos pedidos;
- Conferências;
- Organização;
- Cortes evitáveis;
- Tratamento de pendências;
- Atendimento às solicitações de entrega.

Os indicadores deverão respeitar a responsabilidade efetiva do colaborador no período.

Não comparar diretamente volumes brutos de atividades de setores diferentes.

## 16. Avaliação individual automatizada

Criar uma ficha individual gerada automaticamente pelo sistema.

Apresentar:

- Nome;
- Período;
- Setores de atuação;
- Responsabilidades;
- Pontuação automática;
- Pontuação sugerida;
- Pontuação validada;
- Pontuação por critério;
- Gráficos individuais;
- Evidências;
- Pontos positivos;
- Pontos de atenção;
- Evolução;
- Cobertura da avaliação.

Disponibilizar ações para a liderança:

- Validar pontuação;
- Ajustar pontuação;
- Solicitar esclarecimento;
- Consultar evidências;
- Registrar feedback;
- Criar plano de ação;
- Vincular ao PDI.

Toda alteração manual deverá possuir justificativa e histórico.

## 17. Fechamento semanal automático

Ao consultar o fechamento semanal, o sistema deverá consolidar automaticamente:

- Atividades atribuídas;
- Atividades concluídas;
- Qualidade;
- Iniciativas;
- Auditorias;
- Apoios;
- Impedimentos;
- Pontuação preliminar;
- Critérios pendentes.

Apresentar um resumo individual e coletivo.

Permitir revisão e validação pela liderança.

O fechamento semanal não deverá exigir preenchimento manual de todas as informações.

## 18. Fechamento mensal

Criar uma central de fechamento mensal.

O sistema deverá:

1. Consolidar os registros do período;
2. Verificar a cobertura das avaliações;
3. Calcular as pontuações automáticas;
4. Apresentar sugestões fundamentadas;
5. Identificar critérios pendentes;
6. Solicitar validação humana;
7. Consolidar a pontuação final;
8. Identificar possíveis candidatos ao reconhecimento após aprovação da metodologia;
9. Gerar relatórios comprobatórios;
10. Preservar o histórico fechado.

Não concluir automaticamente avaliações com dados insuficientes.

Não permitir alteração silenciosa de períodos fechados.

## 19. Premiações e reconhecimento

Preparar as seguintes categorias:

- Destaque geral;
- Destaque em iniciativa;
- Excelência operacional;
- Destaque em evolução;
- Trabalho em equipe;
- Prevenção de perdas;
- Reconhecimento coletivo.

Permitir cadastrar premiações como:

- Folgas;
- Produtos;
- Tickets;
- Vales;
- Outros benefícios autorizados.

Utilizar inicialmente 85 pontos como referência experimental de elegibilidade geral.

O candidato deverá possuir cobertura suficiente de avaliação e evidências validadas.

Preparar regras de desempate configuráveis.

Sugestão inicial:

1. Qualidade;
2. Iniciativa;
3. Execução.

Não conceder premiações automaticamente.

A liderança e a gerência deverão validar os resultados.

Manter as premiações competitivas desativadas até a aprovação definitiva das regras.

## 20. Simulador de avaliação

Criar uma ferramenta exclusiva para a liderança simular alterações nos critérios.

Permitir:

- Alterar pesos;
- Alterar metas;
- Alterar limites;
- Simular pontuações;
- Comparar metodologias;
- Identificar possíveis distorções;
- Verificar diferenças entre setores.

As simulações não deverão alterar avaliações oficiais.

## 21. Transparência dos cálculos

Criar um botão denominado **Como foi calculado?** ao lado de cada indicador e pontuação.

Exibir:

- Fórmula utilizada;
- Período;
- Peso máximo;
- Valor obtido;
- Numerador;
- Denominador;
- Amostra;
- Registros considerados;
- Registros desconsiderados;
- Motivos de exclusão;
- Evidências;
- Versão da regra.

O sistema deverá permitir comprovar a origem de cada ponto atribuído.

## 22. Segurança e prevenção de manipulação

Implementar:

- Controle de permissões no backend;
- Políticas RLS;
- Registro de alterações;
- Validação independente;
- Prevenção de duplicidade;
- Identificação do executor efetivo;
- Proteção das evidências;
- Versionamento das regras;
- Controle de atividades compartilhadas;
- Validação de impedimentos;
- Registro de ajustes manuais.

Não permitir que o colaborador aprove a própria pontuação.

Identificar possíveis tentativas de manipulação, como duplicação de tarefas ou registros repetidos, encaminhando-as para revisão sem aplicar penalidades automáticas.

Restringir avaliações e feedbacks individuais aos usuários autorizados.

## 23. Relatórios

Permitir exportação em PDF e Excel.

Relatórios disponíveis:

- Desempenho individual;
- Desempenho coletivo;
- Evolução mensal;
- Avaliação por setor;
- Iniciativas;
- Qualidade operacional;
- Auditorias;
- Cobertura de avaliação;
- Reconhecimento e premiações.

Incluir gráficos, indicadores, critérios, evidências e justificativas.

Priorizar geração local dos relatórios, utilizando bibliotecas gratuitas compatíveis com o projeto.

## 24. Desempenho técnico e custos

Utilizar bibliotecas de gráficos gratuitas e de código aberto, preferencialmente as já existentes no projeto.

Evitar dependências desnecessárias.

Implementar:

- Carregamento sob demanda;
- Paginação;
- Consultas otimizadas;
- Índices adequados;
- Agregação eficiente de indicadores;
- Reaproveitamento de resultados quando apropriado;
- Processamento incremental;
- Compressão de evidências.

Não executar consultas completas do histórico sempre que um usuário abrir o aplicativo.

Não utilizar serviços de processamento pagos.

Não realizar upgrades de planos sem autorização.

## 25. Período de calibração

Manter inicialmente um período experimental de 30 dias.

Durante esse período:

- Calcular pontuações privadas;
- Testar indicadores;
- Verificar as fórmulas;
- Avaliar a cobertura dos setores;
- Identificar distorções;
- Ajustar pesos;
- Calibrar critérios;
- Validar a confiabilidade das evidências.

Não publicar rankings competitivos nem utilizar as avaliações para punições.

Permitir que a liderança altere os critérios antes da ativação oficial.

## 26. Testes obrigatórios

Validar os seguintes cenários:

- Colaborador atuando em diferentes setores;
- Colaborador com tarefas complexas;
- Colaborador com poucas atividades registradas;
- Colaborador com impedimentos comprovados;
- Colaborador com tarefas compartilhadas;
- Colaborador em férias;
- Auditorias insuficientes;
- Registro duplicado;
- Alteração manual de pontuação;
- Critério sem evidências;
- Nota máxima;
- Nota zero justificada;
- Alteração de pesos;
- Fechamento de período;
- Exportação de relatórios;
- Acessos não autorizados.

Verificar se todos os gráficos apresentam os mesmos valores calculados pelo motor de avaliação.

Realizar testes de regressão nas funcionalidades atuais do WMS.

## 27. Entrega final

Apresentar:

- Funcionalidades implementadas;
- Fórmulas utilizadas;
- Indicadores efetivamente disponíveis;
- Gráficos implementados;
- Dados reaproveitados do WMS;
- Critérios que dependem de validação humana;
- Testes realizados;
- Limitações identificadas;
- Impacto no consumo de infraestrutura;
- Procedimento de reversão;
- Prévia funcional;
- Recomendações para calibração.

Não declarar que a implementação está completa sem comprovação por testes.

A prioridade é entregar uma ferramenta de avaliação justa, transparente, automatizada, configurável e sustentável, sem gerar custos adicionais ou prejudicar as operações existentes.