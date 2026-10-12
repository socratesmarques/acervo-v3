# Capas verticais TMDB — Acervo V2

Esta implementação é uma proposta de teste. Não faça merge antes de validar no seu ambiente.

## Ativar o TMDB
1. Obtenha o token de leitura em https://www.themoviedb.org/settings/api
2. Guarde o valor de TMDB_READ_ACCESS_TOKEN no arquivo de variáveis de ambiente que alimenta o Docker Compose na sua implantação. Não coloque o token no GitHub, no frontend nem na extensão.
3. Faça backup do banco e dos arquivos armazenados. Ao publicar a versão de testes, o processo init do Compose executa a migração 007_tmdb_vertical_posters.sql automaticamente.
4. Reconstrua API e web no ambiente de testes, com seus próprios volumes de PostgreSQL e mídia. Não aponte testes de gravação para os mesmos volumes da produção.
5. Confira que Admin → Capas TMDB mostra a integração configurada.

## Funcionamento
- A extensão V2 contém um botão que abre Admin → Capas TMDB.
- O painel lista os filmes sem capa personalizada, incluindo filmes cadastrados anteriormente.
- O botão "Buscar capas desta página" consulta automaticamente os títulos da página (12 por vez) e usa o ano informado. Se o ano não retornar pôsteres, oferece resultados sem esse filtro.
- É possível modificar o título e o ano e refazer cada pesquisa.
- Escolha o pôster correto. Só depois de clicar em "Confirmar esta capa" ou "Aplicar capas aprovadas" o sistema baixa e salva a imagem.
- O pôster confirmado é gravado como thumbnail.jpg de 500 × 750 usando o armazenamento local ou S3/R2 que já existe. Apenas esses cartões aparecem em 2:3; os outros não mudam.
- O arquivo do vídeo e as capas já existentes não são alterados.

## Verificações manuais antes do merge
1. Conta administradora: ver lista de filmes sem capa, procurar um título e aprovar o pôster certo.
2. Repetir o mesmo pedido: deve resultar em conflito, sem sobrescrever a imagem.
3. Conta comum: deve receber 403 nas rotas TMDB.
4. Sem token: painel explica a configuração, e a busca não aplica nenhuma capa.
5. Títulos ambíguos: pesquisar com e sem ano, escolher manualmente e observar o resultado.
6. Confirmar imagem vertical 2:3 no catálogo e miniaturas anteriores sem alterações.
7. Confirmar que um pôster também aparece no APK/celular após publicar a versão de teste.
8. Verificar logs de API e armazenamento; validar que não há alteração no player.

## Segurança e direitos
- Requer sessão de administrador e CSRF na operação de gravação.
- O token fica no processo backend, não é devolvido para o navegador.
- O download aceita somente caminhos de pôster do CDN TMDB, com timeout, limite de 8 MB e validação de imagem.
- O TMDB oferece acesso gratuito não comercial com atribuição; se o seu Acervo tiver fins comerciais, confira os termos de licenciamento.
- Os pôsteres são obtidos apenas após sua confirmação; não existe correspondência automática irreversível.

Créditos: This product uses the TMDB API but is not endorsed or certified by TMDB.
Fontes: https://developer.themoviedb.org/docs/faq e https://www.themoviedb.org/about/logos-attribution
