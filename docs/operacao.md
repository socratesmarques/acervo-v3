# Operação, produção e armazenamento

## Antes de publicar

1. Use um servidor com Docker e espaço suficiente para originais, MP4, múltiplas variantes e temporários. Reserve memória para FFmpeg.
2. Configure domínio e HTTPS com um proxy confiável. ops/Caddyfile.example demonstra Caddy no host.
3. Defina APP_ORIGIN=https://seu-dominio e COOKIE_SECURE=true no .env. Reinicie os serviços após mudar a configuração.
4. Mantenha o PostgreSQL e a API sem portas públicas. O Compose expõe somente a web.
5. Troque a senha inicial no perfil. Remova a senha antiga do .env ou substitua-a por outro segredo aleatório; um banco com admin existente não é reconfigurado pelo init.
6. Faça backup, monitore disco/logs e mantenha Node, FFmpeg, Nginx, PostgreSQL e dependências atualizados.
7. Teste login, permissões, um upload real, reprodução, retomada, despublicação e recuperação do backup no ambiente final.

COOKIE_SECURE=false existe para localhost HTTP, não para publicação na internet. APP_ORIGIN é uma origem exata. Não configure CORS aberto ou remova CSRF para resolver uma URL incorreta.

TRUST_PROXY=true no Compose pressupõe que apenas Nginx consiga acessar a API e substitua X-Forwarded-For. Não exponha a porta 3001 diretamente com essa configuração.

## Configuração S3/R2

Crie um bucket PRIVADO e credenciais limitadas a listar, ler, gravar, fazer upload multipart e excluir objetos desse bucket. No .env:

```dotenv
STORAGE_DRIVER=s3
S3_BUCKET=nome-do-bucket
S3_REGION=auto
S3_ENDPOINT=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=sua-chave
S3_SECRET_ACCESS_KEY=seu-segredo
```

Para Amazon S3, use a região do bucket e omita S3_ENDPOINT. Para R2, use o endpoint do seu painel e região auto. Não envie essas credenciais para o navegador. Não habilite acesso público no bucket.

```bash
docker compose up -d --build
```

Novos uploads passam a usar S3/R2. O campo storage_driver de cada vídeo mantém o destino anterior; **alterar a variável não migra os vídeos existentes**. Preserve o volume local e credenciais de destinos ainda utilizados. Migração de acervo existente exige uma operação específica, não implementada como comando automático nesta versão.

O backend faz proxy autenticado de playlists/segmentos/MP4 e suporta Range. Não é necessário CORS público no bucket. O upload ao S3 usa multipart com memória limitada e também preserva o original. Uploads continuam passando temporariamente pelo disco do servidor para FFmpeg; usar R2 não elimina a necessidade de espaço local.

O adaptador está implementado, mas não foi testado contra uma conta real nesta entrega. Valide permissões, custos, limites e reprodução antes de confiar nele para seu acervo.

## Limites e fila

MAX_UPLOAD_MB controla a API (padrão 10240). Nginx aceita até 11 GiB para acomodar multipart de um vídeo de 10 GiB. Se aumentar a API, ajuste frontend/nginx.conf e outros proxies.

FFMPEG_TIMEOUT_SECONDS limita cada comando (padrão 14400). Há um worker por instalação, com dois threads de codificação e limites de CPU/memória no Compose. Vídeos de até 12 horas são aceitos, mas tempo de processamento depende do hardware. Não foram executados testes de carga com arquivos de 10 GB.

Desligar durante o processamento deixa a tarefa recuperável no próximo início. Estados failed não são repetidos infinitamente; use Reprocessar após corrigir o motivo. Originais de tarefas com falha são mantidos para a nova tentativa. Não remova arquivos do volume manualmente enquanto há jobs ativos.

Uploads interrompidos por encerramento abrupto da API antes do registro no banco podem deixar temporários sem vínculo. A limpeza automática cobre vídeos excluídos pelo admin; uma revisão de temporários órfãos ainda deve ser feita durante manutenção, sempre com backup e serviços parados.

## Backup

Faça backup de **banco e volume media**. Se estiver no S3/R2, também proteja o bucket com política de backup/versionamento adequada. Um dump do banco sozinho não contém seus vídeos.

Na raiz, para um backup consistente sem escritas:

```bash
mkdir -p backups
docker compose stop web api worker
docker compose exec -T db pg_dump -U acervo -d acervo -Fc > backups/acervo.dump
docker compose run --rm --no-deps -T api tar -C /app/storage -czf - . > backups/media.tar.gz
docker compose start api worker web
```

Copie os backups para outro local seguro e guarde o .env em um gerenciador de segredos. Cada execução sobrescreve os mesmos arquivos de exemplo: use nomes datados para manter versões. Teste a restauração em uma instalação separada antes de considerar o backup confiável. Não execute comandos de restauração destrutivos sobre a única cópia dos dados.

## Logs e monitoramento

```bash
docker compose logs -f worker
docker compose logs --tail=100 api
docker compose ps -a
```

A API omite cookies e tokens sensíveis dos logs. Não publique logs completos sem revisar dados pessoais. O endpoint /api/health verifica a conexão com o banco, mas não verifica espaço disponível ou a saúde do bucket. Monitore esses recursos separadamente.

## Escala

Esta entrega é adequada como implementação inicial de um acervo pessoal. Uma implantação com muitos espectadores pode precisar de CDN privada, URLs/cookies assinados, fila distribuída e upload direto/retomável. Não existe quota por usuário nem varredura antivírus. Mantenha o upload limitado a administradores de confiança e atualize o FFmpeg.
