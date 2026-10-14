# Acesso COMPRAS a todas as lojas

Regra aprovada: consultar todas as lojas ativas, criar transferencias entre elas
e acompanhar o fluxo de NF. Aplica-se ao perfil COMPRAS inteiro no CP Alamo,
incluindo usuarios atuais e futuros, sem editar cada cadastro individualmente.

O escopo vem do cadastro confiavel em wms_users, vinculado a auth.uid(), ativo e
nao arquivado. A consulta de autorizacao privada existente permanece com as
mesmas regras dos demais perfis. A nova ramificacao COMPRAS inclui as unidades
operacionais ativas do cadastro; exclui DOURADOS, que e controle administrativo,
e unidades inativas. Nova loja ativa entra automaticamente no escopo.

Frontend usa o mesmo conjunto nos seletores de estoque, origem, destino e nos
contextos de Compras/NF, transferencias e expedicao. Estoque padrao do cadastro
continua como unidade inicial; nenhuma senha ou vinculo de autenticacao mudou.

Nao concede privilegios de ADMINISTRADOR. Separacao, conferencia, atualizacao
fisica de saldos, importacao e despacho continuam sujeitos aos bloqueios de
perfil existentes. Direitos ja concedidos a COMPRAS, incluindo NF e Logistica
Reversa, passam a usar o escopo de lojas ativas; nao ha nova permissao de acao.

Foi corrigida a politica de INSERT de itens que aceitava somente ATRIBUIDA.
Agora tambem aceita PENDENTE, antes da delegacao, exclusivamente na transferencia
do proprio criador, mesma unidade, origem COMPRAS, NF obrigatoria e etapa fiscal
inicial. Quantidades fisicas devem ser zero e quantidade solicitada positiva.
Nao permite inserir itens em transferencia de outro usuario ou depois da NF.

## Verificacao

Testes locais cobrem seletor global de COMPRAS, manutencao do escopo dos outros
perfis, exclusao de inativos/controle, usuarios inativos/arquivados, atualizacao
automatica para nova loja, migracao repetida e criacao em outra unidade.

O teste de INSERT reproduz a falha com a politica antiga, comprova rollback da
criacao parcial e verifica o sucesso sem responsavel apos a correcao. Tambem
verifica rejeicao de itens de outro criador e bloqueio de alteracao de saldo.

No banco real, login teste: 23 lojas visiveis, transferencia 22796 -> 23696 sem
responsavel obrigatorio, retry idempotente, saldo inalterado e lista de atencao
com 23 unidades. Todo o teste foi executado em transacao desfeita, sem deixar
solicitacao ou notificacao de verificacao. Escopo exclusivo CP Alamo; nao aplicar
as migracoes ao WMS Enderecamento.
