# ACERVO · Plataforma pessoal de vídeos

React + Vite + Tailwind, Fastify, PostgreSQL, FFmpeg e HLS. Filmes, séries com temporadas e episódios, e domínios centralizados por provedor.

O catálogo fictício foi substituído pela API. A aplicação começa vazia e sem senha universal. O catálogo e os arquivos hospedados pelo ACERVO exigem autenticação. Vídeos externos seguem também as regras de acesso do provedor; sua URL pode ser acessada fora do ACERVO.

## Enviar filmes pelo navegador

A extensão **Enviar para ACERVO 2.1** captura nome/player e salva filmes ou episódios diretamente. Lembra categoria, série, temporada e publicação, com numeração automática no servidor e proteção contra duplicados. O fluxo de revisão no painel continua disponível. Consulte [atualização, conexão e uso](extension/README.md).

## Atualizar uma instalação existente

Leia [ATUALIZAR-TEMPORADAS.md](ATUALIZAR-TEMPORADAS.md) para instalar a estrutura de temporadas e episódios e organizar o acervo existente. Preserve seu `.env` e os volumes existentes.

## Iniciar com Docker

Pré-requisitos: Node.js 24 para o assistente, Docker Engine/Desktop e Docker Compose v2. PostgreSQL e FFmpeg já estão nos containers.

Extraia o ZIP em uma pasta nova, sem sobrescrever suas alterações. Considerando a extração em ~/Documents:

```bash
cd ~/Documents/acervo-completo
node --version
docker --version
docker compose version
node scripts/setup.mjs
docker compose up -d --build
```

O assistente pede nome/e-mail, cria .env e gera senhas aleatórias. **Guarde a senha inicial exibida.** Não envie nem publique o .env. Se ele já existir, será preservado.

Abra **http://localhost:8080** e entre com as credenciais geradas. Acesse **http://localhost:8080/admin**:

1. Crie uma categoria.
2. Envie seu vídeo, com título e descrição.
3. Marque a opção de publicar quando estiver pronto.
4. Aguarde o status Pronto · Publicado.
5. Volte à Home e assista.

O primeiro build pode demorar. Para conferir:

```bash
docker compose ps -a
docker compose logs --tail=100 init api worker web
```

O serviço init terminar com código 0 é normal: aplica migrations e cria o administrador. Um administrador existente nunca tem sua senha redefinida no bootstrap.

Para parar sem apagar dados:

```bash
docker compose down
```

**Não acrescente -v: isso remove os volumes com banco e vídeos.**

## Funcionalidades

| Área | Implementação |
| --- | --- |
| Catálogo | Home, recentes, mais assistidos, categorias, busca e paginação |
| Administração | Dashboard, upload, edição, exclusão, publicação, despublicação e thumbnail |
| Séries | Aba própria no admin, cadastro sem vídeo/link, temporada 1 automática, episódios por link/upload, vínculo de vídeos existentes e próximo episódio |
| Categorias | Criar, editar e excluir; proteção de categorias ainda usadas |
| Contas | Login, logout, perfil, troca de senha e criação de admin/espectador |
| Favoritos | Adicionar/remover e listar por usuário |
| Histórico | Progresso periódico, ao pausar/sair e retomada |
| Player | Play/pause, volume, tempo, progresso, tela cheia e qualidade |
| Processamento | Fila persistida, worker separado, status e reprocessamento |
| Streaming | HLS adaptativo até 1080p/720p/480p e MP4 de fallback |
| Armazenamento | Disco e adaptador S3/R2 privado, incluindo upload multipart |
| Operação | Docker, migrations, healthcheck, logs e testes |

Sem upscaling: as variantes respeitam a resolução original. Vídeos abaixo de 480p recebem uma variante menor. No Safari com HLS nativo, o navegador controla a qualidade; a seleção manual aparece quando hls.js está ativo.

Uma visualização é contada por usuário/vídeo/dia ao iniciar a reprodução. Assistir a 95% retira o vídeo de Continuar assistindo. A pergunta de retomada aparece a partir de 3 segundos.

