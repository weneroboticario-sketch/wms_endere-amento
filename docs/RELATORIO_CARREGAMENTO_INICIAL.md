# Relatorio de carregamento inicial do WMS

## Objetivo

Revisar o fluxo de abertura do WMS para reduzir carregamento antes do login, preservar a seguranca visual da interface e manter o isolamento por estoque.

## Antes da correcao

- `initAuth()` buscava estoques, usuarios e solicitacoes de acesso assim que a pagina abria.
- `enterAuthenticatedApp()` carregava enderecamento, transferencias e conferencias logo apos o login.
- O polling de tarefas recarregava transferencias e conferencias mesmo quando essas telas ainda nao tinham sido abertas.
- Ao trocar o estoque ativo, o sistema carregava enderecamento, transferencias e conferencias juntos.
- A tela interna ja era ocultada por CSS antes do login, mas nao ficava marcada como inerte para leitores de tela e navegacao por foco.

## Depois da correcao

- Antes do login, o app mantem apenas login, solicitacao de acesso e recuperacao de senha visiveis.
- Sem sessao salva, `initAuth()` nao busca usuarios, enderecamentos, transferencias, conferencias ou historico.
- Com sessao salva, o sistema busca somente o minimo necessario para validar a sessao: estoques e usuarios.
- A area interna fica inerte e com `aria-hidden` enquanto o usuario nao estiver autenticado.
- Apos login, o sistema carrega somente o enderecamento base usado pela tela inicial permitida.
- Transferencias sao carregadas apenas quando a tela Transferencias e aberta.
- Conferencias sao carregadas apenas quando a tela Conferencias e aberta.
- Usuarios e solicitacoes sao carregados apenas quando a tela Usuarios e aberta por perfil autorizado.
- Estoques sao carregados sob demanda quando a tela Estoques e aberta.
- Assistente WMS so marca o modulo como ativo quando a tela Assistente e aberta.
- Ao trocar estoque, o estado dos modulos do estoque anterior e invalidado antes de carregar o novo estoque ativo.

## Consultas removidas do carregamento inicial

- `wms_access_requests` nao e mais consultada na abertura publica da pagina.
- `wms_bindings`, `wms_history` e `wms_products` nao sao consultadas antes da autenticacao.
- `wms_transfers`, `wms_transfer_items`, `wms_transfer_events` e embalagens nao sao consultadas no login.
- `wms_conferences`, `wms_conference_items` e `wms_conference_events` nao sao consultadas no login.

## Modulos sob demanda

- Transferencias
- Conferencias
- Usuarios
- Estoques
- Manutencao
- Configuracoes
- Assistente WMS
- Importacao Excel
- Exportacao Excel
- Historico e relatorios

## Multiestoque

- A troca de estoque limpa os modulos carregados para evitar reaproveitamento de dados do estoque anterior.
- Usuarios comuns continuam limitados aos estoques permitidos.
- Admin geral continua podendo alternar o estoque ativo, mas cada consulta usa o estoque ativo.

## Ganho esperado

- Login abre mais rapido porque nao faz consultas operacionais antes da autenticacao.
- Celular sofre menos com renderizacoes e tabelas grandes carregadas cedo demais.
- Transferencias e conferencias deixam de pesar na primeira entrada do usuario.
- Menor risco de dados internos aparecerem ou ficarem navegaveis antes do login.

## Riscos encontrados

- O app ainda usa um `script.js` monolitico grande. O build separa Supabase em chunk proprio, mas o modulo principal ainda passa de 500 kB minificado.
- Para reduzir ainda mais o bundle inicial sera necessario separar fisicamente Transferencias, Conferencias, Usuarios, Manutencao e Assistente em arquivos com `import()` dinamico.
- A refatoracao atual priorizou seguranca de dados, carregamento sob demanda e baixo risco operacional.

## Validacao

- Build de producao executado com sucesso usando `npm run build`.
- O aviso restante do Vite e de tamanho de chunk, nao de erro de compilacao.
