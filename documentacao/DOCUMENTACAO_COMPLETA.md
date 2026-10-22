# Sentinel Trade Documentacao Completa

> Estado documentado: 18 de outubro de 2026  
> Motor: `2026-10-18-governance-risk-v2`  
> Finalidade: ferramenta educacional de leitura tecnica. O Sentinel Trade nao envia ordens, nao movimenta fundos e nao substitui validacao humana, gerenciamento de risco ou orientacao financeira profissional.

## 1. Escopo e principios

O Sentinel Trade possui dois produtos que usam o mesmo motor de analise: o dashboard local e o scanner de Telegram. O objetivo e procurar configuracoes tecnicas em pares spot USDT, mostrar o raciocinio do sinal e permitir que a decisao e a execucao sejam manuais.

- Apenas candles fechados entram em qualquer decisao. Vela em formacao nunca cria sinal.
- Um setup pode ser tecnicamente valido e ainda assim ser rejeitado por entrada tardia, risco, resistencia/suporte, score ou distancia do preco atual.
- Score e classificacoes visuais medem confluencia; nao sao probabilidade garantida de acerto.
- O painel e o Telegram devem executar o mesmo `sentinel-core.js`, na mesma versao, para os mesmos dados e configuracoes.
- Backtest e simulacao historica; inclui a friccao configurada, mas nao garante repeticao futura.

## 2. Componentes e responsabilidade dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `index.html` | Estrutura visual do dashboard e seus controles. |
| `app.js` | Scanner no navegador, renderizacao, buscador RSI, diario local, alertas e tela de backtest. |
| `sentinel-core.js` | Motor compartilhado: indicadores, filtros, setups, score, risco, ranking, universo, deduplicacao e veiculo. |
| `telegram-scanner.mjs` | Execucao agendada, mensagens de setups, watchlist RSI e deduplicacao persistente. |
| `server.js` | Servidor local e proxy; integra a MEXC privada somente para leitura. |
| `sentinel-backtest.js` e `backtest-*.mjs` | Estudos e simulacoes historicas. |
| `tests/parity.test.cjs` | Testes de paridade e seguranca do motor. |
| `signal-state.json` | Estado local do Telegram para impedir reenvio indevido. |

Existem dois repositorios publicados: `sentinel_scam_dashboard` e `sentinel-trade-telegram`. Arquivos compartilhados, especialmente `sentinel-core.js`, precisam ser publicados de forma identica nos dois. Alteracoes apenas visuais pertencem ao dashboard.

## 3. Fontes, contingencia e universo

| Fonte | Papel atual |
|---|---|
| Binance Data API | Fonte prioritaria de candles, preco, volume e horario de corte. O motor tenta USDT e, se necessario, USDC. |
| api.binance.com | Contingencia do Telegram quando `data-api.binance.vision` falha; duas tentativas por endereco. |
| OKX Spot publica | Primeiro fallback de candles e volume. Aceita USDT e USDC, com 1H, 2H, 4H, diario e semanal nativos. |
| MEXC Spot publica | Segundo fallback quando o par nao esta negociavel nas fontes anteriores. Aceita USDT e USDC; busca 1H, 4H, diario e semanal e agrega 1H fechado em 2H localmente. |
| Coinbase Advanced Trade | Fallback final, somente para pares USDT/USDC elegiveis e com candles suficientes. |
| CoinGecko e CoinMarketCap | Ranking e capitalizacao para montar o universo. |
| MEXC privada | Saldo, fills, ordens e posicoes somente leitura, via servidor local. |

CoinGecko e CoinMarketCap continuam sendo fontes de ranking, nao de candles. A ordem de mercado ativa e **Binance -> OKX -> MEXC -> Coinbase**. Dentro de cada corretora, USDT tem preferencia e USDC e usado somente quando USDT nao esta valido.

Selecao do universo:

1. Consulta as fontes de ranking, une candidatos e remove duplicidades.
2. Procura um par spot valido na ordem Binance, OKX, MEXC e Coinbase; em cada fonte testa primeiro USDT e depois USDC.
3. Escolhe **uma unica corretora e um unico par** por ativo e usa essa mesma serie de candles em todos os tempos. Nunca mistura 1H de uma corretora com 4H de outra.
4. Aplica volume minimo configurado ao proprio par e a propria corretora.
5. Exclui BTC, ETH, moedas estaveis e valores sem par valido.
6. Aplica filtro de cripto nativa antes do scanner e da watchlist RSI.

