# ACERVO 1.3 — Filmes e séries

> Guia histórico da classificação inicial. Para a versão atual com temporadas e episódios, consulte [ATUALIZAR-TEMPORADAS.md](ATUALIZAR-TEMPORADAS.md).

## Funcionalidade

Admin → Enviar vídeo e Editar vídeo agora possuem Tipo de conteúdo: Filme ou Série.
Origem do vídeo continua independente: Upload de arquivo ou Vídeo externo.
Os cards, a lista administrativa e a página do player exibem o tipo. Catálogo,
busca e Minha lista permitem filtrar Todos, Filmes ou Séries.

Esta versão classifica cada item com seu arquivo/link atual. Não cria temporadas,
episódios ou reprodução automática de episódios. Favoritos, histórico de uploads
e domínios centralizados continuam funcionando como antes.

## Atualizar no Windows sem apagar o acervo

Espere os processamentos terminarem. Faça backup do banco e dos arquivos de mídia
antes de aplicar a migration. Extraia o ZIP em uma pasta temporária e copie os
arquivos abaixo para os mesmos caminhos da pasta ORIGINAL do projeto.
Preserve .env, compose.yml, volumes e configurações locais de acesso externo,
Tailscale e APK. Compare arquivos se você fez alterações próprias.

Novos:
- backend/migrations/004_content_type.sql — coluna validada; itens existentes viram Filme.
- ATUALIZAR-FILMES-SERIES.md — este guia.

Alterados em relação à versão 1.2 (Provedores):
- backend/src/routes/videos.js — validação e gravação do tipo em criação/edição; filtro.
- backend/src/catalog.js — retorno contentType e consulta filtrada.
- backend/src/routes/library.js — filtro em favoritos/histórico.
- frontend/src/pages/Admin.jsx — seleção e identificação administrativa.
- frontend/src/pages/Catalog.jsx — filtros combináveis com busca/categoria.
- frontend/src/pages/Video.jsx — identificação no player.
- frontend/src/components/VideoCard.jsx — identificação nos cards.
- backend/test/integration.test.js — persistência, filtros, permissões e edição.
- backend/test/provider-migration.test.js — preservação dos registros na migration 004.
- backend/test/browser.mjs — cadastro e edição de Série no navegador.
- README.md — versão e instruções de atualização.

Se ainda não instalou a versão Provedores, aplique também os arquivos listados em
ATUALIZAR-PROVEDORES.md antes de executar os comandos. O init aplica migrations
pendentes em ordem. Não apague migrations anteriores.

Abra o PowerShell na pasta ORIGINAL onde está compose.yml. Se sua pasta continua
sendo a informada anteriormente:

```powershell
cd "C:\Users\Usuario\Documents\acervov2"
docker compose -f compose.yml stop web api worker
docker compose -f compose.yml build api worker init web
docker compose -f compose.yml run --rm --no-deps init
docker compose -f compose.yml up -d
docker compose -f compose.yml restart web
```

Execute um comando por vez; pare se houver erro. Mantenha db ligado. Não execute
down -v nem recrie o banco. O init mantém os dados e aplica a migration 004.
Atualize a página no navegador após subir os containers.

## Como testar

1. Abra Admin → Enviar vídeo e selecione Série em Tipo de conteúdo.
2. Escolha upload ou vídeo externo, preencha os dados e publique.
3. Abra Editar e confirme que Série continua selecionado após recarregar.
4. Abra Categorias e selecione Séries; o item publicado deve aparecer.
5. Selecione Filmes; esse item não deve aparecer.
6. Adicione à Minha lista e confira o mesmo filtro.
7. Edite um item antigo e altere Filme para Série se necessário.

## Contrato da API

POST /api/videos recebe contentType no multipart: movie ou series. Quando omitido,
usa movie para compatibilidade. PUT /api/videos/:id aceita o mesmo campo no JSON;
omitir preserva o valor atual, inclusive ao publicar/despublicar.
GET /api/videos, /api/search, /api/admin/videos, /api/favorites e /api/history
aceitam ?contentType=movie ou ?contentType=series. O DTO sempre retorna contentType.
Valores fora da enumeração são rejeitados na API e pelo CHECK do PostgreSQL.

Commit sugerido: feat: adiciona classificação e filtros de filmes e séries

## Verificação executada

21 testes de backend aprovados com PGlite e FFmpeg real. A verificação adicional
da migration 004 confirmou preservação dos registros/favoritos e rejeição de
tipos inválidos. Lint e build do frontend aprovados. Fluxo Chromium aprovado,
incluindo cadastro de Série externa e persistência da seleção na edição em
layout móvel. Player externo simulado; não houve teste em TV física ou deploy
na instalação Windows do usuário.
