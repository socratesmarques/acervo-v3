## Lista de páginas de filmes (catálogos ou filmes individuais)

Abra a extensão e selecione **Importar lista de links**. Cole até **50 endereços HTTPS**, um por linha. Cada endereço pode ser uma página com vários cartões de filmes (como `/filmes/pagina-1`) ou uma página individual (como `/filme/xyz`). Em página de catálogo, a extensão reutiliza o mesmo detector `movies.js` da opção **Importar filmes desta página**; em seguida, abre cada filme encontrado e captura o player com `extract.js`, gravando pelo endpoint já existente. Página individual com player é cadastrada diretamente.

A importação avança de página em página, exibindo filmes salvos, duplicados e falhas. Uma falha não interrompe o restante da lista. **Tentar novamente apenas as falhas** reprocessa somente URLs sem sucesso. A categoria escolhida se aplica a todos os filmes e o padrão é **rascunho**.

Os links candidatos são identificados de forma heurística, sem garantia de que todos sejam filmes. Faça um teste com uma listagem pequena antes de importar dezenas de páginas. A extensão solicita permissão para os domínios fornecidos; não ultrapassa login, DRM, proteções de iframe ou bloqueios dos servidores. Capas externas exigem permissão do próprio domínio da imagem e não impedem o cadastro do filme.

Testes automatizados: `node --test extension/test-links.mjs extension/test-movie-pages.mjs` a partir da raiz do repositório.

# Enviar para ACERVO V2 — Importador em lotes (teste)

## Novo: importar uma lista de links (uma categoria para todos)

Abra a extensão e clique em **Importar lista de links**. Uma janela independente será aberta para manter o progresso visível. Com o ACERVO aberto e autenticado como administrador:

1. Cole até **50 endereços HTTPS**, um por linha. Exemplo:
   `https://exemplo.com/filme-a`.
   Também é aceito `Nome do filme | https://exemplo.com/filme-b` para indicar um título quando a página não informa um.
2. Escolha a **categoria** que será aplicada a todos os novos filmes.
3. Por segurança, **Publicar imediatamente** começa desmarcado: os filmes serão rascunhos. Ative somente se desejar.
4. Clique em **Importar lista**, conceda acesso aos domínios dos links e mantenha a janela aberta. A extensão abre cada página em segundo plano, identifica um player compatível, envia um filme de cada vez e fecha a aba temporária.
5. Veja quantos foram salvos, quantos já existiam e quais falharam. **Tentar novamente apenas as falhas** não reenvia os sucessos.

Links repetidos na lista são ignorados. Um player já existente no Acervo não é movido de categoria nem publicado novamente. Sem título ou player compatível, o link é marcado como falha para revisão; não cria um cadastro incorreto. A função não baixa vídeos, não contorna bloqueios e não adiciona capa automaticamente; caso necessário, ajuste as capas no painel. A publicação e os direitos de uso do conteúdo são de sua responsabilidade.

Para atualizar, dê `git pull` no computador que tem a pasta da extensão e clique em **Recarregar** em `chrome://extensions` ou `edge://extensions`. **Não é necessário reiniciar o Motorola ou recompilar o site para esta alteração.**


## Blogger Video (1.1.1)

Reconhece o iframe `https://www.blogger.com/video.g?token=...` como
**Blogger Video**, preservando a URL completa. Também reconhece `data-src`
e HTML de incorporação copiado na página. Atualize o servidor com a migration
008 e recarregue esta extensão. Veja [uso, atualização e testes](../docs/blogger-video.md).
O player original é incorporado, sem baixar vídeos ou contornar restrições.

Esta pasta é uma **segunda extensão** baseada na versão 2.2.4 do importador original. A versão oficial continua na pasta `extension/`, sem alterações. Chrome/Edge tratará a nova extensão como independente, com armazenamento e permissões separados.

## Instalação lado a lado

1. Baixe o ZIP da branch desta proposta no GitHub e extraia os arquivos.
2. Acesse `chrome://extensions` (ou `edge://extensions`).
3. Habilite **Modo do desenvolvedor**, clique em **Carregar sem compactação** e selecione a pasta `extension-lotes`.
4. Confirme que as extensões original e V2 aparecem em cartões separados.
5. Abra seu ACERVO em uma aba como administrador e clique em **Conectar** na V2. Informe apenas a origem HTTPS do ACERVO.

