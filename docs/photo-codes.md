# Leitura por Foto — WMS Endereçamento

Tela independente, sem gravação operacional e sem migrations. A integração preparada usa OpenAI Responses com visão e JSON Schema estrito. O modelo é uma configuração explícita; não há resultados simulados no aplicativo. Fotos e resultados ficam em memória na aba, são descartados ao limpar/sair/trocar contexto e nunca enviados a tabelas, Storage ou logs pela aplicação.

## Configuração somente no servidor Vercel do WMS

- `OPENAI_API_KEY`: segredo da conta de API. Nunca usar prefixo VITE nem colocar no repositório.
- `OPENAI_VISION_MODEL`: identificador de modelo habilitado na conta que suporte imagens e Structured Outputs. Escolher/validar precisão e custo com fotos reais antes da publicação.
- `SUPABASE_ANON_KEY` ou `VITE_SUPABASE_ANON_KEY`: chave pública do WMS. JWT do usuário é validado por Auth; perfil ativo/não arquivado é conferido pelas permissões existentes. Não usa service role.
- `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`: quota distribuída atômica via REST EVAL, 20 fotos por usuário por hora. Só guarda contador com TTL, nunca imagens/códigos. Falha fechada se ausente/indisponível. Configurar orçamento/limites de gasto da conta de IA antes de habilitar.

Ausência de qualquer configuração do serviço deixa a leitura desabilitada com mensagem explícita e mantém a edição/exportação manual. Não foram criadas credenciais, contratados serviços ou alteradas variáveis de produção automaticamente.

## Fluxo e limites

Até 5 fotos por sessão; JPG/PNG/WEBP de até 12 MB cada. Deduplicação por SHA-256 do arquivo dentro da sessão. Original permanece na memória para ampliação; envio JPEG até 2800 px, qualidade 94%, no máximo ~2 MB binários. Não reduz novamente para forçar foto detalhada demais: solicita região menor. Uma chamada por foto pendente; repetir clique não reprocessa fotos concluídas. Sem retry automático. A mesma foto pode ser processada novamente somente ao removê-la/limpar sessão e adicioná-la novamente.

Cada imagem é uma solicitação independente. Não envia cadastro, resultados anteriores ou mapa descrição/código ao modelo. Prompt proíbe posições fixas, códigos inferidos, preços e confusão entre produtos/refis/combos. A região retornada é dinâmica por ocorrência e pode ser ampliada junto do original. Coordenadas do modelo são aproximadas, não evidência de certeza. Fotos inclinadas, sombras e texto pequeno dependem da qualidade real de visão; a interface não garante precisão.

Consulta atual exata ao `wms_products` sob RLS; CAIXA usa RPC existente `lookup_wms_caixa_item` (4–8 dígitos) no seu estoque. Erro de consulta ou código fora do suporte do RPC = Revisar, nunca Não encontrado por falha de rede/permissão. Código lido fica intacto mesmo quando não encontrado. Tipo indefinido e ambiguidade exigem revisão; alterações de código/tipo invalidam validação anterior. Quantidades sempre em branco até edição humana.

Exporta seleção revisada, inclusive Não encontrado explícito. CSV usa expressão constante de texto `="01314"`, somente para códigos compostos de dígitos, para conservar zeros ao abrir no Excel. Excel grava célula string com formato texto. Copiar mantém códigos literais. Nenhum texto arbitrário entra em fórmula. Remoção de duplicados exige confirmação e distingue tipos e zeros, conserva primeira quantidade sem somar.

## Validação antes de publicar

Testes de contrato cobrem parsing estrito, tipos, ambiguidades, regiões, exportações, autenticação/perfis, quota, falhas e ausência de configuração. Não substituem ensaio de precisão com serviço real. Validar fotos autorizadas de um/vários códigos, duas colunas, inclinação, fonte pequena, preços próximos, zeros, ilegíveis, repetidos, várias páginas e página sem códigos; medir código e descrição contra transcrição humana, inclusive diferenças entre ciclos. Esta validação real ainda depende da configuração e de fotos de catálogo fornecidas para ensaio. Não publicar automaticamente.

Documentação: [OpenAI visão](https://developers.openai.com/api/docs/guides/images-vision), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [Upstash REST](https://upstash.com/docs/redis/features/restapi).
