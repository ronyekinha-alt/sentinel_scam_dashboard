import streamlit as st
import pandas as pd
import ta
import ccxt
import json
import os
from datetime import datetime

# ---------------------------------------------------------
# CONFIGURAÇÃO DE PÁGINA E ESTILO DARK CYBERPUNK (CYAN/NEON)
# ---------------------------------------------------------
st.set_page_config(page_title="Radar Cripto - Análise Quantitativa", layout="wide")

st.markdown("""
    <style>
    /* Fundo Escuro Principal */
    .stApp {
        background-color: #0B0E14 !important;
        color: #E0E6ED !important;
    }
    
    /* Esconder Barra Lateral Padrão se Desejar */
    [data-testid="stSidebar"] {
        background-color: #121824 !important;
        border-right: 1px solid #1E293B;
    }

    /* Cards e Containers com Borda Neon Ciano */
    div[data-testid="stMetric"], .css-card {
        background-color: #121824 !important;
        border: 1px solid #00F2FE !important;
        box-shadow: 0px 0px 10px rgba(0, 242, 254, 0.15) !important;
        border-radius: 8px !important;
        padding: 10px !important;
    }

    /* Botões em Neon Verde/Ciano */
    .stButton>button {
        background: linear-gradient(90deg, #00F2FE 0%, #4FACFE 100%) !important;
        color: #0B0E14 !important;
        font-weight: bold !important;
        border: none !important;
        border-radius: 6px !important;
        box-shadow: 0px 0px 8px rgba(0, 242, 254, 0.4) !important;
    }

    /* Títulos em Tom Ciano/Verde */
    h1, h2, h3, h4 {
        color: #00F2FE !important;
        font-family: 'Trebuchet MS', sans-serif;
    }
    
    /* Subtextos e Labels */
    .stMarkdown p {
        color: #94A3B8;
    }
    </style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------
# CONEXÃO EXCHANGE (SOMENTE CRIPTOMOEDAS USDT)
# ---------------------------------------------------------
@st.cache_resource
def get_exchange():
    return ccxt.binance({'enableRateLimit': True})

exchange = get_exchange()

@st.cache_data(ttl=600)
def fetch_crypto_symbols():
    try:
        markets = exchange.load_markets()
        symbols = []
        # Excluir ativos alavancados, commodities e metais não-cripto
        blacklisted = ['UP/', 'DOWN/', 'BEAR/', 'BULL/', 'PAXG/', 'XAU/', 'XAG/', 'EUR/', 'GBP/']
        for s in markets:
            if s.endswith('/USDT') and not any(b in s for b in blacklisted):
                symbols.append(s)
        return sorted(symbols)
    except Exception:
        return ["BTC/USDT", "ETH/USDT", "SOL/USDT", "ONDO/USDT", "NEAR/USDT", "API3/USDT", "TAO/USDT", "JTO/USDT"]

symbols = fetch_crypto_symbols()

# ---------------------------------------------------------
# PERSISTÊNCIA LOCAL (BANCO DE TRADES)
# ---------------------------------------------------------
DB_FILE = "trades_diario.json"

def load_trades():
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"open": [], "closed": []}

def save_trades(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

trades_db = load_trades()

# ---------------------------------------------------------
# CABEÇALHO DO PAINEL
# ---------------------------------------------------------
col_head1, col_head2 = st.columns([3, 1])
with col_head1:
    st.caption("ANÁLISE QUANTITATIVA - SPOT")
    st.title("Radar Cripto")
    st.write("Uso educacional: o painel identifica condições técnicas, não oferece recomendação financeira nem me executa ordens.")

with col_head2:
    st.write("")
    if st.button("🔄 Atualizar scanner"):
        st.cache_data.clear()
        st.rerun()

# ---------------------------------------------------------
# FILTROS E PARÂMETROS SUPERIORES
# ---------------------------------------------------------
st.markdown("---")
f1, f2, f3, f4 = st.columns(4)

with f1:
    num_ativos = st.selectbox("Ativos a analisar", [20, 50, 100, 200], index=1)
with f2:
    score_min = st.slider("Score mínimo", 50, 90, 68)
with f3:
    timeframe_input = st.selectbox("Tempo Gráfico Principal", ["15m", "1h", "4h", "1d"], index=2)
with f4:
    rr_target = st.selectbox("Risco : Retorno (R:R Target)", [2.0, 3.0, 4.0], index=0)

# ---------------------------------------------------------
# MÉTRICAS RESUMIDAS
# ---------------------------------------------------------
m1, m2, m3, m4, m5 = st.columns(5)

open_count = len(trades_db["open"])
closed_count = len(trades_db["closed"])
gains = len([t for t in trades_db["closed"] if t.get("result") == "GAIN"])
win_rate = (gains / closed_count * 100) if closed_count > 0 else 0.0

m1.metric("Setups atuais", f"{len(symbols[:num_ativos])} Ativos")
m2.metric("Entradas registradas", open_count)
m3.metric("Taxa de acerto", f"{win_rate:.1f}%")
m4.metric("Trades Fechados", closed_count)
m5.metric("Gains / Losses", f"{gains}G / {closed_count - gains}L")

# ---------------------------------------------------------
# OPORTUNIDADES ATUAIS - SETUPS QUALIFICADOS
# ---------------------------------------------------------
st.markdown("---")
st.subheader("OPORTUNIDADES ATUAIS - Setups Qualificados")
st.caption("Confluência de Indicadores: Trend (EMA 8/21/50/100) + Momentum (RSI) + Estrutura")

col_sel, col_info = st.columns([1, 2])

with col_sel:
    selected_pair = st.selectbox("Selecione o Par para Análise:", symbols[:num_ativos])

if selected_pair:
    try:
        ohlcv = exchange.fetch_ohlcv(selected_pair, timeframe=timeframe_input, limit=100)
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        
        # Indicadores Clássicos de Alta Assertividade
        df['EMA_8'] = ta.trend.ema_indicator(df['close'], window=8)
        df['EMA_21'] = ta.trend.ema_indicator(df['close'], window=21)
        df['EMA_50'] = ta.trend.ema_indicator(df['close'], window=50)
        df['EMA_100'] = ta.trend.ema_indicator(df['close'], window=100)
        df['RSI'] = ta.momentum.rsi(df['close'], window=14)

        last = df.iloc[-1]
        price = last['close']
        stop = last['low'] * 0.985
        risk = price - stop
        tp_2r = price + (risk * 2.0)
        tp_3r = price + (risk * 3.0)

        # Cálculo do Score de Confluência
        score = 50
        validations = []

        if last['EMA_8'] > last['EMA_21']:
            score += 15
            validations.append("EMA 8 x 21 Alinhadas")
        if last['close'] > last['EMA_50']:
            score += 15
            validations.append("Preço acima da EMA 50")
        if 40 <= last['RSI'] <= 65:
            score += 10
            validations.append(f"RSI Saudável ({last['RSI']:.1f})")
        if last['volume'] > df['volume'].tail(20).mean():
            score += 10
            validations.append("Volume acima da Média")

        c1, c2, c3, c4 = st.columns(4)
        c1.metric("Score do Setup", f"{score}/100")
        c2.metric("Preço Entrada", f"${price:.4f}")
        c3.metric("Stop Loss", f"${stop:.4f}")
        c4.metric("Alvo TP (2R / 3R)", f"${tp_2r:.4f} / ${tp_3r:.4f}")

        st.write(f"**Validações identificadas:** {', '.join(validations)}")

        if st.button(f"⚡ Validar Entrada ({selected_pair})"):
            new_trade = {
                "id": str(datetime.now().timestamp()),
                "symbol": selected_pair,
                "entry": price,
                "stop": stop,
                "tp_2r": tp_2r,
                "tp_3r": tp_3r,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            trades_db["open"].append(new_trade)
            save_trades(trades_db)
            st.success("Entrada Validada e Registrada no Diário!")
            st.rerun()

    except Exception as e:
        st.error(f"Erro ao carregar dados do par {selected_pair}: {e}")

# ---------------------------------------------------------
# DIÁRIO DE OPERAÇÕES - RESULTADO DAS ENTRADAS
# ---------------------------------------------------------
st.markdown("---")
st.subheader("DIÁRIO DE OPERAÇÕES - Resultados das entradas")

col_d1, col_d2 = st.columns([3, 1])
with col_d2:
    if st.button("🔄 Checar preço atual (Ao Vivo)"):
        st.rerun()

if not trades_db["open"]:
    st.info("Valide uma entrada em um setup para começar o histórico.")
else:
    for idx, t in enumerate(trades_db["open"]):
        try:
            ticker = exchange.fetch_ticker(t["symbol"])
            curr_price = ticker['last']
            pnl = ((curr_price - t['entry']) / t['entry']) * 100
            
            card_col1, card_col2, card_col3, card_col4, card_col5 = st.columns([2, 2, 2, 2, 2])
            card_col1.write(f"**{t['symbol']}**\n{t['date']}")
            card_col2.write(f"Entrada: **${t['entry']:.4f}**")
            card_col3.write(f"Atual: **${curr_price:.4f}**")
            card_col4.write(f"PnL: **{pnl:+.2f}%**")

            with card_col5:
                btn_g, btn_l = st.columns(2)
                if btn_g.button("🟢 GAIN", key=f"gain_{t['id']}"):
                    t["result"] = "GAIN"
                    t["close_price"] = curr_price
                    trades_db["closed"].append(t)
                    trades_db["open"].pop(idx)
                    save_trades(trades_db)
                    st.rerun()

                if btn_l.button("🔴 LOSS", key=f"loss_{t['id']}"):
                    t["result"] = "LOSS"
                    t["close_price"] = curr_price
                    trades_db["closed"].append(t)
                    trades_db["open"].pop(idx)
                    save_trades(trades_db)
                    st.rerun()
        except Exception:
            st.warning(f"Não foi possível obter preço atual para {t['symbol']}")

# Backup de Histórico (Para garantir que não perca dados na nuvem gratuita)
if trades_db["closed"]:
    st.markdown("---")
    st.caption("📜 Histórico de Trades Fechados")
    st.dataframe(pd.DataFrame(trades_db["closed"])[['date', 'symbol', 'entry', 'close_price', 'result']], use_container_width=True)
    st.download_button(
        label="💾 Baixar Backup de Trades (JSON)",
        data=json.dumps(trades_db, indent=4),
        file_name="backup_diario_trades.json",
        mime="application/json"
    )

# ---------------------------------------------------------
# SIMULAÇÃO HISTÓRICA / VALIDACÃO DE SETUP (BACKTEST)
# ---------------------------------------------------------
st.markdown("---")
st.subheader("SIMULAÇÃO HISTÓRICA - Validação do setup")
st.caption("Candles reais · sem taxas, slippage ou funding · alvo 2R")

b_col1, b_col2, b_col3 = st.columns([2, 2, 1])

with b_col1:
    bt_pair = st.selectbox("Par USDT", symbols[:num_ativos], key="bt_pair_sim")
with b_col2:
    bt_period = st.selectbox("Período", ["7 dias", "15 dias", "30 dias", "60 dias"], index=2)

if st.button("🚀 Simular setup"):
    days = int(bt_period.split()[0])
    limit_c = days * 24
    
    try:
        candles_bt = exchange.fetch_ohlcv(bt_pair, timeframe="1h", limit=min(limit_c, 500))
        df_sim = pd.DataFrame(candles_bt, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

        df_sim['EMA_8'] = ta.trend.ema_indicator(df_sim['close'], window=8)
        df_sim['EMA_21'] = ta.trend.ema_indicator(df_sim['close'], window=21)
        df_sim['RSI'] = ta.momentum.rsi(df_sim['close'], window=14)

        sim_gains = 0
        sim_losses = 0

        for i in range(21, len(df_sim)-5):
            if df_sim['RSI'].iloc[i] <= 40 and df_sim['EMA_8'].iloc[i] > df_sim['EMA_21'].iloc[i]:
                p_in = df_sim['close'].iloc[i]
                p_st = df_sim['low'].iloc[i] * 0.985
                p_target = p_in + ((p_in - p_st) * rr_target)

                for j in range(i+1, min(i+15, len(df_sim))):
                    if df_sim['high'].iloc[j] >= p_target:
                        sim_gains += 1
                        break
                    elif df_sim['low'].iloc[j] <= p_st:
                        sim_losses += 1
                        break

        tot_sim = sim_gains + sim_losses
        acc_sim = (sim_gains / tot_sim * 100) if tot_sim > 0 else 0.0

        sb1, sb2, sb3, sb4 = st.columns(4)
        sb1.metric("Entradas Simuladas", tot_sim)
        sb2.metric("Gains", sim_gains)
        sb3.metric("Losses", sim_losses)
        sb4.metric("Assertividade", f"{acc_sim:.1f}%")

    except Exception as err:
        st.error(f"Erro ao rodar simulação: {err}")
