# Perfil Caixa

Preparado localmente; requer aprovação antes de atualizar banco, função de cadastro e aplicação em produção.

O Caixa pode solicitar produtos pelo SKU e quantidade, marcar atendimento ao cliente, solicitar verificação de ajuste com motivo e acompanhar somente seus pedidos e histórico no estoque autorizado. Não recebe tarefas operacionais, não vê a base de estoque, não atende, aprova ou exclui pedidos e não altera saldos.

Produtos entram na fila de reposição existente. O saldo da loja permanece desconhecido (NULL), sem fabricar saldo zero. Quantidade efetivamente atendida pode superar a solicitada. Ajustes aguardam supervisão, que encaminha uma tarefa avulsa de verificação. Não existe movimento automático de estoque.

A tela oferece atualização manual e os 100 pedidos mais recentes. Tentativas repetidas preservam a chave da solicitação quando a resposta de envio é incerta, evitando duplicidade. A segurança é validada no banco por usuário e estoque, além das permissões de tela.

## Aplicação após aprovação

1. Aplicar `supabase/proposals/caixa_profile.sql` como migração somente no WMS Endereçamento (`bzqulgdtfpcmkyaldssy`) e salvar a migração com o identificador retornado.
2. Atualizar a função `manage-wms-user` nesse projeto.
3. Publicar o frontend somente no projeto WMS Endereçamento. Não mesclar em main nem alterar CP Álamo/Dourados.
4. Cadastrar ou editar colaboradores selecionando CAIXA e seus estoques autorizados. Nenhum usuário real foi criado nos testes.

Testes locais usam PGlite com dados fictícios e exercitam propriedade dos pedidos, negação de leitura operacional, negação de alteração do próprio perfil, isolamento de estoque, reenvio idempotente, encaminhamento restrito à supervisão e acompanhamento de conclusão.
