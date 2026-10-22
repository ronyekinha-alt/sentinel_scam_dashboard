# Sentinel Trade — painel e Telegram alinhados

O painel local e o scanner Telegram executam `sentinel-core.js`, com os mesmos indicadores, fontes, score e condições de entrada. Entre os setups disponíveis está o experimental **Double Oversold Bounce · 2H**. Ele apenas sinaliza uma oportunidade técnica: não envia ordens e exige validação humana.

## Abrir o painel

Execute `iniciar-painel.bat` ou `npm start` e abra http://127.0.0.1:4173. Node.js 20 ou superior; nenhuma dependência npm precisa ser instalada.

O diário e as preferências continuam no navegador. A integração privada MEXC permanece somente leitura; a API pública MEXC também pode fornecer pares e candles quando o ativo não estiver disponível na Binance.

## Padrão comum

- Score mínimo **90**, com opções **85** e **100**. Score mede confluência técnica, não probabilidade estatística de acerto.
- Top **1.000 por capitalização em cada fonte**, os setups selecionados e volume mínimo de **US$ 1 milhão** nas últimas 24h **do próprio par spot da corretora selecionada**.
- CoinGecko e CoinMarketCap selecionam o universo por capitalização: união dos top N de cada fonte, sem duplicar o mesmo par. A união pode exceder N; somente pares spot USDT negociáveis na Binance ou MEXC e com o volume mínimo são analisados. BTC/ETH continuam excluídos.
- CoinMarketCap usa a API pública oficial sem chave. O painel acessa pelo servidor local, pois a fonte não libera acesso direto do navegador. Cada sinal informa fonte e posição no ranking; símbolo duplicado dentro de uma fonte é ignorado nessa fonte para evitar atribuição ambígua.
- Se um ranking falhar, o outro mantém a busca com aviso de cobertura parcial. Se ambos falharem, a consulta é interrompida com erro explícito; não escolhe ativos por volume fora dos rankings. Estar no ranking não acrescenta pontos nem substitui a confirmação técnica.
- Candles fechados nativos de 1W, 1D, 4H, 2H e 1H: Binance prioritária (`data-api.binance.vision`); MEXC somente quando o par spot USDT não está negociável na Binance. Não troca a fonte por falha de consulta ou volume baixo. Todos os tempos do ativo usam a mesma corretora, com volume real em USDT do par. O horário da Binance fixa o instante de corte da consulta.
- Confirmação alinhada e crescente em 1D/4H/2H, com 1H alinhado e momentum positivo; contexto semanal sem euforia.
- Padrão comprador no gatilho: Engolfo de alta, Martelo comprador ou Rompimento de máxima (`pattern.bullish`).
- Controle de entrada esticada, stop abaixo dos três candles anteriores com margem ATR, risco máximo 8%, alvo 2R de ao menos 3%, resistência distante ao menos 2R e alvo adicional 3R.
- Um sinal por ativo, maior score; em empate, tendência e pullback confirmado têm prioridade. Até vinte sinais por consulta.
- Referência da restauração: pedido original em 07/10/2026 às 10h35 (Brasília); versão anterior registrada em 05/10/2026, commit `effcb067fb9c0129283cdb2262778d2325aa2ed8` do repositório Telegram. Os critérios técnicos de stop/TP retornaram à configuração anterior (8% de risco máximo, TP 2R mínimo de 3%); a interface, fontes atuais, limite de 20, deduplicação e bloqueios de sinal vencido foram preservados.
- Sinais MEXC usam SPOT 1×; não são convertidos em futuros Binance. O acompanhamento de preços do diário também consulta MEXC.
- Binance Futures é consultada pelos dois canais apenas para sugerir veículo/alavancagem até 3×. Se não qualificar ou estiver indisponível, preserva o setup SPOT já confirmado. Não executa ordens.
- Erros por ativo e consultas parciais são reportados. Falha em todas as consultas não é tratada como ausência legítima de sinais.

### Double Oversold Bounce · 2H

Setup experimental de reversão em sobrevenda. Só fica elegível quando todos os itens abaixo ocorrem em candles fechados:

- diário acima da EMA 80 ou em tendência ascendente;
- Stoch RSI do 2H em `≤ 5`;
- RSI 14 em `≤ 30` simultaneamente no 1H, 2H e 4H;
- candle comprador de 2H com pavio inferior de pelo menos 35% da amplitude, junto de EMA 22/80 ou suporte estático a até 2% do fechamento;
- ao menos 3% de espaço técnico até a próxima resistência.

Os níveis informativos são **stop de 4%** e **alvo de 8%** (R:R 2:1). O filtro de espaço técnico não prevê preço nem garante probabilidade: ele apenas evita alertas sem margem gráfica mínima para uma alta de 3%. O alerta continua como `EXPERIMENTAL · CONFIRME O GRÁFICO`; a execução, tamanho e alavancagem são decisões manuais.

## Telegram

O workflow existente continua no repositório `sentinel-trade-telegram`, com sua programação preservada. Secrets necessários: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

O score padrão é 90. O workflow manual permite selecionar 85, 90 ou 100; a variável de repositório `MIN_SCORE=100` configura o padrão da execução agendada. As escolhas locais do painel não alteram a variável do GitHub: use a mesma configuração nos dois para comparar os resultados.

Os alertas de navegador e Telegram usam a mesma regra de novidade: candle já notificado não é reenviado; para um novo candle, janela de 12h ou variação de entrada de pelo menos 1,5%. O histórico de envio é próprio de cada canal. Telegram não tem acesso às operações registradas no navegador; apenas o painel oculta ativos já em acompanhamento local. `force_alert` é uma exceção manual para teste e não deve ser ativado em comparações de deduplicação.

Mesmo motor e mesmas configurações produzem os mesmos setups **para os mesmos dados**. Consultas em horários diferentes, falhas temporárias de fonte ou históricos de notificações diferentes podem mudar quais alertas efetivamente aparecem.

## Backtest

Todos os setups históricos existentes, inclusive os experimentais EMA/RSI, rompimentos 30/60 e retestes com stop/alvo fixos, ficam em `sentinel-backtest.js`. O Double Oversold Bounce usa entrada no fechamento do candle de confirmação no estudo dedicado; demais simuladores podem usar a abertura seguinte conforme sua metodologia. O histórico só consulta candles macro que já fecharam no instante do sinal.

Pode executar o mesmo motor no Node, sem enviar Telegram:

```text
node backtest-cli.mjs SOLUSDT 2026-09-01 2026-09-29 trend 2h 90 resultado.json
```

Substitua `trend` pelo ID de qualquer setup histórico existente para simulá-lo. As variantes de stop/alvo fixo preservam os seus percentuais; não são convertidas artificialmente em 2R.

Simulações não incluem taxas, spread, slippage, funding, impostos ou liquidação real. Resultados históricos não garantem resultados futuros.

## Verificar

```text
npm run check
npm test
```

Os testes cobrem paridade navegador/Node, padrões compradores, score 90/100, volume do par, confirmação multi-tempo, risco, candles fechados, deduplicação, falhas de fontes e persistência de envio. Não enviam mensagens reais.

O motor e o backtest são distribuídos com conteúdo idêntico nos repositórios do painel e Telegram. Alterações nesses módulos devem ser publicadas e verificadas nos dois; o campo `engineVersion` identifica a versão em uso.

Referências: [ranking público CoinMarketCap](https://coinmarketcap.com/api/documentation/pro-api-reference/keyless-public-api), [API pública MEXC](https://mexcdevelop.github.io/apidocs/spot_v3_en/).

