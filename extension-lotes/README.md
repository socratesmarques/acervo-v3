# Enviar para ACERVO V2 — Importador em lotes (teste)

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

## Novidade 1.1.0

O botão Capas TMDB abre Admin → Capas TMDB no site, onde o administrador pesquisa e aprova pôsteres verticais para os filmes sem capa. Esta função exige configurar TMDB_READ_ACCESS_TOKEN no servidor e publicar o frontend/backend correspondente. As capas não são aplicadas sem confirmação.
