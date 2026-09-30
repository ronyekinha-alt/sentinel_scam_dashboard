# Sentinel Trade — painel e Telegram alinhados

O painel local e o scanner Telegram executam `sentinel-core.js`, com os mesmos indicadores, fontes, score e condições de entrada. Setups ao vivo: **Tendência + pivô** e **Pullback 2H + confirmação 4H**.

## Abrir o painel

Execute `iniciar-painel.bat` ou `npm start` e abra http://127.0.0.1:4173. Node.js 20 ou superior; nenhuma dependência npm precisa ser instalada.

O diário e as preferências continuam no navegador. A integração privada MEXC permanece somente leitura e não entra na seleção dos sinais.

## Padrão comum

- Score mínimo **90**, com opção **100**. Score mede confluência técnica, não probabilidade estatística de acerto.
- Até **1.000 ativos**, ambos os setups e volume mínimo de **US$ 1 milhão** nas últimas 24h **do próprio par spot Binance**.
- CoinGecko é usado apenas para ranking por market cap. Quando indisponível, ambos usam o ranking por volume Binance e informam o fallback.
- Candles fechados nativos de 1W, 1D, 4H, 2H e 1H na mesma fonte Binance (`data-api.binance.vision`). O horário da Binance fixa o instante de corte da consulta.
- Confirmação alinhada e crescente em 1D/4H/2H, com 1H alinhado e momentum positivo; contexto semanal sem euforia.
- Padrão comprador no gatilho: Engolfo de alta, Martelo comprador ou Rompimento de máxima (`pattern.bullish`).
- Controle de entrada esticada, stop abaixo dos três candles anteriores com margem ATR, risco máximo 8%, alvo 2R de ao menos 3%, resistência distante ao menos 2R e alvo adicional 3R.
- Um sinal por ativo, maior score; Tendência vence empate entre os dois setups do mesmo ativo. Até dez sinais por consulta.
- Binance Futures é consultada pelos dois canais apenas para sugerir veículo/alavancagem até 3×. Se não qualificar ou estiver indisponível, preserva o setup SPOT já confirmado. Não executa ordens.
- Erros por ativo e consultas parciais são reportados. Falha em todas as consultas não é tratada como ausência legítima de sinais.

## Telegram

O workflow existente continua no repositório `sentinel-trade-telegram`, com sua programação preservada. Secrets necessários: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`.

O score padrão é 90. O workflow manual permite selecionar 90 ou 100; a variável de repositório `MIN_SCORE=100` configura o padrão da execução agendada. As escolhas locais do painel não alteram a variável do GitHub: use a mesma configuração nos dois para comparar os resultados.

Os alertas de navegador e Telegram usam a mesma regra de novidade: candle já notificado não é reenviado; para um novo candle, janela de 12h ou variação de entrada de pelo menos 1,5%. O histórico de envio é próprio de cada canal. Telegram não tem acesso às operações registradas no navegador; apenas o painel oculta ativos já em acompanhamento local. `force_alert` é uma exceção manual para teste e não deve ser ativado em comparações de deduplicação.

Mesmo motor e mesmas configurações produzem os mesmos setups **para os mesmos dados**. Consultas em horários diferentes, falhas temporárias de fonte ou históricos de notificações diferentes podem mudar quais alertas efetivamente aparecem.

## Backtest

Todos os setups históricos existentes, inclusive os experimentais EMA/RSI, rompimentos 30/60 e retestes com stop/alvo fixos, ficam em `sentinel-backtest.js`. Os experimentais permanecem exclusivamente em simulação, conforme solicitado. As duas estratégias oficiais usam os filtros e score do motor ao vivo. O histórico só consulta candles macro que já fecharam no instante do sinal; a entrada simulada ocorre no candle seguinte.

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