O bloqueio de TradFi tokenizado usa classe/descricao e uma lista explicita para tickers inequivocos: `KORUB`, `SOXLB` e `TSLAB`. Tickers genericos nao sao bloqueados apenas por nome para evitar excluir projetos cripto legitimos. Configuracoes validas: top de 1 a 700, score `0`, `85`, `90` ou `100`, volume `0`, US$1 mi, US$2 mi ou US$5 mi, desvio maximo de entrada de 0% a 5%, R:R minimo de 1R a 2R e maximo de 20 sinais.

## 4. Candles, indicadores e estruturas

Tempos nativos: 1W, 1D, 4H, 2H e 1H. O setup RSI tambem forma 8H a partir de candles 1H fechados. O corte usa horario Binance; registros invalidos ou ainda abertos sao descartados.

| Medida | Regra e uso |
|---|---|
| EMA 8 e EMA 9 | Timing, recuperacao e distancia de entrada. |
| EMA 22 | Tendencia intermediaria, reteste e inclinacao. |
| EMA 51 e EMA 80 | Estrutura maior e contexto flexivel dos setups existentes. O Setup 4 usa explicitamente EMA 52, sem reutilizar a EMA 51. |
| EMA 200 | Radar de regime no 4H e Diario; exposta no sinal para leitura humana, sem bloquear isoladamente um setup. |
| VWAP semanal | Media ponderada por volume ancorada no inicio da segunda-feira UTC, usada no setup experimental de rompimento e reteste. |
| Bollinger 20/2 e Keltner 20/1,5 ATR | Medem squeeze; a liberacao do squeeze e apenas confluencia adicional no setup VWAP. |
| CVD proxy | Delta acumulado de volume tomador quando a corretora fornece taker-buy volume; sem esse dado, e uma aproximacao por direcao do candle e nunca uma alegacao de fluxo institucional confirmado. |
| RSI 14 | Momentum, sobrevenda, euforia e janela de entrada. |
| MACD 12/26/9 | Histograma e confirmacao de momentum. |
| ADX 14 | Tendencia forte a partir de 18. |
| ATR 14 | Margem tecnica de stop e extensao semanal. |
| Stoch RSI | Recuperacao de pullback diario. |
| Volume relativo | Volume do candle dividido pela media de 20 candles. |
| Taker buy volume | Quando disponivel, mede dominio comprador; quando ausente, estima por candle/volume. |

**Alinhado:** fechamento > EMA9 > EMA22 > EMA51 > EMA80. **Ascendente:** EMA22 atual > EMA22 de tres candles atras. **Momentum positivo:** RSI entre 50 e 72 e MACD positivo. **Padrao comprador:** engolfo de alta, martelo comprador ou rompimento de maxima em candle verde. **Pivo comprador:** fundos locais ascendentes e fechamento acima da maxima local, em janela de 42 candles. Suporte/resistencia usam pivots em janela de 55 candles.

## 5. Contexto macro, entradas e risco

A confirmacao macro padrao exige 1D, 4H e 2H alinhados/ascendentes, mais 1H alinhado com momentum. A extensao semanal bloqueia compras com combinacao de RSI elevado, alta excessiva desde minima de 12/26 semanas, distancia grande da EMA22 ou proximidade de maxima anual com euforia.

Entrada tardia bloqueia compra com distancia excessiva da EMA9, subida recente acima de 11%, RSI >=68 ou sem pullback perto das EMAs 9/22. O sinal tambem e rejeitado se o preco atual ja estiver no stop, TP2, acima de metade do caminho ao TP2, fora da distancia configurada ou sem preservar R:R minimo.

Para LONG, stop padrao = menor minima dos tres candles anteriores - 0,12 ATR. `R = entrada - stop`; TP2 = entrada + 2R; TP3 = entrada + 3R. Para SHORT, stop = maior maxima dos tres candles anteriores + 0,12 ATR e alvos sao subtraidos. Risco acima de 8%, TP2 menor que 3% ou resistencia/suporte sem espaco invalida o sinal.

## 6. Setups ativos

### 6.1 Tendencia mais pivo `trend`

Gatilhos 1H, 2H ou 4H. Semanal acima da EMA22 e sem euforia; diario acima da EMA51 e RSI >=48; 4H, 2H e gatilho acima da EMA51; RSI do gatilho >=46; pivo ou padrao comprador; volume >=0,9; macro confirmado.

### 6.2 Pullback 2H com confirmacao 4H `aggressive-pullback`

Gatilhos 1H, 2H ou 4H. Diario acima da EMA51, RSI >=45 e MACD nao negativo; 4H alinhado/ascendente; 1H acima da EMA51 com minima recente ate 2% da EMA9/EMA22 e padrao/pivo; 2H acima da EMA51 com confirmacao; dominio comprador ou volume >=0,9 no 1H.

