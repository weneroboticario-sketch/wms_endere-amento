# Logística de Excelência — primeira vertical, 18/11/2026

## Estado e Git

Implementação integrada à navegação do WMS, isolada na branch `feat/wms-logistica-excelencia-foundation-20261118`, enviada e confirmada no GitHub. Código da preview: `2c9d98bd1ab044c69da2e4289da4656daa7d6c08`. Sem merge em main. Este relatório substitui os estados provisórios dos documentos anteriores.

**NÃO PUBLICADO EM PRODUÇÃO.** Nenhuma migration foi aplicada ao projeto `bzqulgdtfpcmkyaldssy`; nenhum saldo, endereço ou transferência operacional foi modificado.

## Banco e permissões

Migration canônica: `supabase/migrations/20261118202204_wms_excellence_foundation.sql`. Consolida as propostas anteriores, preservadas pelo Git. Dez tabelas isoladas: versões, critérios, ciclos, evidências, notas assistidas, iniciativas, avaliações congeladas, calibrações, premiações e auditoria. RLS em todas. Escritas por RPC protegido; usuário comum vê seus registros, liderança vê somente unidades autorizadas. Revisão independente, vedação de autoavaliação assistida e auditoria imutável.

CLI oficial utilizado para criar a migration. Docker e WSL indisponíveis neste Windows: PostgreSQL local validado com PGlite, autenticação simulada nos testes. Isso **não equivale** à homologação do Supabase Auth/Storage real.

## Reposição, avaliação e auditoria

Fonte própria de reposição, atribuição por ID interno do responsável, nunca por solicitante/nome. Eventos distinguem conclusão total, parcial, sem estoque, atribuição e devolução. Parcial e sem estoque não geram penalidade automática. Ingestão paginada e idempotente, com limites explícitos.

Execução é uma taxa de conclusão entre oportunidades verificáveis, não pontos por quantidade movimentada. Autoria ambígua e dados insuficientes ficam N/D. Critérios/versionamento, composição automática e assistida, revisão justificada com evidências, iniciativas validadas por outra pessoa e calibração registrada. Fechamento exige cobertura e revisão consistentes, preserva snapshots imutáveis e usa chave privilegiada somente no servidor para a escrita final.

O endpoint `api/excellence-evaluation.js` valida o JWT e calcula no backend. `LOGISTICA_EXCELENCIA_ENABLED=true` é necessário; fechamento requer configuração segura de `SUPABASE_SERVICE_ROLE_KEY`, nunca entregue ao navegador. Esses ajustes não foram ativados em produção.

## Interface

Navegação do WMS carrega o módulo sob demanda. Visões pessoal e da equipe, critérios, composição, evidências com origem somente leitura, iniciativas, avaliação assistida e calibração. Consulta da equipe agrupada, evitando uma requisição por pessoa. Origem de reposição mostra SKU, quantidades, situação, duração e identificador. Algumas entradas administrativas ainda usam prompts nativos.

## Validação

- 448 testes aprovados; zero falhas, ignorados ou cancelados. Incluem 431 testes anteriores e 17 testes do diretório excellence; cenários RLS integram essa contagem, não são somados novamente.
- ESLint aprovado. Build local com demonstração e build remoto Vercel aprovados.
- Testes de autoria, isolamento, replay, parcial/sem estoque, iniciativa independente, cálculo relativo, paginação/revisão e fechamento congelado.
- Navegador local em desktop, 390 × 844 e 768 × 1024. Sem teste em aparelho Android físico.

## Preview remota

Projeto existente: `wms-endere-amento` / `prj_HTVBYmk1nVKClLoAQt5WnrQEd85s`.
Deployment: `dpl_G2c1WXG3bUjeykdm9g3pN2w82hd2`; estado **READY**, target preview, commit informado acima.

https://wms-endere-amento-kodon3tt5-wms10.vercel.app/tests/excellence/demo.html

Verificado remotamente: inicialização do PostgreSQL no navegador, simulação de reposição SKU 88082, geração da evidência, execução 25/25 com demais critérios ainda N/D e abertura da origem com 5 unidades e 8min32s. A página informa claramente que são dados sintéticos descartáveis. Recarregar limpa o banco. Não consulta nem escreve no Supabase de produção. Cálculo no navegador nessa demonstração serve apenas à validação visual; não é avaliação oficial nem prova da autenticação real. O aplicativo principal usa o endpoint protegido acima.

Nenhum projeto pago, upgrade ou serviço adicional contratado. O build de demonstração é habilitado por variável somente nessa preview; o build padrão não inclui seu banco WASM. Consumo de preview usa a infraestrutura existente e não significa garantia de franquia ilimitada.

## Pendências reais para ativação operacional

Validar Auth/RLS e formatos das fontes com usuários reais no projeto existente, revisar consumo/capacidade e plano de recuperação, autorizar a migration e ativação, configurar variáveis seguras e ciclo, executar piloto controlado antes de avaliar colaboradores. A preview não substitui essas etapas. Recursos amplos de PDI, premiação, relatórios e outras fontes não são declarados concluídos por esta primeira vertical.
