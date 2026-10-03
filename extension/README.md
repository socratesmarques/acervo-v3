# Enviar para ACERVO 2.0 — envio rápido

Captura o nome e o player da página aberta, permite escolher o destino uma vez e salva diretamente no ACERVO. Depois da configuração, o fluxo normal tem **dois cliques**: abrir a extensão e clicar em Salvar/Publicar. Abrir a página de origem e preencher um título ausente continuam sendo passos necessários quando o site não oferece esses dados.

## Atualizar a extensão já instalada

1. Atualize o servidor com o backend desta versão (instruções abaixo).
2. Atualize os arquivos na mesma pasta `extension` já carregada no Chrome/Edge. Se usa Git, `git pull` atualiza essa pasta junto do projeto. Se usa ZIP, substitua o conteúdo da pasta existente, incluindo os novos arquivos `background.js`, `bridge.js` e `shared.js`.
3. Abra `chrome://extensions` (Chrome) ou `edge://extensions` (Edge), ative o modo desenvolvedor e clique em **Recarregar** no cartão **Enviar para ACERVO**. Confirme a versão **2.0.0**.
4. Para instalar pela primeira vez, use **Carregar sem compactação** e selecione a pasta `extension` que contém `manifest.json`. Fixe o ícone na barra do navegador.

Não é necessário remover a extensão. Manter a mesma pasta/instalação preserva o endereço salvo.

## Conectar uma vez

1. Abra seu ACERVO em uma aba e entre como administrador.
2. Na página de um filme ou episódio, abra a extensão. Em **Conectar ao seu ACERVO**, informe somente o endereço base, por exemplo `https://meu-acervo.example` ou `http://localhost:8080` para desenvolvimento.
3. Clique em **Conectar** e autorize o acesso solicitado ao endereço do seu ACERVO.
4. A extensão usa uma aba desse endereço. Se não houver uma, Conectar abre uma aba em segundo plano. Se pedir login, use **Abrir ACERVO / entrar**, autentique-se e volte à página do episódio para conectar novamente.

Mantenha uma aba do ACERVO aberta. A sessão deve ser do administrador; a extensão não pede nem salva a senha. Se a sessão expirar, ela informa o erro e não mostra uma confirmação falsa.

## Adicionar episódios com poucos cliques

Na primeira vez:

1. Escolha **Episódio de série**.
2. Selecione a **Série** e a **Temporada**. Se a série só tem uma temporada, ela é selecionada automaticamente.
3. Confira o título capturado. Deixe **Nº do episódio** vazio para usar o próximo número disponível (maior número atual + 1).
4. Escolha se quer **Publicar ao salvar** ou salvar como rascunho.
5. Clique **Salvar episódio** ou **Publicar episódio**.

Nos episódios seguintes, basta abrir a extensão e salvar: série, temporada e publicação ficam lembradas. A numeração automática é calculada no servidor ao gravar, não é apenas um contador local. Um número digitado manualmente vale somente para aquele envio e nunca é guardado para o próximo.

Se estiver cadastrando fora de ordem ou preenchendo uma lacuna, informe o número correto no campo. Números repetidos são rejeitados. Confira a temporada exibida antes de enviar.

O episódio herda a categoria da série. Uma série em rascunho mantém seus episódios ocultos dos espectadores até também ser publicada.

## Filmes e outras categorias

Escolha **Filme / vídeo**, selecione a categoria e salve. A categoria fica lembrada nos próximos envios, inclusive depois de fechar a extensão. Você pode trocar entre filme e episódio sem perder a categoria do filme nem a última temporada usada em cada série. Preferências são separadas por endereço do ACERVO e usuário.

Crie séries, temporadas e categorias no painel administrativo. Em **Player e mais opções → Atualizar categorias e séries**, recarregue os destinos sem fechar o popup. Se um destino salvo for excluído, selecione um válido; não será usado silenciosamente outro destino.

## Nome e player

- O título continua sendo capturado da página e pode ser corrigido.
- Em páginas com vários players, confira a seleção em **Player e mais opções**.
- Se a página Embed não tiver nome, use **Guardar nome** na página anterior. Na mesma origem, esse nome é sugerido automaticamente no Embed; confira se corresponde ao episódio. **Usar nome guardado** e **Apagar nome guardado** continuam disponíveis.
- **Revisar no painel** mantém o fluxo antigo de abrir uma aba para revisar/salvar um rascunho. Esse fluxo não transporta a seleção de temporada do envio rápido; use Salvar episódio para cadastrar diretamente na temporada.
- Não há busca automática do catálogo do provedor, download de arquivos ou varredura de várias páginas. A captura acontece na página ativa quando você abre a extensão.

## Confirmações e repetição

A confirmação informa o número efetivamente salvo e se foi publicado ou salvo como rascunho. **Abrir cadastro salvo** leva à edição para adicionar capa ou ajustar detalhes.

O mesmo player, inclusive com alias de domínio ou parâmetros reordenados, não cria outro cadastro. O existente é preservado: não muda de temporada/categoria/publicação automaticamente. Para reutilizar um filme já cadastrado como episódio, use **Vincular vídeo já cadastrado** no administrador.

O envio é coordenado pelo service worker da extensão e o último resultado fica guardado na sessão do navegador, para ser consultado ao reabrir o popup. Se houver falha de rede, encerramento do navegador ou nenhuma confirmação, confira o painel; reenviar o mesmo player não duplica o registro. Não há tentativas de publicação automáticas em segundo plano.

## Permissões e segurança

- `activeTab` e `scripting`: captura na aba atual após ação do usuário.
- `storage`: endereço, destinos e preferências; dados capturados/último resultado usam armazenamento de sessão.
- Permissão de host **opcional**, concedida em Conectar somente ao endereço configurado do ACERVO. O manifesto aceita endereços HTTPS porque o domínio é escolhido pelo usuário; não concede acesso automático a todos eles.
- As requisições são feitas na origem exata do ACERVO em contexto isolado, com os cookies HttpOnly já existentes. O CSRF é obtido e usado dentro dessa aba, sem ser salvo na extensão.
- A API mantém autenticação, administração, checagem de origem, CSRF, validação e limite de requisições. Não foi aberto CORS nem criado token permanente.
- Chrome não separa portas na permissão de host; o código confere a origem completa, incluindo porta, antes de executar as chamadas.

## Atualizar os containers no Windows

Depois de incorporar a alteração no GitHub, na pasta original do projeto:

```powershell
cd C:\Users\Usuario\Documents\acervo-novo
git switch main
git pull --ff-only
docker compose build api
docker compose up -d
```

Execute um comando por vez e pare em caso de erro. Esta atualização não acrescenta migration: requer a versão com temporadas/episódios (migration 005) já instalada. Não apague volumes. Atualizar apenas a pasta da extensão não instala as novas rotas no servidor. Não precisa gerar outro APK para atualizar a extensão.

## Testes

- `cd backend` → `npm test`: testes de API, permissões, validação, numeração, duplicados e isolamento da extensão.
- Frontend: `npm run build` antes do teste de navegador existente.
- `cd backend` → `npm run test:browser`: popup real servido localmente, bridge e API reais, com as APIs `chrome.*` simuladas; verifica seleção persistida, envio de episódios consecutivos, categoria, duplicados e sessão expirada.

A concessão de permissão e a instalação real da extensão precisam ser conferidas no Chrome/Edge do usuário. Os testes automatizados não representam uma instalação na barra do navegador, nem acessam os players reais de terceiros.