## Estrutura

| Pasta | Função |
| --- | --- |
| frontend/src/pages | Home, catálogo, login, perfil, vídeo e admin |
| frontend/src/components | Header, cards, hero, player e feedback |
| frontend/src/context | Sessão de usuário |
| frontend/src/services/api.js | Cliente HTTP, CSRF e upload |
| backend/src/routes | API REST e validação |
| backend/src/security.js | Senhas, sessões e permissões |
| backend/src/storage.js | Disco, S3/R2 e Range |
| backend/src/media.js | ffprobe e FFmpeg |
| backend/src/worker.js | Fila e limpeza física |
| backend/migrations | Schema versionado |
| backend/scripts | Bootstrap e criação de administrador |
| backend/test | Integração, processamento e navegador |
| scripts/setup.mjs | Configuração inicial |
| docs | API, desenvolvimento, operação e verificações |
| ops | Exemplo de HTTPS |

PostgreSQL guarda referências e metadados, não bytes de vídeo. Tabelas: users, sessions, videos, categories, watch_history, favorites, video_views, media_gc e schema_migrations.

O upload salva o original temporariamente e cria uma tarefa queued. Um worker separado usa lock do PostgreSQL, processa o arquivo e só marca ready após salvar todas as saídas. No reinício, recupera tarefas processing. Falhas podem ser reprocessadas no admin.

Original, MP4, HLS e thumbnail são preservados. Planeje espaço para múltiplas cópias e temporários. A exclusão remove o registro imediatamente e coloca a mídia numa fila de limpeza; o worker precisa estar ativo. Não há lixeira: recuperação só por backup.

## Segurança

Sessões opacas e revogáveis, cookie HttpOnly, hash do token no banco e senhas com scrypt/salt. Nenhum token de autenticação fica no localStorage. SameSite=Strict, validação de origem e CSRF protegem alterações. Há limite de login, autorização no servidor, SQL parametrizado, validação de campos, limites de upload e recodificação de thumbnails.

No Compose, só a web é exposta, inicialmente em 127.0.0.1. Para internet, configure HTTPS, APP_ORIGIN e COOKIE_SECURE=true. Isso não substitui auditoria independente, atualizações e backups.

## Testar

Na pasta backend, com Node e FFmpeg instalados:

```bash
npm ci
npm test
```

Os testes usam PGlite (PostgreSQL em WebAssembly) temporário, ou um banco de teste indicado por TEST_DATABASE_URL. Produção usa PostgreSQL via pg; PGlite é somente desenvolvimento.

Teste de navegador:

```bash
cd ../frontend
npm ci
npm run build
cd ../backend
npx playwright install chromium
npm run test:browser
```

Resultados em backend/test-results, ignorado pelo Git. Veja docs/verificacao.md para os testes efetivamente executados nesta entrega.

## Documentação

- [Desenvolvimento sem Docker](docs/desenvolvimento.md)
- [API REST](docs/api.md)
- [Produção, S3/R2 e backups](docs/operacao.md)
- [Verificações e limitações](docs/verificacao.md)

S3/R2 está implementado, mas não foi conectado a um bucket real nesta entrega. São necessárias suas credenciais. A mídia passa pelo backend para verificar permissões: esta não é uma arquitetura de CDN para milhares de acessos. Há um worker de processamento por instalação.

Upload retomável, multi-worker distribuído, DRM, legendas e recuperação de senha por e-mail não fazem parte desta versão.

## Git

Na raiz, após testar:

```bash
git init
git add .
git status
git commit -m "feat: entrega plataforma Acervo full stack"
```

Não envie .env, mídias, backups, node_modules ou dist. Envie os lockfiles. Nenhum commit/push foi feito automaticamente.

Mantenha próximos commits pequenos: feat(api), fix(player), test(auth), docs.

Consulte CREDITS.md. ACERVO tem identidade própria e não é associado à Netflix.
