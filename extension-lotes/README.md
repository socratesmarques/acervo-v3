# Enviar para ACERVO V2 — Importador em lotes (teste)

## Lista de páginas de filmes (catálogos ou filmes individuais)

Abra a extensão e selecione **Importar lista de links**. Cole até **50 endereços HTTPS**, um por linha. Cada endereço pode ser uma página com vários cartões de filmes (como `/filmes/pagina-1`) ou uma página individual (como `/filme/xyz`). Em página de catálogo, a extensão reutiliza o mesmo detector `movies.js` da opção **Importar filmes desta página**; em seguida, abre cada filme encontrado e captura o player com `extract.js`, gravando pelo endpoint já existente. Página individual com player é cadastrada diretamente.

A importação avança de página em página, exibindo filmes salvos, duplicados e falhas. Uma falha não interrompe o restante da lista. **Tentar novamente apenas as falhas** reprocessa somente URLs sem sucesso. A categoria escolhida se aplica a todos os filmes e o padrão é **rascunho**.

Os links candidatos são identificados de forma heurística, sem garantia de que todos sejam filmes. Faça um teste com uma listagem pequena antes de importar dezenas de páginas. A extensão solicita permissão para os domínios fornecidos; não ultrapassa login, DRM, proteções de iframe ou bloqueios dos servidores. Capas externas exigem permissão do próprio domínio da imagem e não impedem o cadastro do filme.

Testes automatizados: `node --test extension/test-links.mjs extension/test-movie-pages.mjs` a partir da raiz do repositório.

## Blogger Video (1.1.1)

Reconhece o iframe `https://www.blogger.com/video.g?token=...` como
**Blogger Video**, preservando a URL completa. Também reconhece `data-src`
e HTML de incorporação copiado na página. Atualize o servidor com a migration
008 e recarregue esta extensão. Veja [uso, atualização e testes](../docs/blogger-video.md).
O player original é incorporado, sem baixar vídeos ou contornar restrições.

Esta pasta é uma **segunda extensão** baseada na versão 2.2.4 do importador original. A versão oficial continua na pasta `extension/`, e também recebeu a importação de listas de páginas. Chrome/Edge tratará a nova extensão como independente, com armazenamento e permissões separados.

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

A extensão abre somente os links selecionados, captura o player quando reconhecido e usa a API existente. O backend exige player de provedor cadastrado e previne duplicados. Capas são tentadas automaticamente quando o domínio da imagem já está autorizado.

## Outras funções

A importação de temporadas, o envio rápido e o menu para adicionar um episódio continuam disponíveis, herdados da versão oficial.

## Limitações

- Percorre somente as páginas inseridas na lista; não encontra automaticamente links de paginação nem catálogos inteiros.
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
