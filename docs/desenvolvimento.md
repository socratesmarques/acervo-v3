# Desenvolvimento local

## Requisitos

Node.js 24, npm, PostgreSQL 17 e FFmpeg/ffprobe no PATH. O caminho mais simples para executar tudo é Docker, descrito no README. Não use o servidor de desenvolvimento do Vite como servidor público.

## Banco

Crie um banco e usuário dedicados usando seu administrador do PostgreSQL. Exemplo interativo no psql:

```sql
CREATE ROLE acervo LOGIN;
\password acervo
CREATE DATABASE acervo OWNER acervo;
```

O comando \password pede a senha. Não use o usuário superadministrador na aplicação. Se usar caracteres especiais na URL de conexão, codifique-os para URL.

## API

Na pasta do projeto:

```bash
cd backend
npm ci
cp .env.example .env
```

Edite backend/.env: DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME e ADMIN_PASSWORD (12 caracteres ou mais). Mantenha APP_ORIGIN=http://localhost:5173, COOKIE_SECURE=false e TRUST_PROXY=false no desenvolvimento.

```bash
npm run migrate
npm run admin
npm run dev
```

Após criar o administrador, remova ADMIN_PASSWORD do arquivo. O comando admin cria uma conta nova; não redefine contas existentes.

## Worker

Em outro terminal, dentro de backend:

```bash
npm run worker
```

Ele precisa usar o mesmo DATABASE_URL e STORAGE_DIR da API. Sem worker, uploads ficam na fila. Só um worker é aceito: um lock do banco impede processamento duplicado. Ao reiniciar, tarefas interrompidas são recuperadas.

## Frontend

Em outro terminal, dentro de frontend:

```bash
npm ci
npm run dev
```

Abra http://localhost:5173. Se o Vite escolher outra porta, pare o processo que ocupa 5173 ou altere APP_ORIGIN no backend e reinicie a API. A validação de origem é intencional; não a desative para contornar erros de configuração.

O frontend chama /api na mesma origem. vite.config.js encaminha para localhost:3001. Em produção, Nginx desempenha essa função.

## Arquivos alterados desde a Etapa 1

| Caminho | Alteração |
| --- | --- |
| frontend/src/App.jsx | Rotas protegidas, login, perfil e admin |
| frontend/src/pages/Home.jsx | Busca vídeos reais na API |
| frontend/src/pages/Catalog.jsx | Busca, categorias, favoritos e paginação |
| frontend/src/pages/Video.jsx | Player real, histórico e favoritos |
| frontend/src/components/Header.jsx | Perfil, logout e acesso administrativo |
| frontend/src/components/Hero.jsx | Usa metadados do vídeo destacado |
| frontend/src/components/VideoCard.jsx | Duração e data reais |
| frontend/src/index.css | Formulários, admin, player e responsividade |
| frontend/vite.config.js | Proxy da API |
| frontend/src/data/videos.js | Removido; não há catálogo fixo |
| frontend/src/services/catalog.js | Substituído pelo cliente api.js |
| frontend/public/media e images | Removidas mídias demonstrativas públicas |
| backend/ | API, banco, worker e testes completos |

Novos componentes incluem Player, FavoriteButton e Feedback; novas páginas incluem Login, Profile e Admin. O ZIP contém todos os arquivos completos, sem blocos de código omitidos.

## Comandos úteis

No frontend: npm run build, npm run lint. No backend: npm test, npm run test:browser.

Para testar num PostgreSQL real, use um banco de testes vazio e descartável:

```bash
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/acervo_test npm test
```

Nunca aponte testes para produção. Os testes criam contas e registros. PGlite é usado automaticamente quando TEST_DATABASE_URL não existe.

## Problemas comuns

- 401: sessão ausente/expirada; entre novamente.
- 403 de origem: confira APP_ORIGIN (protocolo, endereço e porta).
- 403 de segurança: recarregue a página para recuperar o token CSRF.
- Upload 413: limite de tamanho no backend ou proxy.
- Status Na fila: verifique se o worker está rodando.
- Status Falhou: confira os logs do worker, corrija o problema e clique Reprocessar.
- Categoria não exclui: mova/exclua os vídeos vinculados antes.
- FFmpeg não encontrado: instale no ambiente que executa o worker, ou use o Dockerfile.
- Alterar senha desconecta: comportamento intencional, todas as sessões são revogadas.
