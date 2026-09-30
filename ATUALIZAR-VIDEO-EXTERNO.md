# Documento da versão 1.1

Para a versão atual, siga **ATUALIZAR-PROVEDORES.md**. A lista de domínios fixos e as instruções de edição manual abaixo foram substituídas pelo painel Admin → Provedores.

# ACERVO 1.1 — Vídeo externo

## Atualização no Windows sem recriar o acervo

1. Faça backup dos dados existentes. Não use `docker compose down -v`.
2. Extraia o ZIP em uma pasta temporária. Não execute setup.mjs novamente.
3. Na pasta ORIGINAL onde seu Docker Compose já roda, substitua somente os arquivos listados abaixo pelos arquivos de mesmo caminho do ZIP. Crie os novos arquivos quando necessário. Preserve seu `.env`, compose.yml, compose.override.yml, senhas e volumes. Se você alterou algum arquivo listado, compare as versões antes de substituí-lo.
4. Espere os uploads/processamentos em andamento terminarem e execute estes comandos, um por vez, no PowerShell da pasta ORIGINAL (onde está compose.yml):

```powershell
docker compose -f compose.yml stop web api worker
docker compose -f compose.yml build api worker init web
docker compose -f compose.yml run --rm --no-deps init
docker compose -f compose.yml up -d
docker compose -f compose.yml restart web
```

Só prossiga após cada comando terminar com sucesso. O banco deve continuar rodando durante a atualização. A migration adiciona colunas à tabela existente, sem apagar vídeos, usuários ou categorias. O serviço init preserva a senha do administrador existente. Se init falhar, envie o erro antes de continuar.

O ngrok pode continuar aberto. A URL APP_ORIGIN e COOKIE_SECURE já configuradas no seu .env não devem ser alteradas por esta atualização. Não altere o nome da pasta original ou o nome do projeto Compose.

## Arquivos novos

- backend/migrations/002_external_videos.sql — tipo e URL no PostgreSQL, com restrições de integridade.
- backend/src/external.js — validação da URL e lista de origens autorizadas.
- frontend/src/components/ExternalPlayer.jsx — iframe responsivo, abertura explícita e aviso sobre progresso.
- frontend/public/placeholder-video.svg — capa padrão para externos sem thumbnail.

## Arquivos alterados

- backend/src/routes/videos.js — criação multipart de externos, edição da URL e duração, publicação imediata, thumbnail opcional.
- backend/src/catalog.js — DTO com sourceType/externalUrl; externos não recebem URLs HLS/MP4 locais.
- backend/src/routes/library.js — recusa progresso fictício para externos; favoritos preservados.
- frontend/src/pages/Admin.jsx — seletor de tipo, campos externos e edição.
- frontend/src/pages/Video.jsx — escolha de player e duração não informada.
- frontend/src/components/VideoCard.jsx — indicador Externo quando não há duração.
- frontend/src/components/Hero.jsx — indicação de vídeo externo sem duração.
- frontend/src/index.css — layout responsivo do player externo.
- frontend/nginx.conf — frame-src com origens específicas, mantendo demais proteções.
- backend/test/integration.test.js — cobertura de externos, URLs inválidas e permissões.
- backend/test/browser.mjs — cadastro/edição e iframe simulado com CSP no navegador.
- README.md — documentação da atualização.

## Como cadastrar e testar

1. Acesse /admin/upload pelo endereço que já usa para fazer login.
2. Em Tipo de vídeo, selecione Vídeo externo.
3. Preencha título, categoria e URL de incorporação. Descrição, duração em segundos e thumbnail são opcionais.
4. Cole APENAS o conteúdo de src do iframe, começando por https://. Não cole HTML. Se o src começar por //, adicione https: no início; converta &amp; do HTML em & na URL.
5. Marque Publicar agora e clique Cadastrar vídeo externo.
6. Abra a Home, selecione o card e clique Carregar vídeo externo.
7. Teste Editar para trocar a URL, despublicar e publicar, adicionar aos favoritos e trocar a thumbnail.
8. Confirme que seus uploads antigos continuam reproduzindo normalmente.

Origens e formatos autorizados nesta entrega:

- https://www.youtube.com/embed/ID
- https://www.youtube-nocookie.com/embed/ID
- https://player.vimeo.com/video/ID_NUMERICO
- https://redecanais.af/player3/server.php?... (URL src fornecida pelo provedor)

URLs de páginas comuns do YouTube, links encurtados e código iframe completo não são aceitos. Para outro provedor, adicione sua origem e regra de caminho em backend/src/external.js e sua origem em frame-src do frontend/nginx.conf, revise a compatibilidade e reconstrua os serviços. Não use curingas globais.

O tipo fica fixo depois do cadastro para preservar arquivos e histórico. É possível editar a URL de um externo. Para trocar de upload para externo ou vice-versa, crie um novo cadastro.

## Comportamento e limites

Vídeos externos ficam prontos imediatamente; não são baixados, processados pelo FFmpeg nem enviados ao seu storage. Apenas a thumbnail enviada é armazenada localmente ou no S3/R2 configurado. Sem thumbnail, usamos capa padrão.

O iframe só é carregado após o clique. A sandbox permite scripts, origem do provedor, apresentação e recursos de reprodução, mas restringe redirecionamento da página principal e popups. Não há remoção de anúncios. Alguns provedores podem recusar embeds, exigir permissões adicionais ou restringir o domínio de origem. A aceitação da URL não garante que o conteúdo será reproduzido.

Favoritos funcionam. Progresso/Continuar assistindo não são registrados para externos porque não existe integração com as APIs dos provedores. Visualizações representam o clique para abrir o player, deduplicado por usuário/dia, não reprodução comprovada. Despublicar protege o cadastro dentro do ACERVO, mas não revoga acesso à URL pública no provedor.

## API

POST /api/videos continua aceitando multipart/form-data. Externo usa title, description, categoryId, published (true/false), sourceType=external, externalUrl, duration (opcional, segundos) e thumbnail (opcional). Não envie o campo de arquivo video. Resposta 201 com id e status=ready. Upload comum mantém resposta 202 e processamento em fila.

PUT /api/videos/:id aceita JSON com title, description, categoryId, published e, apenas para externos, externalUrl/duration opcionais. Omitir URL/duração preserva seus valores. Somente administradores podem criar ou alterar vídeos. Autenticação e CSRF permanecem obrigatórios.

## Verificação executada

18 testes de backend aprovados com PostgreSQL embutido PGlite e FFmpeg real; build e lint do frontend. Teste de navegador inclui upload/HLS existentes e criação/edição de externo em viewport móvel, com resposta do iframe simulada e a CSP do Nginx aplicada. Isso valida a integração, não a disponibilidade do provedor real. Docker Desktop, PostgreSQL via TCP e reprodução no provedor real devem ser verificados na sua máquina.

Commit sugerido: feat: adiciona cadastro e reprodução de vídeos externos
