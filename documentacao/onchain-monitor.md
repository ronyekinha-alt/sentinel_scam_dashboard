# Monitor on-chain do Sentinel

Publicado em 25/10/2026. Somente fontes públicas sem chave: Blockscout e RPC Ethereum dRPC, com fallback Blockscout. LINK e AAVE, até oito carteiras por ativo. Descoberta por amostra de titulares e transferências recentes: cobertura parcial, sem identificação garantida dos proprietários.

O coletor onchain-public.cjs consulta balanceOf em blocos históricos de 1, 7, 30 e 90 dias e compara quantidades. Aplica a mesma cotação indicativa às duas pontas para separar crescimento da posição de valorização. Dados ausentes nunca viram zero. Contratos e entidades reconhecidas por rótulos públicos são excluídos da amostra.

O workflow público onchain-monitor.yml agenda coleta nos minutos 8 e 38; o GitHub pode atrasar execuções. O painel lê o relatório e atualiza a exibição a cada minuto. Não é varredura universal nem tempo real por bloco.

O workflow existente no repositório privado sentinel-trade-telegram consulta o relatório nos minutos 17 e 47 e utiliza os segredos já existentes. Envia no máximo cinco alertas por execução, deduplicados por carteira, ativo e dia, apenas após confirmação do Telegram. Limiar inicial: aumento mensal de pelo menos 10% (ou nova posição), equivalente a US$100 mil a preço constante. Relatório com mais de 24h não envia alertas.

Aumento de saldo não comprova compra, intenção, informação privilegiada nem futura valorização. Pode decorrer de transferência própria, custódia, empréstimo ou recompensa. Compras/vendas DEX ainda não são decodificadas. O calendário de desbloqueios está vazio: ausência de evento cadastrado não significa ausência de desbloqueios. Não há previsão automática confiável de queda.

A coleta pesada usa runner padrão de repositório público e nenhum segredo. O envio acrescenta uma etapa curta à rotina privada já existente, sujeita à disponibilidade da cota gratuita dessa conta. Nenhum plano pago foi contratado. Nenhuma ordem financeira é executada.

Validação local: 13 testes on-chain e 48 testes do motor aprovados. Coleta real inicial: 16 carteiras com saldos atuais e históricos de 30 dias disponíveis. Entrega real do Telegram deve ser confirmada pelo histórico da execução, não pelos testes simulados.
