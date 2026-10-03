// Servidor local. A integração MEXC contém somente chamadas GET de consulta.
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const root = __dirname;
const port = Number(process.env.RADAR_PORT || 4173);
const host = process.env.RADAR_HOST || '127.0.0.1';
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const json = (response, status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(body)); };
const get = (url, headers = {}) => new Promise((resolve, reject) => {
  const request = https.get(url, { headers }, response => {
    let text = '';
    response.on('data', chunk => text += chunk);
    response.on('end', () => {
      try {
        const data = JSON.parse(text);
        if (response.statusCode >= 400 || data.success === false) {
          const source = new URL(url).hostname;
          reject(new Error(data.msg || data.message || `Fonte ${source} respondeu HTTP ${response.statusCode}`));
        } else resolve(data);
      } catch { reject(new Error(`Resposta inválida da fonte ${new URL(url).hostname}`)); }
    });
  });
  request.setTimeout(12000, () => request.destroy(new Error(`Tempo esgotado ao consultar ${new URL(url).hostname}`)));
  request.on('error', reject);
});
const signature = (secret, text) => crypto.createHmac('sha256', secret).update(text).digest('hex');
const queryString = params => Object.entries(params).filter(([, value]) => value != null).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
const ninetyDaysAgo = () => String(Date.now() - 90 * 86400000);
const publicMarketHosts = new Set(['api.coingecko.com', 'data-api.binance.vision', 'api.binance.com', 'fapi.binance.com', 'pro-api.coinmarketcap.com', 'api.coinpaprika.com', 'www.okx.com']);
const rankingCache = new Map();
async function publicData(target) {
  if(target.hostname !== 'pro-api.coinmarketcap.com') return get(target.toString());
  const key=target.toString(), cached=rankingCache.get(key);
  if(cached && Date.now()-cached.at < 5*60000) return cached.promise;
  // Share concurrent ranking requests; cache only successful official responses.
  const item={at:Date.now(),promise:null};
  item.promise=get(key).then(data=>{if(!Array.isArray(data.data)||Number(data.status?.error_code||0)!==0)throw new Error(data.status?.error_message||'Ranking CoinMarketCap inválido');return data;}).catch(error=>{rankingCache.delete(key);throw error;});
  rankingCache.set(key,item);return item.promise;
}
function proxyPublicMarket(request, response) {
  const requested = new URL(request.url, `http://${host}:${port}`).searchParams.get('url');
  if (!requested) return json(response, 400, { error: 'URL pública ausente.' });
  let target;
  try { target = new URL(requested); } catch { return json(response, 400, { error: 'URL pública inválida.' }); }
  if (target.protocol !== 'https:' || !publicMarketHosts.has(target.hostname)) return json(response, 403, { error: 'Fonte pública não permitida.' });
  if (target.hostname === 'pro-api.coinmarketcap.com' && (target.port || target.username || target.password || target.pathname !== '/public-api/v3/cryptocurrency/listings/latest')) return json(response, 403, { error: 'Consulta CoinMarketCap não permitida.' });
  if (target.hostname === 'www.okx.com' && (target.port || target.username || target.password || !['/api/v5/public/instruments','/api/v5/market/tickers','/api/v5/market/history-candles','/api/v5/market/ticker'].includes(target.pathname))) return json(response, 403, { error: 'Consulta OKX não permitida.' });
  return publicData(target).then(data => json(response, 200, data)).catch(error => json(response, 502, { error: error.message || 'Falha ao consultar fonte pública.' }));
}
async function mexcSpotTrades(apiKey, secret, symbols) { const time = await get('https://api.mexc.com/api/v3/time'), timestamp = String(time.serverTime || Date.now()), startTime = String(Number(timestamp) - 30 * 86400000); const jobs = symbols.map(async symbol => { const query = queryString({ symbol, limit: 1000, startTime, timestamp }); return get(`https://api.mexc.com/api/v3/myTrades?${query}&signature=${signature(secret, query)}`, { 'X-MEXC-APIKEY': apiKey }); }); const settled = await Promise.allSettled(jobs); return { trades: settled.filter(x => x.status === 'fulfilled').flatMap(x => x.value), errors: settled.filter(x => x.status === 'rejected').map(x => x.reason.message) }; }
async function mexcFuturesOrders(apiKey, secret) { const ping = await get('https://contract.mexc.com/api/v1/contract/ping'), timestamp = String(ping.data || Date.now()), params = { end_time: timestamp, page_num: 1, page_size: 100, start_time: String(Number(timestamp) - 90 * 86400000) }, query = queryString(params), sign = signature(secret, `${apiKey}${timestamp}${query}`); return get(`https://contract.mexc.com/api/v1/private/order/list/history_orders?${query}`, { ApiKey: apiKey, 'Request-Time': timestamp, Signature: sign, 'Content-Type': 'application/json' }); }
async function mexcFuturesPrivate(apiKey, secret, path, params = {}) { const ping = await get('https://contract.mexc.com/api/v1/contract/ping'), timestamp = String(ping.data || Date.now()), query = queryString(params), sign = signature(secret, `${apiKey}${timestamp}${query}`), url = `https://contract.mexc.com${path}${query ? `?${query}` : ''}`; return get(url, { ApiKey: apiKey, 'Request-Time': timestamp, Signature: sign, 'Content-Type': 'application/json' }); }
async function mexcSpotAccount(apiKey, secret) { const time = await get('https://api.mexc.com/api/v3/time'), timestamp = String(time.serverTime || Date.now()), query = queryString({ recvWindow: 5000, timestamp }); return get(`https://api.mexc.com/api/v3/account?${query}&signature=${signature(secret, query)}`, { 'X-MEXC-APIKEY': apiKey }); }

