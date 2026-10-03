# Controle remoto no APK Android

O cursor virtual permite clicar em players externos que não recebem foco pelo controle remoto. As setas movem o cursor e OK/Enter gera um toque nativo na WebView, inclusive sobre um iframe de outra origem. O aplicativo não acessa o DOM do provedor.

## Como usar

1. Abra o aplicativo na Android TV ou no TV box.
2. Use as setas para posicionar o círculo verde em **Carregar vídeo externo** e pressione OK.
3. Aguarde o player carregar, posicione o círculo no Play do próprio player e pressione OK novamente.
4. Segure uma seta para mover mais rápido. Na borda superior/inferior, a seta rola a página principal.
5. O cursor desaparece após quatro segundos sem comandos e reaparece ao usar as setas.
6. MENU alterna entre cursor e navegação normal por foco. Também permite ativar o cursor em TV boxes que não se identificam como televisão. O modo é redefinido ao recriar a atividade.

O cursor é ativado automaticamente quando o Android identifica o dispositivo como televisão. No celular permanece desativado. Com o teclado virtual visível, as teclas seguem para a navegação normal. Voltar e volume mantêm o tratamento padrão. Quando a WebView é ocultada pelo fullscreen nativo, seus controles recebem as teclas normalmente.

## Gerar o APK no Windows

Esta mudança é nativa: atualizar Docker ou o site não atualiza o APK instalado.

Depois de incorporar a alteração no GitHub, abra PowerShell na pasta do projeto:

```powershell
cd C:\Users\Usuario\Documents\acervo-novo
git pull --ff-only
cd frontend
npm ci
npm run build
npx cap sync android
npx cap open android
```

Se essa pasta veio de um ZIP, baixe a versão atualizada do repositório em outra pasta e preserve sua configuração local do Capacitor, especialmente `server.url`. Não use `git pull` em uma pasta que não é um clone Git.

No Android Studio, aguarde a sincronização do Gradle e gere o APK pelo menu Build. Para uma atualização de um APK assinado, use **Generate Signed App Bundle / APK**, escolha APK e a mesma chave usada na instalação anterior. Ajuste `versionCode` em `frontend/android/app/build.gradle` para um número maior que o instalado, se necessário para seu fluxo de distribuição. Não desinstale o aplicativo como primeira tentativa de atualização.

Com o SDK e JDK já configurados, o APK de teste também pode ser gerado a partir de `frontend`:

```powershell
cd android
.\gradlew.bat assembleDebug
```

Saída: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`. Um APK debug não substitui uma instalação assinada com outra chave.

## Verificação na TV

- Na Home, mover o cursor, abrir um filme e rolar a página pelas bordas.
- Carregar o player externo e clicar no Play com OK. Confirmar áudio e imagem.
- Testar pausa, tela cheia e Voltar no player utilizado.
- Abrir um campo de texto e confirmar a navegação no teclado virtual.
- Testar MENU, volume e retorno ao aplicativo após colocá-lo em segundo plano.
- Confirmar que o toque no celular continua funcionando.

Como diagnóstico imediato, um mouse USB/Bluetooth conectado à TV pode confirmar se o Play funciona com um clique. Se nem com mouse o vídeo iniciar, investigue a compatibilidade do player com a WebView da TV, codecs e eventuais erros do provedor.

## Limites e validação

A implementação foi revisada no código, mas ainda não foi compilada com Android SDK nem executada em TV ou emulador no ambiente de desenvolvimento desta alteração. A validação acima é necessária antes de considerar a correção concluída.

O cursor resolve a interação por clique; não garante reprodução de todos os provedores, codecs ou DRM. Páginas externas continuam sujeitas às regras e à disponibilidade do provedor. Players em fullscreen nativo podem ter comportamento próprio. O cursor não implementa arrastar barras, gestos de pinça ou rolagem dentro de todos os elementos internos dos iframes.
