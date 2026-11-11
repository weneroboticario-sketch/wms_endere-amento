# Consulta de SKU por fotografia

Recurso exclusivo do botão de câmera da Consulta de SKU. Não adiciona menu ou tela de Leitura por Foto, nem modifica a Central de Revistas. A consulta manual e o scanner continuam usando o fluxo existente.

## Fluxo

- Câmera aberta somente após ação do usuário, ou imagem JPG/PNG/WEBP da galeria (até 15 MB).
- Prévia, recorte, zoom, nova captura e correção manual.
- BarcodeDetector, quando disponível, seguido de ZXing em worker; Tesseract local reconhece os códigos impressos. Não há API paga ou envio da imagem ao servidor.
- Candidatos são validados pela RPC de leitura `lookup_wms_sku_photo`. Um produto válido inicia `renderSkuSearch`; múltiplos produtos exigem escolha. Falhas de validação impedem a escolha automática.
- Preserva zeros, rejeita check digits GTIN inválidos e não converte EAN em SKU por corte de dígitos. Lote, validade, preços e volumes não são promovidos a SKU.
- Fechar, sair ou trocar usuário/estoque/tela encerra a câmera e os workers e descarta a imagem. Não há persistência de fotografias.

## Banco e permissões

Migration proposta: `20261111123430_wms_sku_photo_lookup.sql`. Não foi aplicada em produção durante a implementação.

A RPC exige autenticação, perfil ativo, acesso ao estoque e papel ADMINISTRADOR, SUPERVISOR, OPERADOR, ATENDENTE ou CAIXA. Retorna apenas SKU e descrição; não altera saldos, endereços, transferências ou políticas RLS.

O cadastro atual de produtos não tem EAN. O vínculo confiável utilizado é `internal_sku` confirmado em itens de recebimentos finalizados do mesmo estoque. Sugestões automáticas, itens extras e recebimentos em andamento/cancelados não são usados como mapeamento. Na inspeção inicial não havia EANs utilizáveis; nesses casos o operador verá “EAN/GTIN sem vínculo confirmado” e poderá ler/digitar o SKU impresso. Nenhum mapeamento fictício foi inserido.

## Validação

- Testes de domínio: códigos impressos, ruído de lote/validade/volume, zeros, múltiplos candidatos, desconhecidos, check digit, falhas e troca de contexto.
- Teste da migration em PGlite: papéis, estoque, autenticação, mapeamentos confirmados e ausência de mutações.
- Testes do engine: prioridade nativa, fallback, OCR e cancelamento durante inicialização.
- Fixture isolada `tests/sku-photo-visual.html`: imagens e catálogo sintéticos; não acessa produção. Validado OCR real com zero inicial, dois SKUs, barras CODE128 sem texto legível, foto desfocada, código inexistente, permissão recusada e troca VDCG/VDAR. Layout inspecionado em 390 × 844.
- Captura com câmera física e etiquetas reais ainda precisa de teste no dispositivo do colaborador; a recusa de permissão foi simulada.

Antes da publicação: aplicar a migration autorizada, publicar somente o projeto WMS e testar com usuários reais de cada papel. O header permite câmera somente na própria origem; microfone permanece desabilitado. Não alterar CP Álamo. Para reverter a interface, restaurar o commit anterior do WMS; a RPC aditiva de leitura pode permanecer sem consumidores até uma remoção planejada.
