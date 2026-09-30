# ACERVO 1.2 — Troca centralizada de domínio

## O que mudou

Em /admin/providers, o administrador altera o domínio HTTPS de um provedor uma única vez. A API monta os links de todos os seus vídeos usando esse domínio, sem mudar os identificadores ou executar atualizações em massa no catálogo. Não é necessário rebuild ou reiniciar containers a cada futura mudança de domínio.

O novo domínio é informado e confirmado pelo administrador. O sistema não descobre domínios, não segue redirecionamentos automaticamente e não verifica a propriedade do endereço. Não foi implementado importador de filmes nem nova hospedagem nesta entrega.

Provedores iniciais: RedeCanais (https://redecanais.press, conforme o domínio informado pelo usuário), YouTube, YouTube com privacidade e Vimeo. A URL informada não é uma certificação da disponibilidade do serviço externo.

## Atualizar sua instalação Windows

Faça uma cópia do seu projeto e backup do banco antes. Não use down -v nem execute setup.mjs novamente. Espere uploads e processamentos em andamento terminarem.

1. Extraia este ZIP em uma pasta temporária.
2. Copie os arquivos novos e alterados listados abaixo para os MESMOS caminhos da pasta ORIGINAL do seu projeto. Preserve .env, compose.yml, volumes e credenciais. Se você fez outras alterações nesses arquivos, compare antes de sobrescrever. A troca manual anterior .af → .press está contemplada, assim como a compatibilidade do iframe RedeCanais sem sandbox.
3. No PowerShell da pasta ORIGINAL onde está compose.yml, execute um comando por vez. Só avance se o anterior terminar sem erro:

```powershell
docker compose -f compose.yml stop web api worker
docker compose -f compose.yml build api worker init web
docker compose -f compose.yml run --rm --no-deps init
docker compose -f compose.yml up -d
docker compose -f compose.yml restart web
```

Mantenha o banco db ligado durante esses comandos. A migration 003 converte os links cadastrados de .af, .press, YouTube e Vimeo; preserva uploads, títulos, capas, usuários e favoritos. A URL original fica em legacy_external_url apenas como referência histórica. A fonte de reprodução passa a ser providers.base_url + videos.external_path.

Se houver links com domínios não reconhecidos na sua base, a migration interrompe e desfaz suas próprias alterações sem apagar esses links. Nesse caso, envie a mensagem de erro; não apague nem recrie o banco.

O .env permanece com a URL HTTPS do seu ngrok ou site atual. Você não precisa trocar APP_ORIGIN por um domínio do provedor: APP_ORIGIN é o endereço do ACERVO.

## Arquivos novos

- backend/migrations/003_providers.sql: tabelas providers, provider_origins, provider_changes, vínculo dos vídeos e conversão dos links existentes.
- backend/src/routes/providers.js: consulta, atualização com autenticação/CSRF, histórico e documento de reprodução.
- backend/test/provider-migration.test.js: preservação dos dados antigos e rollback atômico.
- frontend/src/pages/Providers.jsx: painel de domínio, quantidade de vídeos e histórico das últimas cinco alterações.
- ATUALIZAR-PROVEDORES.md: este guia.

## Arquivos alterados em relação à versão com Vídeo externo

- backend/src/external.js: validação HTTPS e resolução de provedor/aliases pelo banco.
- backend/src/catalog.js: geração da URL e referência do player dinâmico no DTO.
- backend/src/routes/videos.js: gravação e edição dos vínculos, mantendo multipart e upload.
- backend/src/app.js: registro das novas rotas.
- frontend/src/pages/Admin.jsx: nova aba Provedores e instrução no formulário.
- frontend/src/components/ExternalPlayer.jsx: usa documento de reprodução autenticado.
- frontend/src/index.css: layout do painel de provedores.
- frontend/nginx.conf: autoriza iframe local e delega a política dinâmica do player à API.
- backend/test/integration.test.js: domínio central, aliases, permissões, CSP, conflitos e reversão.
- backend/test/browser.mjs: troca de domínio no painel e reprodução simulada após a mudança.
- README.md e ATUALIZAR-VIDEO-EXTERNO.md: documentação atualizada.

## Uso no dia a dia

1. Acesse /admin/providers pelo endereço HTTPS do ACERVO.
2. Em RedeCanais, informe o novo domínio com https://, sem caminho, parâmetros ou porta. Exemplo ilustrativo: https://novo-dominio.example.
3. Confira a quantidade de vídeos afetados e clique Salvar domínio. Confirme apenas um endereço que você verificou pertencer ao provedor.
4. Reabra a página do vídeo. Players já abertos não são interrompidos automaticamente.
5. Para reverter, salve o domínio anterior no mesmo campo. O histórico mostra os últimos endereços.

Caminhos, parâmetros server/subfolder/vid e fragmentos são preservados. A solução cobre mudança de domínio, não alteração do formato da API, caminho do player ou IDs no provedor. Novos formatos de URL precisam de adaptação no conector.

Domínios antigos cadastrados viram aliases: ao colar um link antigo no formulário, a API identifica o mesmo provedor e gera o endereço atual. O navegador não acessa o domínio antigo para resolver esse link.

## Segurança e compatibilidade

Somente administradores podem consultar ou mudar provedores. A atualização exige cookie de sessão, CSRF e origem do ACERVO. URLs aceitam HTTPS, domínio sem credenciais, sem IP literal, sem porta não padrão e sem nomes locais. O backend não faz requisições a domínios informados. A troca fica registrada com usuário e horário; versões evitam sobrescrever uma alteração concorrente.

O Nginx mantém frame-src 'self' na aplicação. GET /api/players/:id retorna um documento autenticado com uma CSP que libera somente o domínio atual daquele provedor. Esse documento contém o iframe do serviço externo. A permissão acompanha imediatamente as próximas aberturas, sem curingas globais ou rebuild. X-Frame-Options SAMEORIGIN permite esse documento dentro do ACERVO; a aplicação principal continua protegida contra incorporação por outros sites.

RedeCanais permanece sem sandbox no iframe do provedor, preservando a compatibilidade solicitada e testada pelo usuário. Isso reduz as restrições de popups/redirecionamentos; não representa remoção de anúncios nem garantia da segurança do provedor. YouTube/Vimeo mantêm sandbox. Nenhum script de terceiro é executado na origem do ACERVO.

Favorecer, publicar, despublicar, editar thumbnail e uploads/HLS continuam disponíveis. Progresso de terceiros continua não sincronizado. Conteúdo real externo pode ter restrições do provedor, DRM, anúncios, cookies ou limitações do navegador da TV.

## Como conferir

- Abra /admin/providers e verifique a quantidade de vídeos de cada fonte.
- Abra um vídeo antigo: o link deve usar o domínio central atual.
- Ao trocar o domínio, confirme que outro vídeo do mesmo provedor também usa o novo endereço.
- Reabra o player; não basta voltar a uma aba com iframe já carregado.
- Teste um vídeo de upload para conferir que HLS continua normal.

Não use domínios fictícios no seu catálogo em uso. Os testes automatizados usam domínios .example interceptados pelo navegador, sem tráfego ao provedor.

## Testes desta entrega

Testes de integração executados com PGlite (PostgreSQL embutido) e FFmpeg real, incluindo permissões, mudança em vários vídeos, histórico, aliases, CSP e reversão. Testes específicos migraram dados antigos .af/.press e comprovaram rollback para domínio desconhecido. Build/lint do frontend e teste Chromium de cadastro, edição e troca de domínio com player externo simulado.

Não houve deploy remoto nem teste em TV física, Docker Desktop ou PostgreSQL via TCP neste ambiente. O iframe real do provedor deve ser testado na instalação do usuário.

Commit sugerido: feat: centraliza domínios de provedores e migra referências de vídeos
