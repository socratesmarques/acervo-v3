# API REST

Base: /api. JSON nas rotas comuns, multipart/form-data no upload. Todos os endpoints, exceto login e health, exigem cookie de sessão. Funções administrativas exigem role=admin no servidor.

## Autenticação

POST /auth/login aceita {"email":"...","password":"..."}. Retorna {user,csrf} e define o cookie HttpOnly acervo_session. GET /auth/me retorna usuário e token CSRF da sessão atual.

Em requisições de alteração, envie Origin igual a APP_ORIGIN. Exceto no login, envie também X-CSRF-Token. O frontend já faz isso. Não use localStorage para o cookie.

| Método | Rota | Função |
| --- | --- | --- |
| GET | /health | Verifica API e conexão ao banco |
| POST | /auth/login | Autenticar |
| GET | /auth/me | Usuário e CSRF |
| POST | /auth/logout | Revogar sessão |
| PUT | /auth/password | currentPassword e newPassword; revoga todas as sessões |
| GET | /videos | Catálogo publicado e processado |
| GET | /videos/:id | Detalhe; admin também vê rascunho |
| GET | /search?q= | Busca por título, descrição e categoria |
| POST | /videos | Upload, administrador |
| PUT | /videos/:id | Editar metadados, administrador |
| DELETE | /videos/:id | Excluir registro e agendar limpeza, administrador |
| POST | /videos/:id/thumbnail | Substituir thumbnail, administrador |
| POST | /videos/:id/retry | Reenfileirar vídeo com falha, administrador |
| POST | /videos/:id/view | Contar visualização única por usuário/dia |
| GET | /categories | Categorias |
| POST | /categories | Criar {name}, administrador |
| PUT | /categories/:id | Editar {name}, administrador |
| DELETE | /categories/:id | Excluir categoria sem vídeos, administrador |
| GET | /history | Vídeos parcialmente assistidos |
| POST | /history | Salvar {videoId,position,ended?} |
| GET | /favorites | Favoritos do usuário |
| PUT | /favorites/:id | Adicionar favorito (idempotente) |
| DELETE | /favorites/:id | Remover favorito |
| GET | /admin/stats | Totais do dashboard, administrador |
| GET | /admin/videos | Todos os vídeos, inclusive fila/rascunhos |
| GET | /admin/users | Contas, administrador |
| POST | /admin/users | Criar {name,email,password,role}, administrador |
| GET | /media/:id/* | Mídia privada: MP4, thumbnail, HLS e segmentos |

## Paginação e pesquisa

GET /videos, /admin/videos e /search: q (máximo 120 caracteres), category (UUID), sort=recent|popular, limit (1–100, padrão 24), offset (padrão 0).

Retorno: {items,total,limit,offset}. /history e /favorites aceitam limit/offset. A busca não diferencia maiúsculas e normaliza os acentos portugueses mais comuns. % e _ são tratados como texto, não curingas fornecidos pelo usuário.

## Upload

POST /videos recebe os campos title, description, categoryId e published (texto true ou false), arquivo video e arquivo opcional thumbnail. Resposta 202: {id,status:"queued",message}.

Formatos de entrada: MP4, MOV, M4V, MKV, AVI e WebM. ffprobe valida o conteúdo; extensão sozinha não basta. Thumbnail até 10 MB/20 megapixels, recodificada em JPEG. O vídeo tem limite configurado por MAX_UPLOAD_MB, padrão 10240 MB.

PUT /videos/:id recebe JSON completo: {title,description,categoryId,published}. Publicar durante o processamento significa disponibilizar automaticamente quando ready, nunca servir arquivos incompletos.

## Vídeo retornado

id, title, description, categoryId, category, duration (segundos), published, status, processingError, publishedAt, createdAt, views, thumbnail, source (master HLS), mp4Url, qualities, position, completed e progress (0–100), favorite.

Vídeos ainda não processados retornam source/thumbnail nulos. Nunca retornamos caminhos absolutos do servidor ou credenciais do storage.

## Erros

400: entrada inválida; 401: autenticação; 403: permissão/origem/CSRF; 404: inexistente ou não disponível; 409: conflito/vínculo/estado; 413: upload grande; 416: Range inválido; 429: limite de requisições; 500: erro interno sem detalhes sensíveis.

Formato: {message,issues?}. issues lista field/message quando a validação dos dados falha.
