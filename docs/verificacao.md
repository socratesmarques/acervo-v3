# Verificação da entrega

## Executado

- Frontend: npm run lint sem avisos; npm run build concluído.
- Backend: **17 testes aprovados**, zero falhas, usando PostgreSQL embutido PGlite e FFmpeg real.
- Login, credenciais inválidas, sessão privada, CSRF, origem e papel do usuário.
- CRUD de categorias, nomes únicos, vínculos e validação.
- Upload inválido e acima do limite rejeitados.
- Upload real de MP4 e processamento real para MP4, HLS e thumbnail.
- Playlists e segmentos servidos com autenticação; Range em MP4 validado.
- Thumbnail válida recodificada e formato inválido rejeitado.
- Busca por título/descrição sem acentos e paginação.
- Favoritos e histórico separados por usuário; conclusão do vídeo.
- Contagem de visualizações deduplicada por usuário/dia.
- Despublicação revoga acesso inclusive a segmentos já conhecidos.
- Exclusão com limpeza física e categorias protegidas por vínculo.
- Falha de processamento, reprocessamento e posterior exclusão.
- FFmpeg gerando **480p, 720p e 1080p** a partir de vídeo sintético 1080p sem áudio.
- Teste automatizado em Chromium: login, categoria, upload pelo formulário, reprodução HLS, favorito, progresso, pergunta de retomada, busca, admin e alteração de senha.
- Interface conferida em desktop 1440 px e móvel 390 px; sem rolagem horizontal indevida nos fluxos verificados e sem erros de JavaScript.
- Compose conferido como YAML e lockfiles consistentes com package.json.
- npm audit --omit=dev retornou zero alertas nas dependências de produção no momento da entrega. A biblioteca de thumbnails foi atualizada antes do reteste. Isso não é garantia de ausência de vulnerabilidades.

Os testes de navegador usam um servidor temporário para servir o build e encaminhar /api. Eles não executam o Nginx do container.

## Não executado neste ambiente

- Docker Compose completo e PostgreSQL como daemon TCP: Docker não está disponível e a instalação do PostgreSQL do sistema não foi possível. O SQL foi exercitado no PostgreSQL embutido, não numa simulação em memória de SQL.
- Bucket S3/R2 real: nenhuma credencial foi fornecida.
- HTTPS e domínio público.
- iPhone/Safari e Android físicos, telas de TV e acessibilidade com leitor de tela.
- Uploads de 10 GB, vídeos de horas, vários acessos simultâneos ou stress de reinício.
- Restauração real de backup ou migração de um acervo existente para S3/R2.

## Aceitação no seu computador

1. Execute o Compose e confirme init concluído, API saudável e worker ativo.
2. Crie uma categoria e envie um MP4 curto seu.
3. Confira thumbnail, reprodução, volume, tela cheia e mudança de qualidade quando houver mais de uma.
4. Pause após alguns segundos, saia e volte; confirme a retomada.
5. Adicione aos favoritos e confira Minha lista.
6. Crie um espectador; confirme que ele não acessa /admin.
7. Despublique e confirme que o espectador perde acesso ao vídeo.
8. Teste backup/restauração em instalação separada antes de guardar seu único exemplar de qualquer vídeo.
