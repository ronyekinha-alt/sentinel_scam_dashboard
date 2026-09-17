import streamlit as st
import pandas as pd
import ta
import ccxt
import json
import os
from datetime import datetime

# ---------------------------------------------------------
# CONFIGURAÇÃO DA PÁGINA & ESTILO NEON EM FUNDO CLARO
# ---------------------------------------------------------
st.set_page_config(page_title="Sentinel Trade - MEXC Analytics", layout="wide")

st.markdown("""
    <style>
    .stApp {
        background-color: #FAFAFC;
        color: #1E1E24;
    }
    div[data-testid="stMetric"] {
        background-color: #FFFFFF;
        border: 2px solid #00E5FF;
        box-shadow: 0px 4px 12px rgba(0, 229, 255, 0.2);
        border-radius: 12px;
        padding: 12px 16px;
    }
    .stButton>button {
        background-color: #00FF66 !important;
        color: #000000 !important;
        font-weight: bold !important;
        border: 1px solid #00CC52 !important;
        box-shadow: 0px 0px 10px rgba(0, 255, 102, 0.5);
        border-radius: 8px;
    }
    h1, h2, h3 {
        color: #D6006E !important;
    }
    </style>
""", unsafe_allow_html=True)

st.title("⚡ SENTINEL TRADE - MEXC ANALYTICS & BACKTEST")
st.write("Conectado à **MEXC Exchange** em tempo real 24/7.")

# ---------------------------------------------------------
# CONEXÃO DIRETA COM A MEXC
# ---------------------------------------------------------
@st.cache_resource
def get_mexc_exchange():
    return ccxt.mexc({'enableRateLimit': True})

exchange = get_mexc_exchange()

# ---------------------------------------------------------
# BANCO DE DADOS LOCAL SIMPLES DE TRADES
# ---------------------------------------------------------
DB_FILE = "trades_db.json"

def load_trades():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, "r") as f:
            return json.load(f)
    return {"open": [], "closed": []}

def save_trades(data):
    with open(DB_FILE, "w") as f:
        json.dump(data, f, indent=4)

trades_data = load_trades()

# ---------------------------------------------------------
# BARRA LATERAL - CONFIGURAÇÕES
# ---------------------------------------------------------
st.sidebar.header("⚙️ Filtros do Setup (MEXC)")
timeframe = st.sidebar.selectbox("Tempo Gráfico", ["1h", "2h", "4h", "1d"], index=2)
rsi_limit = st.sidebar.slider("Filtro RSI (Sobrevendido)", 10, 40, 30)
rr_ratio = st.sidebar.selectbox("Risco : Retorno (R:R)", [2.0, 3.0, 4.0], index=1)

@st.cache_data(ttl=300)
def get_mexc_symbols():
    try:
        markets = exchange.load_markets()
        symbols = [s for s in markets if s.endswith('/USDT') and '3L/' not in s and '3S/' not in s and '5L/' not in s and '5S/' not in s]
        return symbols[:200]
    except Exception as e:
        return ["BTC/USDT", "ETH/USDT", "SOL/USDT", "ONDO/USDT", "NEAR/USDT", "API3/USDT", "TAO/USDT", "JTO/USDT"]

symbols = get_mexc_symbols()

# ---------------------------------------------------------
# ABAS DO PAINEL
# ---------------------------------------------------------
tab_radar, tab_backtest, tab_portfolio = st.tabs(["🔍 Radar MEXC", "📊 Backtest Histórico", "💼 Meus Trades"])

# ---------------------------------------------------------
# ABA 1: RADAR DE SETUPS MEXC
# ---------------------------------------------------------
with tab_radar:
    st.subheader("Análise Gráfica MEXC & Setup")
    selected_symbol = st.selectbox("Selecione o Ativo na MEXC:", symbols)

    if selected_symbol:
        ohlcv = exchange.fetch_ohlcv(selected_symbol, timeframe=timeframe, limit=150)
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')

        # Cálculo dos indicadores via biblioteca `ta`
        df['EMA_8'] = ta.trend.ema_indicator(df['close'], window=8)
        df['EMA_21'] = ta.trend.ema_indicator(df['close'], window=21)
        df['EMA_50'] = ta.trend.ema_indicator(df['close'], window=50)
        df['EMA_100'] = ta.trend.ema_indicator(df['close'], window=100)
        df['RSI'] = ta.momentum.rsi(df['close'], window=14)

        atual = df.iloc[-1]
        preco_atual = atual['close']
        stop_loss = atual['low'] * 0.985
        risco = preco_atual - stop_loss
        take_profit = preco_atual + (risco * rr_ratio)

        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Preço Atual (MEXC)", f"${preco_atual:.4f}")
        col2.metric("RSI (14)", f"{atual['RSI']:.1f}")
        col3.metric("EMA 8 vs 21", "ALTA 🟢" if atual['EMA_8'] > atual['EMA_21'] else "BAIXA 🔴")
        col4.metric("R:R Alvo", f"1:{rr_ratio}")

        st.info(f"📍 **Plano de Entrada:** Compra: **${preco_atual:.4f}** | Stop Loss: **${stop_loss:.4f}** \vert{} Take Profit: **${take_profit:.4f}** (Alavancagem Máx Sugerida: 4x)")

        if st.button(f"📌 Entrar no Trade ({selected_symbol})"):
            novo_trade = {
                "id": str(datetime.now().timestamp()),
                "symbol": selected_symbol,
                "entry_price": preco_atual,
                "stop_loss": stop_loss,
                "take_profit": take_profit,
                "timeframe": timeframe,
                "date": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            }
            trades_data["open"].append(novo_trade)
            save_trades(trades_data)
            st.success("Trade registrado no seu diário!")

        st.line_chart(df.set_index('timestamp')[['close', 'EMA_8', 'EMA_21', 'EMA_50', 'EMA_100']])

