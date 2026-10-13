# Blogger Video

As extensões `extension/` (2.2.5) e `extension-lotes/` (1.1.1) reconhecem
`https://www.blogger.com/video.g?token=...` em iframe, iframe com data-src,
links, HTML de incorporação em textarea/pre/code e na página do player.
A opção aparece como **Blogger Video**; os fluxos individual, revisão no
painel e lotes continuam usando os endereços completos.

## Atualizar uma instalação existente

1. Faça backup do banco e da mídia; preserve o arquivo `.env`.
2. Atualize o código e as dependências conforme sua instalação.
3. Aplique a migration **008_blogger_video.sql** pelo migrador existente.
   Em instalação Node, execute `npm run migrate` dentro de `backend/`,
   no mesmo ambiente que já fornece DATABASE_URL e a configuração do servidor.
4. Recompile o frontend (`npm run build` em `frontend/`) e reinicie a API
   e o serviço web pelo gerenciador já usado na instalação.
5. Recarregue a extensão instalada em `chrome://extensions` e confira a versão.

No Docker, `docker compose up -d --build` usa o serviço init para aplicar
a migration. Essa alternativa não pressupõe que seu servidor Android use Docker.
Não apague o banco, a mídia ou os volumes para atualizar.

## Uso e limites

- Importe a página autorizada pela extensão ou cole a URL completa do
  `src` em **Vídeo externo → URL de incorporação**. Não cole o HTML do iframe
  no campo de URL e não corte nem reconstrua o token.
- O provedor aparece automaticamente em Admin → Provedores e no player.
  Seu domínio é fixo em `https://www.blogger.com`, evitando encaminhar tokens
  para outro servidor. Outros provedores continuam com o comportamento anterior.
- O ACERVO preserva a query e o fragmento, armazena a referência e carrega o
  iframe original dentro do documento autenticado `/api/players/:id`.
  Não baixa o vídeo, não faz proxy do conteúdo e não renova tokens.
- Apenas um parâmetro `token` não vazio é aceito. URLs HTTP, domínios parecidos,
  outros caminhos, credenciais e portas não padrão são rejeitados.
- A detecção lê o DOM da página autorizada; não inspeciona iframes de terceiros
  por dentro nem contorna bloqueios. Um iframe criado com atraso pode precisar
  estar carregado antes da captura; a V2 já possui tentativas limitadas.
- Se o Blogger negar acesso/incorporação ou o token deixar de funcionar,
  obtenha um endereço autorizado atualizado. A aceitação pela API não garante
  disponibilidade do vídeo externo. Não compartilhe tokens em logs públicos.
- O progresso de players externos continua sem salvamento automático.

## Verificação

`cd backend && npm test` inclui migração sobre dados existentes, URL/token,
duplicados, edição, autorização, CSRF e detecção nas duas extensões.
`cd frontend && npm run build`, seguido de `cd ../backend && npm run test:browser`,
verifica formulário real, identificação, iframe/CSP e reprodução de uma mídia
de teste controlada. O teste não acessa os servidores reais do Blogger.

Teste final no dispositivo: importe um vídeo autorizado como rascunho, abra-o
como administrador, confira “Provedor: Blogger Video”, carregue o player e dê
play. Valide também no APK/TV; políticas do provedor e do WebView podem diferir.