## Filmes em lote

1. Acesse uma página de listagem de filmes de uma fonte que você possa utilizar.
2. Clique com o botão direito no fundo da página → **Importar filmes desta página (ACERVO V2)**.
3. A janela apresenta **até 120 links candidatos**. Revise e desmarque os que não forem filmes.
4. Selecione a **categoria** acima da lista. A importação em lote começa com **Publicar ao salvar** desmarcado (rascunho); marque somente após testar.
5. Clique **Importar selecionados**, confirme e mantenha a janela aberta até terminar.
6. Confira salvos, duplicados e falhas; revise os cadastros no painel.

A extensão abre somente os links selecionados, captura o player quando reconhecido e usa a API existente. O backend exige player de provedor cadastrado e previne duplicados. Não adiciona automaticamente capas.

## Outras funções

A importação de temporadas, o envio rápido e o menu para adicionar um episódio continuam disponíveis, herdados da versão oficial.

## Limitações

- Não percorre páginas adicionais nem catálogos inteiros automaticamente.
- Não baixa vídeos, não remove DRM e não contorna bloqueios ou login.
- O reconhecimento de links é heurístico: exige revisão humana e permissão de uso do conteúdo.
- Usa envios sequenciais para respeitar o limite da API. Não feche a janela durante o lote.
- Instalar ou remover esta extensão não afeta a original. Entretanto, cadastros gravados no mesmo ACERVO são reais; **teste primeiro com 2 links em rascunho**.

## Testes manuais sugeridos

1. Importar 2 filmes em rascunho e verificar no painel.
2. Importar um dos mesmos links novamente e confirmar detecção de duplicados.
3. Selecionar um link sem player e observar o erro (nenhum cadastro falso).
4. Importar 2 episódios de uma temporada e conferir associação/números.

## Correções após o teste inicial

- Não espera mais a aba inteira ficar com status `complete` (imagens e recursos externos podem atrasar). Aguarda o documento estar acessível e diferencia o carregamento do ACERVO da página de origem.
- Faz tentativas breves de captura quando o player aparece com atraso.
- Ignora links de ordenação como **Data** e páginas de navegação `browse` na listagem.
- Coloca a categoria e o estado de publicação acima dos filmes, mantém as seleções manuais e mostra os erros próximos ao progresso.
- Após o lote, mantém marcados somente os itens com falha para uma nova tentativa; itens salvos ou duplicados não ficam marcados.
- A V2 continua em uma branch com Pull Request de rascunho. Teste com 2 vídeos, sem publicar, antes de tentar um lote maior.

## V2 1.1.0 — Capas automáticas da página original

Implementação isolada na branch feature/extensao-v2-capas-do-site. Sem TMDB e sem chave de API.

1. No catálogo, o importador procura o cartaz em cada cartão selecionado.
2. Se a imagem não estiver no cartão, procura metadados de imagem na página do filme.
3. Ao clicar em Importar selecionados, o navegador pode solicitar acesso aos domínios das páginas e imagens.
4. Após salvar cada novo filme, a extensão copia a imagem JPG, PNG ou WebP de até 4 MB para o armazenamento do ACERVO, sem confirmação individual.
5. Se a imagem estiver inacessível, o vídeo fica salvo com a capa padrão, e o relatório mostra quantas imagens foram aplicadas.
6. Duplicados não são alterados. A importação individual também tenta salvar a capa automaticamente.
7. Capa retrato aparece em 2:3; capa paisagem permanece 16:9.

### Para testar sem alterar produção

- Faça backup do banco e da mídia.
- Execute em instância isolada do Acervo com volumes separados e a migração 007_source_cover_aspect.sql.
- Recompile backend e frontend; recarregue a extensão na tela chrome://extensions.
- Confira a versão V2 · 1.1.0 CAPAS; importe inicialmente dois filmes como rascunho.
- Não faça merge ou implante em produção até conferir o resultado.

Somente reutilize imagens quando tiver direito ou autorização. A extensão não contorna logins, DRM ou bloqueios de CDN.
