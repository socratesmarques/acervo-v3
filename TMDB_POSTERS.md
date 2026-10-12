# Capas automáticas TMDB — Acervo V2 (revisão antes de aplicar)

No painel do ACERVO, use Admin → Capas TMDB. A extensão V2 tem o botão "Capas TMDB" que abre esta página. Aparecem os filmes sem capa personalizada, incluindo os recém-importados.

## Configuração
1. Faça uma conta TMDB e obtenha o API Read Access Token em https://www.themoviedb.org/settings/api
2. Configure TMDB_READ_ACCESS_TOKEN no ambiente do backend, nunca na extensão, no frontend ou no GitHub.
3. Faça backup do PostgreSQL, rode a migração 007_tmdb_vertical_posters.sql pelo comando de migração do backend e reinicie o backend.
4. Recompile o frontend para habilitar Admin → Capas TMDB. O backend precisa alcançar os servidores HTTPS do TMDB.

## Uso
1. Importe filmes normalmente (preferencialmente como rascunhos).
2. Abra Admin → Capas TMDB e clique em "Buscar capas desta página" para buscar até 12 filmes.
3. Revise o título e o ano. Se estiver errado, edite e procure novamente, ou apague o ano.
4. Clique no pôster correto de cada filme e depois "Confirmar esta capa", ou use "Aplicar capas aprovadas" para os selecionados.
5. No catálogo, os pôsteres TMDB aprovados aparecem em 2:3. Capas antigas continuam no formato existente.

## Proteções
- Só administradores podem buscar e aplicar imagens, com sessão e proteção CSRF no backend.
- Token TMDB nunca sai do servidor. Downloads limitados a 8 MB, domínio de imagens fixo do TMDB, timeout e validação da imagem por Sharp.
- Nunca sobrescreve uma capa personalizada já existente ou altera o arquivo do filme.
- O catálogo consulta somente filmes já cadastrados, nunca realiza coleta de links de vídeo.
- API TMDB gratuita para uso não comercial com atribuição. Para uso comercial verifique a licença com o TMDB.
- Teste o fluxo em desenvolvimento antes de fazer merge ou atualizar produção.

This product uses the TMDB API but is not endorsed or certified by TMDB.
