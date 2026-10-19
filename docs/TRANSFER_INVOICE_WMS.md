# NF das transferencias

Em Transferencias > Finalizadas, administradores e supervisores podem usar
Registrar NF, selecionar o XML e confirmar a conclusao fiscal. O numero e a
chave sao extraidos do documento, sem digitacao manual. Quando o destinatario
da transferencia tem CNPJ cadastrado, o XML deve corresponder a ele.

O registro e a alteracao para FINALIZADA sao atomicos. Quantidades, tempos e
divergencias da operacao sao preservados. Cada transferencia aceita uma NF;
apos registrada, nao pode ser reaberta nem excluida pelo fluxo comum.

O XML original fica em wms_transfer_invoices, separado da listagem de
transferencias e protegido por RLS por estoque. A listagem busca apenas os
metadados. O conteudo e consultado somente para baixar o XML. Sem bucket ou
link publico. Autor, data e status anterior ficam registrados no documento.

Validacao: testes Node, scripts/verify-transfer-invoice.mjs com CSP real,
teste transacional revertido no banco para extracao de numero, conclusao,
duplicidade e bloqueio de reabertura. Nenhuma NF de teste foi persistida.
