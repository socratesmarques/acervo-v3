# Enviar para ACERVO 2.3.0 — envio rápido

## Importação automática de séries (nova opção)

No popup da extensão, clique em **Importar séries por lista**. Você pode colar até 50 URLs HTTPS de páginas de séries ou de listagens com cartões de séries. Também está disponível o menu do botão direito **Importar séries desta página**, que preenche uma lista editável de candidatos para revisão.

A extensão reaproveita `movies.js` para identificar cartões de séries e `season.js` para encontrar temporadas e episódios dublados nas páginas individuais. Antes de criar uma série, confirma que ao menos um player compatível é acessível; não cria séries vazias. Cria séries como rascunho por padrão, impede repetir o cadastro da mesma URL, informa o andamento por série/episódio e permite repetir apenas falhas.

As capas são obtidas pelas mesmas validações usadas em filmes. JPEG, PNG e WebP suportados são salvos, preservando orientação vertical quando presente; a capa da série é padrão para episódios sem capa própria. Se a imagem ou os episódios estiverem em outro domínio, clique no botão de autorização oferecido pela extensão. Não contorna bloqueios nem força downloads. Alguns sites exigem revisão manual da lista e das páginas de temporadas.

Depois de atualizar backend/frontend com a migration 009, recarregue a extensão em `chrome://extensions` (ou `edge://extensions`). Primeiro teste com 1–2 séries e publicação desmarcada.



## Lista de páginas de filmes (catálogos ou filmes individuais)

Abra a extensão e selecione **Importar lista de links**. Cole até **50 endereços HTTPS**, um por linha. Cada endereço pode ser uma página com vários cartões de filmes (como `/filmes/pagina-1`) ou uma página individual (como `/filme/xyz`). Em página de catálogo, a extensão reutiliza o mesmo detector `movies.js` da opção **Importar filmes desta página**; em seguida, abre cada filme encontrado e captura o player com `extract.js`, gravando pelo endpoint já existente. Página individual com player é cadastrada diretamente.

A importação avança de página em página, exibindo filmes salvos, duplicados e falhas. Uma falha não interrompe o restante da lista. **Tentar novamente apenas as falhas** reprocessa somente URLs sem sucesso. A categoria escolhida se aplica a todos os filmes e o padrão é **rascunho**.

Os links candidatos são identificados de forma heurística, sem garantia de que todos sejam filmes. Faça um teste com uma listagem pequena antes de importar dezenas de páginas. A extensão solicita permissão para os domínios fornecidos; não ultrapassa login, DRM, proteções de iframe ou bloqueios dos servidores. Capas externas exigem permissão do próprio domínio da imagem e não impedem o cadastro do filme.

Testes automatizados: `node --test extension/test-links.mjs extension/test-movie-pages.mjs extension/test-links-flow.mjs` a partir da raiz do repositório.

## Blogger Video (2.2.5)

Reconhece o iframe `https://www.blogger.com/video.g?token=...` como
**Blogger Video**, preservando a URL completa. Também reconhece `data-src`
e HTML de incorporação copiado na página. Atualize o servidor com a migration
008 e recarregue esta extensão. Veja [uso, atualização e testes](../docs/blogger-video.md).
O player original é incorporado, sem baixar vídeos ou contornar restrições.

Captura o nome e o player da página aberta, permite escolher o destino uma vez e salva diretamente no ACERVO. Depois da configuração, o fluxo normal tem **dois cliques**: abrir a extensão e clicar em Salvar/Publicar. Abrir a página de origem e preencher um título ausente continuam sendo passos necessários quando o site não oferece esses dados.

## Atualizar a extensão já instalada

1. Atualize os arquivos da extensão na pasta já carregada no Chrome/Edge. Se usa Git, execute `git pull`; se usa ZIP, substitua os arquivos da pasta `extension`.
2. Abra `chrome://extensions` (Chrome) ou `edge://extensions` (Edge), ative o modo desenvolvedor e clique em **Recarregar** no cartão **Enviar para ACERVO**. Confirme a versão **2.3.0**.
3. Para instalar pela primeira vez, use **Carregar sem compactação** e selecione a pasta `extension` que contém `manifest.json`. Fixe o ícone na barra do navegador.

Não é necessário remover a extensão. Manter a mesma pasta/instalação preserva o endereço salvo.

## Conectar uma vez

1. Abra seu ACERVO em uma aba e entre como administrador.
2. Na página de um filme ou episódio, abra a extensão. Em **Conectar ao seu ACERVO**, informe somente o endereço base, por exemplo `https://meu-acervo.example` ou `http://localhost:8080` para desenvolvimento.
3. Clique em **Conectar** e autorize o acesso solicitado ao endereço do seu ACERVO.
4. A extensão usa uma aba desse endereço. Se não houver uma, Conectar abre uma aba em segundo plano. Se pedir login, use **Abrir ACERVO / entrar**, autentique-se e volte à página do episódio para conectar novamente.