### 6.3 Pullback 2H diario flexivel `flexible-pullback-2h`

Somente 2H. Diario >= EMA80, RSI >=40 e MACD nao negativo; semanal saudavel, 4H alinhado/ascendente, 2H acima da EMA51, 1H alinhado/momentum e recuperacao de pullback proxima das medias.

### 6.4 Cruzamento EMA9 e reteste `ema-cross-retest-2h`

Somente 2H. EMA9 cruza acima de EMA22 e EMA52 em ate dez candles; reteste da EMA22 ate 1,8% ou EMA52 ate 2,5%; o candle de reteste precisa ter pavio inferior de pelo menos 30% de seu range; fechamento acima da maxima recente em candle comprador; macro semanal/diario/4H favoravel; volume >=1x; RSI 50-72; alta de sete candles <=11%.

### 6.5 Compressao e expansao antecipada `compression-expansion-1h`

Somente 1H. Base de 18 candles com amplitude <=12%, rompimento de maxima da base ate 4,5%, candle verde fechado na parte superior do range (>=58%), volume >=1,5x, preco acima de EMA8/EMA22, EMA8 subindo e RSI cruzando acima de sua media entre 48/68. Diario deve estar perto/acima da EMA80 e 4H perto/acima da EMA80, ambos com RSI >=42. Requer confirmacao visual.

### 6.6 Recuperacao RSI e EMA `rsi-ema-recovery`

Experimental; 1H, 2H, 4H e 8H. RSI cruzou para <=30 no passado; EMA8 cruza acima de EMA22 e EMA80 agora. Espera minima: 8 dias apos um toque RSI, ou 7 dias com dois ou mais toques. Preco a no maximo 3% da EMA8, RSI <=72, diario acima de 90% da EMA80, semanal nao bloqueado e minima desde o toque como base de stop. E `WATCH`, nao entrada validada automatica.

### 6.7 Double Oversold Bounce `double-oversold-bounce`

Experimental; somente 2H e sempre em candle fechado. O macro aceita o diario acima da EMA80 ou com tendencia ascendente. O gatilho exige Stoch RSI 2H <=5, RSI 14 <=30 simultaneamente em 1H, 2H e 4H, candle 2H comprador com pavio inferior de pelo menos 35% da amplitude e proximidade de ate 2% da EMA22/EMA80 do 2H, EMA80 diaria ou suporte estatico. Tambem exige no minimo 3% de espaco tecnico ate a proxima resistencia; isso e filtro de estrutura, nao previsao de probabilidade.

Os niveis informativos sao stop fixo de 4% e alvo de 8% (R:R 2:1), com teto tecnico de 3x informado pelo motor. O sinal fica em `WATCH` e exige confirmacao humana. Nao envia ordem, nao garante acerto e pode ficar mais raro devido a sobrevenda simultanea nos tres tempos.

### 6.8 Short por tendencia baixista e rompimento `bearish-breakdown`

Gatilhos 1H, 2H ou 4H. Diario, 4H e 2H abaixo de EMAs, com EMA9 < EMA22 < EMA51 e MACD negativo; gatilho conserva pilha baixista. RSI 32-62, volume >=1,05x e rompimento fechado de minima recente ou padrao vendedor. SHORT exige futuros; nunca ha envio de ordem.

### 6.9 VWAP semanal: rompimento e primeiro reteste `vwap-retest-1h-2h`

Experimental; 1H ou 2H. A VWAP inicia na segunda-feira UTC. O preco precisa romper para cima, realizar o primeiro reteste nos tres candles anteriores, fechar com padrao comprador e volume relativo >=1,5x. Diario deve estar proximo/acima da EMA80, 4H acima da EMA51 e RSI 4H >=45. Squeeze liberado e CVD proxy crescente somam confluencia, mas o setup fica em `WATCH` ate validacao historica independente.

## 7. Score, prioridade e veiculo

Scores iniciais: tendencia 58; pullbacks 60; cruzamento/reteste 90; compressao 85; recuperacao RSI 90 ou 92 com dois toques; short 70. Pontos adicionais incluem momentum diario/4H/2H, padrao, pivo, volume >=1,25x, ADX >=18 e criterios exclusivos. O teto e 100 e o score precisa passar no filtro selecionado.