# ---------------------------------------------------------
# ABA 2: BACKTEST HISTÓRICO
# ---------------------------------------------------------
with tab_backtest:
    st.subheader("🧪 Backtest de Sinais no Histórico da MEXC")
    
    c1, c2, c3 = st.columns(3)
    bt_symbol = c1.selectbox("Ativo na MEXC:", symbols, key="bt_sym")
    dias_teste = c2.selectbox("Período (Dias):", [7, 15, 30, 45, 60, 90], index=2)
    bt_tf = c3.selectbox("Tempo Gráfico:", ["1h", "2h", "4h", "1d"], index=2, key="bt_tf")

    if st.button("🚀 Executar Backtest"):
        limit_candles = dias_teste * (24 if bt_tf == "1h" else 6 if bt_tf == "4h" else 1)
        candles = exchange.fetch_ohlcv(bt_symbol, timeframe=bt_tf, limit=min(limit_candles, 1000))
        df_bt = pd.DataFrame(candles, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])

        df_bt['EMA_8'] = ta.trend.ema_indicator(df_bt['close'], window=8)
        df_bt['EMA_21'] = ta.trend.ema_indicator(df_bt['close'], window=21)
        df_bt['RSI'] = ta.momentum.rsi(df_bt['close'], window=14)

        gains = 0
        losses = 0

        for i in range(21, len(df_bt)-5):
            if df_bt['RSI'].iloc[i] <= rsi_limit and df_bt['EMA_8'].iloc[i] > df_bt['EMA_21'].iloc[i]:
                p_entrada = df_bt['close'].iloc[i]
                p_stop = df_bt['low'].iloc[i] * 0.985
                p_tp = p_entrada + ((p_entrada - p_stop) * rr_ratio)

                for j in range(i+1, min(i+15, len(df_bt))):
                    if df_bt['high'].iloc[j] >= p_tp:
                        gains += 1
                        break
                    elif df_bt['low'].iloc[j] <= p_stop:
                        losses += 1
                        break

        total_ops = gains + losses
        win_rate = (gains / total_ops * 100) if total_ops > 0 else 0.0

        m1, m2, m3, m4 = st.columns(4)
        m1.metric("Sinais Gerados", total_ops)
        m2.metric("Gains 🟢", gains)
        m3.metric("Losses 🔴", losses)
        m4.metric("Taxa de Acerto", f"{win_rate:.1f}%")

# ---------------------------------------------------------
# ABA 3: MEUS TRADES
# ---------------------------------------------------------
with tab_portfolio:
    st.subheader("💼 Gestão e Acompanhamento em Tempo Real")

    fechados = trades_data["closed"]
    total_f = len(fechados)
    gains_f = len([t for t in fechados if t["result"] == "GAIN"])
    winrate_f = (gains_f / total_f * 100) if total_f > 0 else 0.0

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Trades Encerrados", total_f)
    k2.metric("Gains", gains_f)
    k3.metric("Losses", total_f - gains_f)
    k4.metric("Assertividade Real", f"{winrate_f:.1f}%")

    st.markdown("---")
    st.subheader("⏳ Posições Abertas (Preço Vivo na MEXC)")

    em_aberto = trades_data["open"]
    if not em_aberto:
        st.info("Nenhuma posição aberta.")
    else:
        for idx, t in enumerate(em_aberto):
            ticker = exchange.fetch_ticker(t["symbol"])
            preco_agora = ticker['last']
            pnl_pct = ((preco_agora - t["entry_price"]) / t["entry_price"]) * 100

            col_a, col_b, col_c, col_d, col_e = st.columns([2, 2, 2, 2, 3])
            col_a.write(f"**{t['symbol']}**")
            col_b.write(f"Entrada: ${t['entry_price']:.4f}")
            col_c.write(f"Atual: ${preco_agora:.4f}")
            col_d.write(f"Lucro/Prejuízo: **{pnl_pct:+.2f}%**")

            with col_e:
                c_btn1, c_btn2 = st.columns(2)
                if c_btn1.button("🟢 GAIN", key=f"g_{t['id']}"):
                    t["result"] = "GAIN"
                    t["close_price"] = preco_agora
                    trades_data["closed"].append(t)
                    trades_data["open"].pop(idx)
                    save_trades(trades_data)
                    st.rerun()
                if c_btn2.button("🔴 LOSS", key=f"l_{t['id']}"):
                    t["result"] = "LOSS"
                    t["close_price"] = preco_agora
                    trades_data["closed"].append(t)
                    trades_data["open"].pop(idx)
                    save_trades(trades_data)
                    st.rerun()

    st.markdown("---")
    st.subheader("📜 Histórico Registrado")
    if fechados:
        st.dataframe(pd.DataFrame(fechados)[['date', 'symbol', 'entry_price', 'close_price', 'result']], use_container_width=True)