Mantenha uma aba do ACERVO aberta. A sessão deve ser do administrador; a extensão não pede nem salva a senha. Se a sessão expirar, ela informa o erro e não mostra uma confirmação falsa.

## Usar o menu do botão direito

Na página de uma lista de episódios, clique com o botão direito no link do episódio e escolha **Adicionar episódio ao ACERVO**. A extensão abre a página em segundo plano, captura o nome e o player e abre o cadastro já no modo de episódio. Se ainda não tiver conectado o ACERVO, conecte uma vez e depois repita o envio.

Na primeira utilização em cada site de origem, o Chrome/Edge pede permissão para a extensão ler aquela página e encontrar o iframe. A página de origem é fechada depois da captura. O título, player, série e temporada aparecem no formulário para você conferir; série e temporada usam o destino salvo anteriormente.

O mesmo item também aparece ao clicar com o botão direito numa página de episódio já aberta. Se o site bloquear a leitura ou não mostrar o player imediatamente, abra a página do episódio e tente pelo menu novamente, ou use o ícone da extensão.

## Importar uma temporada inteira

Abra a página que lista os episódios e clique com o botão direito em uma área vazia → **Importar temporada para o ACERVO**. A janela mostra os links dublados da temporada selecionada, ordenados por número. Se a página tiver várias temporadas ou sagas nomeadas, selecione o destino correspondente para ver somente os episódios daquela seção. O nome da saga na página precisa corresponder ao título da temporada cadastrada no ACERVO. Escolha a série e a temporada, confira a lista e clique em **Importar selecionados**. A extensão abre cada página em segundo plano, captura o player e envia com o número do episódio mostrado. O resultado informa salvos, duplicados e falhas. Corrija os itens com falha e repita apenas esses; os players já cadastrados não são duplicados.

A detecção depende de links visíveis com número de episódio no texto ou na linha da lista. Links gerados apenas após rolagem precisam estar carregados antes do clique. Páginas bloqueadas ou players carregados com atraso podem exigir importação individual.

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
- A importação individual usa somente a página aberta. Na tela de lista, só são percorridas as URLs informadas; a extensão não descobre automaticamente a próxima página do catálogo nem baixa vídeos.

## Confirmações e repetição

A confirmação informa o número efetivamente salvo e se foi publicado ou salvo como rascunho. **Abrir cadastro salvo** leva à edição para adicionar capa ou ajustar detalhes.

O mesmo player, inclusive com alias de domínio ou parâmetros reordenados, não cria outro cadastro. O existente é preservado: não muda de temporada/categoria/publicação automaticamente. Para reutilizar um filme já cadastrado como episódio, use **Vincular vídeo já cadastrado** no administrador.

O envio é coordenado pelo service worker da extensão e o último resultado fica guardado na sessão do navegador, para ser consultado ao reabrir o popup. Se houver falha de rede, encerramento do navegador ou nenhuma confirmação, confira o painel; reenviar o mesmo player não duplica o registro. Não há tentativas de publicação automáticas em segundo plano.

## Permissões e segurança

- `activeTab`, `scripting` e `contextMenus`: captura sob ação explícita do usuário pelo ícone ou menu do botão direito.
- `storage`: endereço, destinos e preferências; dados capturados/último resultado usam armazenamento de sessão.
- Permissão de host **opcional** para o endereço do ACERVO e, separadamente, para a página de episódio usada pelo menu de contexto. A permissão da página de origem é pedida na primeira utilização do site. O manifesto aceita endereços HTTPS porque o domínio é escolhido pelo usuário; não concede acesso automático a todos eles.
- As requisições são feitas na origem exata do ACERVO em contexto isolado, com os cookies HttpOnly já existentes. O CSRF é obtido e usado dentro dessa aba, sem ser salvo na extensão.
- A API mantém autenticação, administração, checagem de origem, CSRF, validação e limite de requisições. Não foi aberto CORS nem criado token permanente.
- Chrome não separa portas na permissão de host; o código confere a origem completa, incluindo porta, antes de executar as chamadas.

## Atualizar a extensão no Windows

Para o suporte ao Blogger, atualize também o servidor e aplique a migration 008,
conforme o [guia de atualização](../docs/blogger-video.md). Depois abra
`chrome://extensions` ou `edge://extensions` e clique em **Recarregar** no cartão
**Enviar para ACERVO**. O APK que carrega o mesmo site remoto não precisa ser
recompilado apenas por esta alteração.

## Testes

- `cd backend` → `npm test`: testes de API, permissões, validação, numeração, duplicados e isolamento da extensão.
- Frontend: `npm run build` antes do teste de navegador existente.
- `cd backend` → `npm run test:browser`: popup real servido localmente, bridge e API reais, com as APIs `chrome.*` simuladas; verifica seleção persistida, envio de episódios consecutivos, categoria, duplicados e sessão expirada.

A concessão de permissão e a instalação real da extensão precisam ser conferidas no Chrome/Edge do usuário. Os testes automatizados não representam uma instalação na barra do navegador, nem acessam os players reais de terceiros.