Por ativo, `consolidate` mantem o melhor sinal. O desempate considera score, qualidade de entrada, estrategia e ordem alfabetica. O motor consulta futuros Binance apenas para recomendar veiculo. LONG normalmente e SPOT 1x; futuros requerem macro, score/volume e dados derivativos disponiveis. Com politica de risco, risco >4% restringe a SPOT; SHORT informa FUTURES, teto tecnico de 2x.

### Governanca de mercado e derivativos

Antes de liberar qualquer LONG de altcoin, o motor consulta BTCUSDT em candles fechados de 4H. Ha veto sistemico quando `fechamento BTC < EMA22` **e** (`histograma MACD < 0` **ou** `RSI < 48`). O veto bloqueia LONGs; SHORTs continuam com suas regras proprias. O dashboard registra literalmente: **“Veto Sistêmico Ativo: BTC em tendência de baixa intradiária”**.

Para cada LONG qualificado, o motor consulta o perpétuo Binance: funding atual e historico de open interest em 4H. Funding acima de `+0,05%` bloqueia o LONG. Funding entre `-0,01%` e `+0,01%` mais OI crescente em 4H acrescenta cinco pontos, exibidos no Telegram. Falha de dados derivativos nao e tratada como confluencia: o sinal fica SPOT e recebe aviso tecnico.

Gestao sugerida de posicao, informativa e sem envio de ordem: ao atingir 1R, stop em breakeven; depois de 2R, o restante rumo a 3R usa stop na menor minima dos dois candles 4H mais recentes. O painel/Telegram informam a regra; a execucao permanece manual.

## 8. Dashboard e buscador RSI

O dashboard local oferece filtros de universo, score, volume, atualizacao, alertas e estrategias. Mostra auditoria por ativo para separar rejeicao tecnica de falha de fonte. A tabela possui cabecalho fixo e entrada, stop, TP2/TP3 e botao de acompanhamento. Trades manuais, preferencias e alertas ficam no `localStorage`; nao sao enviados ao Telegram.

O buscador RSI usa cripto nativa, tempos Diario/8H/4H/2H/1H e ordenacao por maior sobrevenda intradiaria (8H, 4H, 2H, 1H), RSI mais baixo e capitalizacao. Pressao usa 20 candles 1H: comprador forte quando compra supera venda em mais de 8%, vendedor forte no inverso e equilibrada nos demais casos. Cores: comprador verde claro, vendedor vermelho claro, equilibrada azul, observacao laranja e texto escuro.

**Zona de suporte forte** e informativa: RSI diario <=35 e preco ate 3% do suporte diario. **Zona de compra:** RSI 2H <=30, RSI 1H <=35 e pressao nao vendedora. **Potencial de repique:** RSI diario <=35 ou 4H <=28 com 2H <=32. Nenhuma dessas etiquetas cria ordem.

## 9. Telegram

O Telegram envia setups em blocos de ate tres: par real utilizado (inclusive USDC quando aplicavel), direcao, setup, tempo, score, fonte, ranking, entrada, limite de entrada, stop, TP2/TP3 e resumo tecnico. Segredos: `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`. Variaveis: `MIN_SCORE`, `SCANNER_STRATEGY`, `MIN_VOLUME`, `ASSET_LIMIT`, `FORCE_ALERT`, `DELIVERY_DIAGNOSTICS`, `SEND_OVERSOLD_WATCHLIST` e `OVERSOLD_LIMIT`.

Deduplicacao: uma vela enviada nao e nova; reenvio exige 12 horas ou mudanca de entrada >=1,5%. O estado dura sete dias. Diagnostico opcional informa quando havia sinais, mas todos ja tinham sido notificados.

Com `SEND_OVERSOLD_WATCHLIST`, a lista RSI e enviada apenas se nao houver sinais frescos. Requisitos: top 400, cripto nativa, RSI <=30 em dois ou mais tempos, suporte forte, potencial de repique e comprador mais forte. A ordem replica o dashboard; cada mensagem tem ate quatro ativos e separadores visiveis. Sem elegiveis, envia mensagem explicativa.

## 10. Backtest e estudo estrutural

Backtests usam dados disponiveis ate o gatilho; entrada e na abertura seguinte. Se stop e alvo ocorrem no mesmo candle, o stop vence. Trades abertos nao contam no acerto. Por padrao, cada trade fechado desconta 0,25%: taxa taker de 0,075% na entrada, 0,075% na saida, slippage de 0,05% na entrada e 0,05% na saida. Os parametros sao configuraveis; funding, imposto, liquidez real, latencia e liquidacao continuam fora do modelo.

