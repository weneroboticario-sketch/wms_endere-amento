# Visual e visao administrativa do Enderecamento

Aplicacao: wms-endere-amento.vercel.app. Banco: bzqulgdtfpcmkyaldssy.

- Reutiliza CSS visual aprovado no CP Alamo: tipografia, contraste, controles e responsividade.
- Adiciona Administracao > Visao Geral para administradores ativos.
- Administradores globais consultam todos os estoques ativos; demais administradores somente seus estoques autorizados. RLS continua sendo a barreira de autorizacao.
- Contagens exatas no servidor: registros CAPTACAO e Loja, posicoes CAPTACAO com saldo e sem endereco, transferencias abertas.
- Historico limitado a 20 importacoes por estoque e 30 no painel, ordenado por data.
- Ultima CAPTACAO consultada separadamente para evitar confundir importacao Loja com atualizacao CAPTACAO.
- Falhas de consulta aparecem como indisponiveis, sem transformar erros em zeros.
- Nenhuma migracao, alteracao de permissoes ou gravacao operacional.

Validacao: 109 testes, lint e build; navegador em 1440, 1366, 768 e 390 pixels com dados de teste, filtro, atualizacao e navegacao; leitura SQL com papel authenticated do administrador e rollback nos quatro estoques. Nao foi submetida importacao ou transferencia real durante esta alteracao.

Backup anterior: outputs/WMS-antes-visao-administrativa-2026-10-15.zip, fora do repositorio.