http.createServer((request, response) => {
  if (request.method === 'GET' && request.url.startsWith('/api/public?')) return proxyPublicMarket(request, response);
  if (request.method === 'POST' && request.url === '/api/mexc/import') { let body = ''; request.on('data', chunk => body += chunk); return request.on('end', async () => { try { const { apiKey, secret, spotSymbol } = JSON.parse(body), symbols = String(spotSymbol || '').toUpperCase().split(/[\s,;]+/).filter(Boolean).slice(0, 20); if (!apiKey || !secret || !symbols.length || symbols.some(symbol => !/^[A-Z0-9]{5,14}$/.test(symbol))) throw new Error('Informe API Key, Secret Key e ao menos um par spot válido.'); const [spotResult, futuresResult, contractsResult, positionsResult, stopsHistoryResult] = await Promise.allSettled([mexcSpotTrades(apiKey, secret, symbols), mexcFuturesOrders(apiKey, secret), get('https://contract.mexc.com/api/v1/contract/detail'), mexcFuturesPrivate(apiKey, secret, '/api/v1/private/position/list/history_positions', { page_num: 1, page_size: 100 }), mexcFuturesPrivate(apiKey, secret, '/api/v1/private/stoporder/list/orders', { is_finished: 1, page_num: 1, page_size: 100, start_time: ninetyDaysAgo(), end_time: String(Date.now()) })]); const spot = spotResult.status === 'fulfilled' ? spotResult.value.trades : [], spotErrors = spotResult.status === 'fulfilled' ? spotResult.value.errors : [spotResult.reason.message], futures = futuresResult.status === 'fulfilled' && Array.isArray(futuresResult.value.data) ? futuresResult.value.data : [], futuresError = futuresResult.status === 'rejected' ? futuresResult.reason.message : null, contracts = contractsResult.status === 'fulfilled' && Array.isArray(contractsResult.value.data) ? contractsResult.value.data : [], closedPositions = positionsResult.status === 'fulfilled' && Array.isArray(positionsResult.value.data) ? positionsResult.value.data : [], positionsError = positionsResult.status === 'rejected' ? positionsResult.reason.message : null, stopHistory = stopsHistoryResult.status === 'fulfilled' && Array.isArray(stopsHistoryResult.value.data) ? stopsHistoryResult.value.data : [], stopsHistoryError = stopsHistoryResult.status === 'rejected' ? stopsHistoryResult.reason.message : null; json(response, 200, { spot, futures, contracts, closedPositions, stopHistory, errors: [...spotErrors, ...(futuresError ? [futuresError] : []), ...(positionsError ? [positionsError] : []), ...(stopsHistoryError ? [stopsHistoryError] : [])] }); } catch (error) { json(response, 400, { error: error.message || 'Falha ao importar operações.' }); } }); }
  if (request.method === 'POST' && request.url === '/api/mexc/positions') { let body = ''; request.on('data', chunk => body += chunk); return request.on('end', async () => { try { const { apiKey, secret } = JSON.parse(body); if (!apiKey || !secret) throw new Error('Informe API Key e Secret Key para atualizar posições.'); const [positionsResult, stopsResult, contractsResult] = await Promise.allSettled([mexcFuturesPrivate(apiKey, secret, '/api/v1/private/position/open_positions'), mexcFuturesPrivate(apiKey, secret, '/api/v1/private/stoporder/list/orders', { is_finished: 0, page_num: 1, page_size: 100 }), get('https://contract.mexc.com/api/v1/contract/detail')]); if (positionsResult.status === 'rejected') throw positionsResult.reason; const positions = Array.isArray(positionsResult.value.data) ? positionsResult.value.data : [], stopOrders = stopsResult.status === 'fulfilled' && Array.isArray(stopsResult.value.data) ? stopsResult.value.data : [], contracts = contractsResult.status === 'fulfilled' && Array.isArray(contractsResult.value.data) ? contractsResult.value.data : []; const tickers = await Promise.allSettled(positions.map(position => get(`https://contract.mexc.com/api/v1/contract/ticker?symbol=${position.symbol}`))); json(response, 200, { positions, stopOrders, contracts, tickers: tickers.map((ticker, index) => ticker.status === 'fulfilled' ? ticker.value.data : { symbol: positions[index].symbol }), stopError: stopsResult.status === 'rejected' ? stopsResult.reason.message : null }); } catch (error) { json(response, 400, { error: error.message || 'Falha ao atualizar posições.' }); } }); }
  if (request.method === 'POST' && request.url === '/api/mexc/balance') { let body = ''; request.on('data', chunk => body += chunk); return request.on('end', async () => { try {
    const { apiKey, secret } = JSON.parse(body); if (!apiKey || !secret) throw new Error('Informe API Key e Secret Key para consultar o saldo.');
    const [spotResult, futuresResult] = await Promise.allSettled([mexcSpotAccount(apiKey, secret), mexcFuturesPrivate(apiKey, secret, '/api/v1/private/account/assets')]);
    const spotBalances = spotResult.status === 'fulfilled' && Array.isArray(spotResult.value.balances) ? spotResult.value.balances : [];
    const nonZero = spotBalances.filter(item => ((+item.free || 0) + (+item.locked || 0)) > 0);
    const spotValues = await Promise.allSettled(nonZero.map(async item => { const asset = String(item.asset || '').toUpperCase(), amount = (+item.free || 0) + (+item.locked || 0); if (asset === 'USDT' || asset === 'USDC' || asset === 'USD') return { asset, amount, usdt: amount }; const ticker = await get(`https://api.mexc.com/api/v3/ticker/price?symbol=${asset}USDT`); return { asset, amount, usdt: amount * (+ticker.price || 0) }; }));
    const spotUsdt = spotValues.filter(item => item.status === 'fulfilled').reduce((sum, item) => sum + (item.value.usdt || 0), 0);
    const futureAssets = futuresResult.status === 'fulfilled' && Array.isArray(futuresResult.value.data) ? futuresResult.value.data : [];
    const futureUsdt = futureAssets.filter(item => String(item.currency || item.asset || '').toUpperCase() === 'USDT').reduce((sum, item) => sum + (+item.equity || +item.balance || +item.availableBalance || +item.available || 0), 0);
    json(response, 200, { spotUsdt, futureUsdt, totalUsdt: spotUsdt + futureUsdt, spotAssets: spotValues.filter(item => item.status === 'fulfilled').map(item => item.value), errors: [...(spotResult.status === 'rejected' ? [spotResult.reason.message] : []), ...(futuresResult.status === 'rejected' ? [futuresResult.reason.message] : []), ...spotValues.filter(item => item.status === 'rejected').map(item => item.reason.message)] });
  } catch (error) { json(response, 400, { error: error.message || 'Falha ao consultar saldo MEXC.' }); } }); }  if (request.method === 'GET' && request.url === '/api/mexc/exchange-info') return get('https://api.mexc.com/api/v3/exchangeInfo').then(data => json(response, 200, data)).catch(error => json(response, 502, { error: error.message }));
  const pathname = new URL(request.url, `http://${host}:${port}`).pathname;
  const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative);
  if (!file.startsWith(root)) { response.writeHead(403); return response.end('Acesso negado'); }
  fs.readFile(file, (error, data) => { if (error) { response.writeHead(404); return response.end('Arquivo não encontrado'); } response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store, no-cache, must-revalidate' }); response.end(data); });
}).listen(port, host, () => console.log(`Sentinel Trade disponível em http://${host}:${port}`));