O estudo estrutural de 18/10/2026 avaliou NEAR, ORCA, RAY, LINK e TAO, R$200 por ativo, capital separado, reinvestimento, 2x e alvos 5%, 10% e 15%. A entrada exigiu EMA8/22 favoravel, candle comprador, RSI em recuperacao, volume minimo e fundos ascendentes; stop no ponto medio entre os dois ultimos fundos; alvo >=2R.

Em 180 dias: 1H/10% terminou em R$1.843 a partir de R$1.000; 1H/15% em R$2.383; 2H/10% em R$1.222; 2H/15% em R$1.644; 4H/15% em R$1.434. Sao simulacoes, nao regra ativa. Aplicando a definicao atual de suporte forte houve somente um trade elegivel (LINK 1H) em 180 dias; nao ha amostra para afirmar melhora. O filtro a estudar e “tocou suporte diario nos ultimos 7 a 10 dias e confirmou recuperacao”, nao obrigatoriamente RSI diario <=35 na entrada.

## 11. MEXC privada e seguranca

MEXC privada e somente leitura: fills spot, historico de futuros, posicoes fechadas, stops, saldo e posicoes abertas. Atualizacao de posicoes e polling a cada 20 segundos quando habilitada, nao streaming. Criar chave exclusiva de leitura, sem saque, transferencia, trading ou alteracao de margem; usar restricao de IP quando possivel. Se o usuario optar por lembrar chaves, elas ficam no `localStorage` sem criptografia; usar computador protegido e esquecer chaves ao final.

## 12. Operacao, testes e manutencao

Iniciar: `iniciar-painel.bat` ou `npm start`, depois `http://127.0.0.1:4173`. Validar: `npm run check` e `npm test`; os testes nao enviam Telegram real.

Antes de ativar regra nova: implementar no motor compartilhado, cobrir com teste de paridade, comparar ativos e janelas relevantes, medir quantidade de trades e retorno - nao apenas acerto -, validar paridade dashboard/Telegram e publicar o motor nos dois repositorios. A regra estrutural 1H/2H permanece em validacao e nao e setup de producao.

## 13. Diretrizes de engenharia e prompt de implementacao vigente

### Diretrizes obrigatorias

1. `sentinel-core.js` e a unica fonte de verdade para calculos, setups, risco, score e veto. `app.js` apenas apresenta seu retorno; `telegram-scanner.mjs` apenas agenda, deduplica e formata o mesmo retorno.
2. Nenhum candle aberto, cotacao em tempo real ou dado futuro pode influenciar uma decisao historica. Toda consulta usa corte de horario e candles fechados.
3. Dados indisponiveis nao podem virar confirmacao: funding/OI/CVD ausente retira a confluencia; nao pode ser substituido por zero ou por afirmacao institucional.
4. Uma protecao que bloqueie LONG precisa ser auditavel por ativo e visivel no resumo do dashboard. Falha de fonte deve ser distinguida de rejeicao tecnica.
5. Todo ajuste de setup exige teste Node x navegador, teste de borda e atualizacao de versao/documentacao. Backtest nao autoriza automaticamente uma regra de producao.
6. O motor nao envia ordens. Sinais, targets e stops sao referencias analiticas; a decisao, tamanho da posicao e execucao sao humanos.
7. Uma fonte alternativa aumenta cobertura, nao confirma um setup por si so. Se nao houver candles fechados suficientes em todos os tempos da mesma fonte, o ativo falha a consulta e a auditoria deve mostrar a falha.

### Prompt consolidado usado nesta revisao

> Voce e o engenheiro quantitativo senior responsavel pelo Sentinel Trade. Implemente melhorias de governanca, blindagem de risco e filtros no motor compartilhado, preservando paridade total entre dashboard e Telegram. Padronize o Setup 4 em EMA 22/52; aplique veto de LONG para altcoins quando BTC 4H fechar abaixo da EMA22 e MACD negativo ou RSI menor que 48; consulte funding e OI 4H do perpétuo Binance, bloqueando funding acima de +0,05% e somando +5 somente para funding entre -0,01% e +0,01% com OI crescente. No backtest, desconte 0,25% por trade fechado composto por taxas taker e slippage configuraveis. Para tendencias, documente breakeven em 1R e trailing do restante apos 2R; para pullbacks, exija secagem de venda no candle anterior; para EMA cross, exija pavio inferior minimo de 30%. Adicione VWAP semanal rompimento/reteste como setup experimental e trate CVD e squeeze Bollinger/Keltner como confluencias transparentes, nao como promessa. Atualize testes de paridade, versao semantica e documentacao; valide sintaxe e testes antes de publicar ou disparar o scanner.

