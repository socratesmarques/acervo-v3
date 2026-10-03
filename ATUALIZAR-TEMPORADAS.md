# Temporadas e episódios

## Como usar

1. Em **Admin → Séries → Nova série**, preencha nome, descrição, categoria e capa opcional. Clique **Criar série**. Não há campo de vídeo ou link.
2. A opção **Criar temporada 1 automaticamente** vem marcada. Você já entra no gerenciamento de temporadas e episódios. Para alterar os dados da série, abra **Editar nome, descrição, categoria e capa**.
3. Selecione a temporada e clique **Adicionar episódio**. Preencha número, título e o link de incorporação ou envie um arquivo. Cada episódio possui publicação e thumbnail próprias.
4. Repita para os demais episódios e temporadas. Os números determinam a ordem; não é possível repetir um número na mesma temporada.
5. No catálogo, abra a série, selecione a temporada e clique no episódio. **Próximo episódio** segue a ordem numérica, inclusive para a temporada seguinte.

A série e o episódio precisam estar publicados; arquivos enviados precisam terminar o processamento. O administrador pode pré-visualizar rascunhos. Temporadas sem episódios disponíveis ficam ocultas para espectadores.

**Vídeos existentes:** use **Vincular vídeo já cadastrado**, na edição da série, e cole o link do vídeo no ACERVO ou seu ID. O vídeo vira episódio preservando URL/arquivo, publicação, favoritos e histórico. Também funciona com rascunhos capturados pela extensão **Enviar para ACERVO**: importe como Filme e depois vincule. URLs de provedores entram em **Adicionar episódio**, não no campo de vínculo.

**Mover / renumerar** permite mudar um episódio para outra temporada da mesma série ou corrigir seu número. Para vincular a outra série, abra a série de destino e use o link do episódio no formulário de vínculo.

Séries antigas aparecem na nova aba com o mesmo ID, temporadas e episódios. Seus arquivos e links originais são preservados no banco, mas o player avulso não aparece mais na página da série. Nenhum vídeo é convertido automaticamente em episódio. Os episódios continuam tendo seus próprios players.

## Atualizar no Windows

Use a pasta existente, com seu `.env`, `compose.yml` e volumes atuais. Após incorporar a alteração no GitHub:

```powershell
cd C:\Users\Usuario\Documents\acervo-novo
git pull --ff-only
```

Se estiver na branch da correção de TV e suas alterações locais já estiverem salvas, primeiro volte à branch principal com `git switch main`. Se a pasta veio de ZIP, atualize os arquivos pela nova versão, preservando configurações locais e as migrations anteriores.

A migration `005_series_episodes.sql` acrescenta a estrutura e preserva filmes, séries, URLs, arquivos, favoritos e histórico existentes. Antes de atualizar, aguarde os processamentos e faça backup dos volumes. Para uma cópia do banco (com o serviço `db` ligado):

```powershell
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/acervo-before-series.dump'
docker compose cp db:/tmp/acervo-before-series.dump .\acervo-before-series.dump
```

Execute um comando por vez e pare se houver erro:

```powershell
docker compose build api web
docker compose stop web api worker
docker compose run --rm --no-deps init
docker compose up -d
docker compose restart web
docker compose ps -a
docker compose logs --tail=80 init api worker
```

O `init` aplica as migrations pendentes; terminar com código 0 é esperado. Não rode `down -v` nem apague o banco. Após atualizar, recarregue a página.

O APK que usa `server.url` para abrir seu site receberá a interface ao fechar e reabrir o aplicativo, desde que o endereço aponte para o servidor atualizado. O cursor da TV permanece. Se seu APK usa os arquivos de `dist` embutidos, gere outro APK com `npm run build`, `npx cap sync android` e Android Studio, usando a mesma assinatura.

## Teste na sua instalação

- Crie uma série de teste com duas temporadas e um episódio em cada.
- Verifique seleção de temporada e próximo episódio no computador, celular e TV.
- Vincule um vídeo existente, edite o título e confira a ordem dos episódios.
- Como espectador, confirme que rascunhos não aparecem. Despublicar a série também impede abrir seus episódios por link direto dentro do ACERVO.
- A troca de domínio do provedor deve atualizar os players dos episódios junto dos filmes.

## Dados e API

- `seasons`: ID, série (`videos.id`), número e nome opcional.
- `videos`: acrescenta `season_id`, `episode_number` e o tipo `episode`.
- Novas séries sem mídia usam `source_type=collection`, `content_type=series`, `status=ready`.
- Episódios usam os mesmos pipelines, players, permissões, favoritos e histórico dos vídeos, com um ID individual.
- Catálogo e busca mostram séries/filmes; episódios aparecem dentro da série, no histórico e nos favoritos individuais.
- `GET /api/admin/series`: lista administrativa com busca, paginação e contagens de temporadas/episódios.
- `POST /api/series`: cria apenas metadata; aceita `title`, `description`, `categoryId`, `published` e `firstSeason` (padrão true). Rejeita campos de mídia.
- `PUT /api/series/:id`: edita metadata/publicação, preservando mídias legadas.
- `GET /api/series/:id/seasons`: temporadas ordenadas com seus episódios, respeitando publicação.
- `POST /api/series/:id/seasons`: `{ "number": 1, "title": "" }` (admin).
- `PUT /api/seasons/:id`: altera número/nome (admin).
- `DELETE /api/seasons/:id`: exclui apenas temporada vazia (admin).
- `POST /api/videos`: para episódio, multipart com `contentType=episode`, `seasonId`, `episodeNumber`, metadata e link/arquivo; para série sem mídia, `contentType=series`, `sourceType=collection` e metadata.
- `PUT /api/episodes/:id`: `{ "seasonId": "UUID", "episodeNumber": 1 }`, vincula/move um vídeo existente (admin).
- Metadata, publicação, thumbnail e exclusão de episódios usam as rotas `/api/videos/:id` existentes.

Não é possível excluir uma série com temporadas, nem uma temporada com episódios. Mova ou exclua o conteúdo explicitamente. Isso evita apagar vários vídeos por engano. Arquivos de episódios excluídos entram na limpeza persistida existente.

Players externos mantêm os limites do provedor: sem progresso sincronizado ou avanço automático confiável ao final. O botão para o próximo episódio é manual. A proteção de acesso do ACERVO não torna a URL do provedor privada fora do aplicativo.

## Verificação reproduzível

Na pasta `backend`: `npm test`. A suíte `test/series.test.js` utiliza PostgreSQL via PGlite e FFmpeg real e valida migration sobre uma série antiga, CRUD, ordem, duplicados, permissões, publicação, vínculo de vídeo importado, processamento, histórico e exclusão.

Na pasta `frontend`: `npm run lint` e `npm run build`.

Após o build, na pasta `backend`: `npx playwright install chromium` e `npm run test:browser`. O fluxo inclui o cadastro de duas temporadas/episódios, vínculo de vídeo existente, seleção, próximo episódio e layout móvel. O iframe externo é simulado para manter o teste independente do provedor. A validação física em TV é feita na instalação do usuário.

A aba Séries utiliza a estrutura existente da migration 005; não exige uma nova migration.

Validação da estrutura inicial de temporadas: suites de API/migrations aprovadas, incluindo nove cenários novos de séries; FFmpeg real gerou um episódio HLS; lint e build aprovados. O fluxo Chromium completo passou com segurança de origem habilitada, sem erros de JavaScript, incluindo duas temporadas, cadastro e vínculo de episódios, troca de player, próximo episódio e layout de 390 px. Capturas de desktop e celular foram inspecionadas. Não houve teste desta interface em TV física nem atualização dos containers do usuário.
