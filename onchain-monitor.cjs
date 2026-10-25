const fs = require('node:fs/promises');
const path = require('node:path');
const Core = require('./onchain-core.js');
const ROOT = __dirname, DAY = 86400000;
const NETWORKS = {'eth-mainnet':'https://eth-mainnet.g.alchemy.com/v2/','base-mainnet':'https://base-mainnet.g.alchemy.com/v2/','arb-mainnet':'https://arb-mainnet.g.alchemy.com/v2/','polygon-mainnet':'https://polygon-mainnet.g.alchemy.com/v2/'};
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(path.join(ROOT,file),'utf8')); } catch(error) { if (error.code==='ENOENT') return fallback; throw new Error(`Arquivo inválido: ${file}`); } }
async function writeJson(file, data) { const target=path.join(ROOT,file), temporary=`${target}.${process.pid}.tmp`; await fs.writeFile(temporary,JSON.stringify(data,null,2)+'\n'); await fs.rename(temporary,target); }
async function collect(asset, key, fetcher=fetch, now=Date.now(), maxPages=5) {
  const endpoint=NETWORKS[asset.network];
  if (!endpoint || !/^0x[0-9a-f]{40}$/i.test(asset.contract || '')) throw new Error('Rede ou contrato não suportado.');
  async function rpc(method,params) {
    let response;
    try { response=await fetcher(endpoint+encodeURIComponent(key),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(20000)}); }
    catch { throw new Error('Conexão on-chain indisponível.'); }
    if (!response.ok) throw new Error(`Fonte on-chain respondeu HTTP ${response.status}.`);
    const payload=await response.json();
    if (payload.error || payload.result==null) throw new Error('Consulta on-chain recusada ou incompleta.');
    return payload.result;
  }
  const latest=Number(BigInt(await rpc('eth_blockNumber',[]))), end=Math.max(0,latest-64), startTime=now-90*DAY;
  // Binary search actual block timestamps; no fixed blocks-per-day assumption.
  const blockCache=new Map();
  async function blockTime(height) { if(!blockCache.has(height)) {const block=await rpc('eth_getBlockByNumber',['0x'+height.toString(16),false]);blockCache.set(height,Number(BigInt(block.timestamp))*1000);} return blockCache.get(height); }
  async function blockBefore(time) { let low=0,high=end;while(low<high) {const middle=Math.ceil((low+high)/2);if(await blockTime(middle)<=time)low=middle;else high=middle-1;}return low; }
  const low=await blockBefore(startTime);
  let pageKey, pages=0, records=[];
  do {
    const params={fromBlock:'0x'+low.toString(16),toBlock:'0x'+end.toString(16),contractAddresses:[asset.contract],category:['erc20'],withMetadata:true,excludeZeroValue:true,order:'desc',maxCount:'0x3e8'};
    if(pageKey) params.pageKey=pageKey;
    const result=await rpc('alchemy_getAssetTransfers',[params]);
    if(!Array.isArray(result.transfers)) throw new Error('Histórico on-chain inválido.');
    records.push(...result.transfers.map(t=>({id:t.uniqueId,kind:'transfer',from:t.from,to:t.to,quantity:t.value,timestamp:t.metadata?.blockTimestamp,transactionHash:t.hash,source:`alchemy:${asset.network}`})));
    pageKey=result.pageKey; pages++;
  } while(pageKey && pages<maxPages);
  // Exclude discovered contracts from whale candidates; unclassified remains unclassified.
  const totals=new Map();
  for(const r of records) for(const wallet of [r.from,r.to]) if(/^0x[0-9a-f]{40}$/i.test(wallet||'')) totals.set(wallet.toLowerCase(),(totals.get(wallet.toLowerCase())||0)+Number(r.quantity||0));
  const labels={...(asset.labels||{})};
  for(const [wallet] of [...totals].sort((a,b)=>b[1]-a[1]).slice(0,20)) {
    if(labels[wallet]?.source) continue;
    const code=await rpc('eth_getCode',[wallet,'0x'+end.toString(16)]);
    if(code!=='0x') labels[wallet]={type:'contract',name:'Contrato identificado por bytecode',source:`alchemy:${asset.network}:eth_getCode`};
  }
  const analysis=Core.analyse(asset,records,labels,now,{complete:!pageKey,startTime,collectedAt:new Date(now).toISOString(),pages,remainingPages:!!pageKey,negotiationsDecoded:false,priceSource:asset.priceSource||null,source:'Alchemy Transfers API',limitations:['Somente ERC-20 nesta rede; derivativos e outras redes não observados.','Transferências são fluxos; não são compras/vendas decodificadas.','Endereços sem rótulo não têm identidade confirmada.','Descoberta limitada aos eventos coletados; outras carteiras podem ficar fora.']});
  const checkpoints={};
  for(const days of [1,7,30,90]) checkpoints[days]=await blockBefore(now-days*DAY);
  const decimals=Number(BigInt(await rpc('eth_call',[{to:asset.contract,data:'0x313ce567'},'0x'+end.toString(16)])));
  if(!Number.isInteger(decimals)||decimals<0||decimals>36) throw new Error('Precisão do token não suportada.');
  analysis.positions=[];
  for(const candidate of analysis.candidates.slice(0,10)) {
    const data='0x70a08231'+candidate.address.slice(2).padStart(64,'0');
    const balances={},changes={};
    for(const [days,height] of Object.entries({0:end,...checkpoints})) {
      try { const raw=await rpc('eth_call',[{to:asset.contract,data},'0x'+height.toString(16)]); balances[days]=Number(BigInt(raw))/10**decimals; }
      catch { balances[days]=null; }
    }
    for(const days of [1,7,30,90]) changes[days]=Core.positionChange(balances[days],balances[0],asset.priceUsd);
    analysis.positions.push({address:candidate.address,balances,changes,blocks:{0:end,...checkpoints},source:'eth_call balanceOf em blocos históricos',precision:'Valores de exibição arredondados em ponto flutuante; não usar para liquidação.'});
  }
  return analysis;
}
async function run(options={}) {
  const now=options.now||Date.now(), config=options.config||await readJson('onchain-config.json',{assets:[],unlocks:[]});
  const key=options.key ?? process.env.ALCHEMY_API_KEY;
  const report={version:1,asOf:new Date(now).toISOString(),status:key?'ready':'unconfigured',assets:[],unlocks:Core.unlocks(config.unlocks||[],now),errors:[],coverageNote:'Sem rótulo ou histórico não significa ausência de risco. Nenhuma probabilidade de queda foi estimada.'};
  let prices={};
  const ids=(config.assets||[]).map(a=>a.coingeckoId).filter(id=>/^[a-z0-9-]+$/.test(id||'')).slice(0,10);
  if(key && ids.length) try {const response=await (options.fetcher||fetch)(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_last_updated_at=true`,{signal:AbortSignal.timeout(15000)});if(response.ok)prices=await response.json();} catch { /* USD valuation stays unavailable; token balances can still be observed. */ }
  if(key) for(const asset of (config.assets||[]).slice(0,10)) {
    const quote=prices[asset.coingeckoId], validQuote=Number(quote?.usd)>0 && Number(quote.last_updated_at)*1000<=now && now-Number(quote.last_updated_at)*1000<=DAY;
    const priced={...asset,priceUsd:validQuote?Number(quote.usd):null,priceSource:validQuote?'CoinGecko USD; '+new Date(quote.last_updated_at*1000).toISOString():null};
    try { report.assets.push(await collect(priced,key,options.fetcher||fetch,now,Math.min(10,Math.max(1,Number(config.maxPages)||5)))); }
    catch { report.errors.push({symbol:asset.symbol,message:'Coleta falhou; dados deste ativo indisponíveis.'}); }
  }
  if(key && !report.assets.length) report.status='unavailable';
  if(report.errors.length && report.assets.length) report.status='partial';
  if(!options.noWrite) await writeJson('onchain-report.json',report);
  return report;
}
async function notify(report,options={}) {
  const clock=options.now||Date.now(),observed=Date.parse(report.asOf);
  if(!Number.isFinite(observed)||observed>clock+300000||clock-observed>86400000)return {sent:0,state:options.state||{sent:{}},reason:'Relatório ausente ou desatualizado.'};
  const state=options.state||await readJson('onchain-alert-state.json',{sent:{}}), now=Date.parse(report.asOf);
  state.sent ||= {};
  for(const [id,at] of Object.entries(state.sent)) if(now-at>100*DAY) delete state.sent[id];
  const eligible=Core.alerts(report).filter(alert=>!state.sent[alert.id]).slice(0,5);
  const send=options.send||async function(message) {
    const token=process.env.TELEGRAM_BOT_TOKEN,chat=process.env.TELEGRAM_CHAT_ID;
    if(!token||!chat) throw new Error('Telegram não configurado.');
    let response;
    try { response=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({chat_id:chat,text:message,parse_mode:'HTML',disable_web_page_preview:true}),signal:AbortSignal.timeout(20000)}); }
    catch { throw new Error('Falha de conexão ao enviar contexto on-chain.'); }
    if(!response.ok || !(await response.json()).ok) throw new Error('Telegram não confirmou a entrega.');
  };
  for(const alert of eligible) {
    await send(Core.telegramMessage(alert)); state.sent[alert.id]=now;
    if(!options.noWrite) await writeJson('onchain-alert-state.json',state);
  }
  return {sent:eligible.length,state};
}
module.exports={collect,run,notify};
if(require.main===module) run().then(async report=>{ const delivery=process.argv.includes('--telegram') ? await notify(report) : {sent:0}; console.log(JSON.stringify({status:report.status,assets:report.assets.length,errors:report.errors.length,sent:delivery.sent})); }).catch(error=>{console.error(error.message);process.exitCode=1;});
