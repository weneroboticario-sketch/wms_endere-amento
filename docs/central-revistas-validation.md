# Central de Revistas — validação local

Base: c16087e998b8145c33345dd22e73442fb9df0106. Branch: feat/wms-central-revistas-20261109.

## Cadastro e publicação

O cadastro inicial aceita somente PDF e não exige ciclo, marca ou datas. O arquivo fica em rascunho. A publicação para consulta exige os metadados e a revisão das páginas; publicação parcial tem aviso explícito. A capacidade do ciclo é configurável, com padrão de três revistas. Não há associação permanente entre descrição e código de outra edição.

PDF.js lê o texto; Tesseract local em português atende páginas digitalizadas. Workers, modelo e fontes são servidos pelo próprio aplicativo. Não são usadas APIs de IA. A extração contextual é heurística e pode omitir ou associar incorretamente descrições: a revisão contra a página original é obrigatória para publicação integral. Não há promessa de reconhecimento universal.

## Arquivos principais

- `src/magazines-{domain,api,stock,pdf,view,loader}.js` e `src/magazines.css`: módulo isolado, consulta atual de saldos, processamento e revisão por página.
- `script.js`, `index.html`: entrada de navegação e adaptação às permissões e funções existentes.
- `scripts/prepare-magazine-assets.mjs`, `public/magazine-ocr-bootstrap.js`, `src/utils.js`, `vercel.json`: recursos locais e compatibilidade com CSP/Trusted Types.
- `supabase/migrations/20261109184545_wms_magazine_center.sql`: proposta de tabelas, RPC, auditoria, isolamento por estoque e bucket privado. Não aplicada remotamente.
- `tests/magazines-*`: regras, banco local, idempotência, saldos e demonstração sintética.

## Evidências de 09/11/2026

- Suíte completa: 347 testes aprovados, zero falhas.
- Dois testes adicionais de consulta de saldos aprovados após a suíte: paginação, atualização, zeros à esquerda, estoque, pendências, ausência de informação e erro explícito. Total validado: 349 testes.
- Lint aprovado após correção das referências globais no demonstrador.
- Build aprovado, com aviso de tamanho de chunks do Vite.
- Navegador local sob CSP: cadastro sem ciclo, PDF de texto processado, PDF digitalizado processado pelo OCR, sem erros de console observados.
- Banco local PGlite: rascunho, acesso privado, revisão, mapeamento, publicação parcial, versões, idempotência e restrições de escrita exercitados.

## Pendências antes da liberação operacional

- O usuário ainda enviará as revistas e os ciclos de 2026/2027. Não foram testadas três revistas reais; precisão contextual, layout e cobertura real permanecem pendentes.
- Validar o fluxo completo e a responsividade com arquivos reais e sessões autenticadas em homologação. O demonstrador usa dados sintéticos e não comprova integração remota.
- Confirmar capacidade contratada de Storage; os limites conservadores do módulo (25 MB/PDF, 500 páginas, 200 MB total, 100 mil ocorrências) não comprovam a cota disponível.
- Revisar/aplicar migration e testar Storage/RLS em ambiente autorizado antes da publicação. Não houve alteração no Supabase de produção nem deploy desta tarefa.

O demonstrador pode ser aberto no servidor de desenvolvimento em `/tests/magazines-visual.html`. Não contém dados reais nem acessa o Supabase.
