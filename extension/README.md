# Enviar para ACERVO (Chrome / Edge desktop)

Extensão Manifest V3 que captura o nome e a URL do player da aba aberta e leva
os dados para revisão em `/admin/import`. Não importa todo o site, não baixa
filmes e não publica conteúdo sem a confirmação no painel.

## Atualizar o servidor no Windows

Depois de incorporar a alteração ao seu repositório, atualize sua cópia local.
Preserve `.env`, dados, configurações do Android e do Tailscale. Na pasta que
contém `compose.yml` (por exemplo `C:\Users\Usuario\Documents\acervo-novo`),
execute um comando por vez, parando se aparecer erro:

```powershell
docker compose build api worker init web
docker compose stop web api worker
docker compose run --rm --no-deps init
docker compose up -d --force-recreate api worker web
```

A feature não adiciona migrations. O init mantém as migrations anteriores em dia.
Não use `down -v`: não é necessário apagar nada. Não é necessário gerar outro APK.

## Instalar a extensão

1. Abra `chrome://extensions` (Edge: `edge://extensions`).
2. Ative **Modo do desenvolvedor**.
3. Clique **Carregar sem compactação** e selecione a pasta `extension` deste projeto.
4. Fixe **Enviar para ACERVO** na barra do navegador.
5. Abra a página do filme e clique no ícone.
6. Informe o endereço do seu ACERVO, por exemplo `https://desktop-qdrqsqq.tailacb07e.ts.net`.
   Esse endereço é salvo localmente no navegador. Use somente o endereço do seu painel.
7. Confira o nome preenchido e o player selecionado. Clique **Enviar para ACERVO**.
8. Na nova aba, faça login como administrador se necessário. Selecione Filme/Série,
   categoria, revise o nome e a descrição e clique **Salvar rascunho**.
9. Abra o cadastro para adicionar a thumbnail e publicar.

Depois de atualizar arquivos da extensão, clique **Recarregar** na página de extensões.

## Quando a página Embed não contém o nome

Não há como deduzir com segurança o nome de um filme a partir de um identificador
arbitrário do player. Abra primeiro a página do filme, clique na extensão e use
**Guardar nome desta página**. Depois, na página com o iframe, abra a extensão e
clique **Usar nome guardado**. Confira que nome e player correspondem antes de enviar.

Somente um conjunto de nome/descrição é guardado por vez, em `storage.session`.
Ele não é reaplicado silenciosamente a outro filme e pode ser apagado pelo botão.
Se não houver título útil, o campo fica vazio para preenchimento manual.

## Captura e limites

- Nome: `og:title`, `twitter:title`, primeiro `h1` ou título da aba; remove o
  sufixo RedeCanais e ignora títulos genéricos como Embed/Player.
- Descrição: metadados Open Graph ou `description`, quando disponíveis.
- Player: URL atual, iframes, links para `embed.api?embed=...` e códigos em
  textarea/pre/code. Entende hostname percent-encoded, URL `//` e caminho Base64.
- Vários players: escolha na lista. Não são abertos automaticamente.
- Provedores: os suportados pelo backend. O domínio precisa estar cadastrado em
  Admin → Provedores, incluindo aliases antigos. Não segue redirects para descobrir domínios.
- Não captura capas automaticamente nesta versão; adicione a thumbnail na edição.
- Não entra em iframes de outras origens, não contorna bloqueios e não executa
  scripts copiados. Se a estrutura do site mudar, o extrator pode precisar de ajuste.
- A extensão desktop não é instalada dentro do APK Android.

## Autenticação e privacidade

Permissões: `activeTab`, `scripting`, `storage`. Sem acesso permanente a todos os
sites, cookies ou histórico. Captura somente após o clique. Não pede senha, não
armazena token e não faz chamadas de escrita diretamente à API.

A transferência usa um fragmento de URL (`#`), que não é enviado na requisição
HTTP ao servidor. O fragmento pode ficar no histórico do navegador; não coloque
segredos nos campos. O painel exibe os dados como texto e valida-os novamente na
API. O login preserva o destino da importação. Salvar exige administrador, sessão,
CSRF e origem válida, com as mesmas proteções do painel existente.

`POST /api/admin/imports` recebe `title`, `description`, `categoryId`, `contentType`
e `externalUrl`. Sempre grava `published=false`. Não busca URLs no servidor.

O importador consulta registros externos existentes, comparando provedor e caminho
com parâmetros ordenados, ignorando fragmento. Domínios antigos e atuais resolvem
para o mesmo provedor. Duas importações simultâneas do mesmo provedor são serializadas
por advisory lock transacional. Retorna o cadastro existente sem sobrescrevê-lo.
Essa proteção é do importador; o CRUD manual continua com seu comportamento anterior.
Não detecta que dois IDs/servidores diferentes representam a mesma obra.

## Verificação

```bash
npm test --prefix backend
npm run lint --prefix frontend
npm run build --prefix frontend
npm run test:browser --prefix backend
```

O teste de navegador usa Chromium (`npx playwright install chromium` na pasta backend).
A extração é testada com HTML controlado semelhante ao código de incorporação fornecido;
nenhum vídeo real de terceiros é acessado. Teste a extensão no seu Chrome após instalar,
pois o site pode apresentar metadados diferentes dos exemplos.

Referências: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
https://developer.chrome.com/docs/extensions/reference/api/scripting
