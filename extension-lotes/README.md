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
4. Selecione uma **categoria**. Na primeira execução, deixe **Publicar ao salvar** desmarcado.
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
