/* Keyless, bounded, read-only collector. Public evidence only. */
const fs=require('node:fs/promises'),path=require('node:path');
const Core=require('./onchain-core.js'),{notify}=require('./onchain-monitor.cjs');
const ROOT=__dirname,DAY=86400000,RPC='https://eth.drpc.org',EXPLORER='https://eth.blockscout.com';
const valid=a=>/^0x[0-9a-f]{40}$/i.test(a||'');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function write(file,data){const dest=path.join(ROOT,file),tmp=dest+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2)+'\n');await fs.rename(tmp,dest);}
async function collectPublic(options={}) {
  const fetcher=options.fetcher||fetch,now=options.now||Date.now(),config=options.config||JSON.parse(await fs.readFile(path.join(ROOT,'onchain-config.json'),'utf8'));
  const report={version:2,asOf:new Date(now).toISOString(),status:'unavailable',assets:[],unlocks:Core.unlocks(config.unlocks||[],now),errors:[],coverageNote:'Piloto gratuito Ethereum: candidatos descobertos em titulares e transferências recentes, não todas as carteiras. Variação de saldo não comprova compra. Calendário de desbloqueios não conectado.'};
  let requests=0;
  async function json(url,init){if(++requests>250)throw Error('Limite de consultas atingido.');await sleep(options.noDelay?0:180);const response=await fetcher(url,{...init,signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Fonte pública indisponível: HTTP '+response.status);return response.json();}
  let sequence=0;
  async function rpc(method,params){const init={method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method,params})};let payload;
    try{payload=await json(RPC,init);if(payload.error||payload.result==null)throw Error('Consulta recusada.');}catch{payload=await json(EXPLORER+'/api/eth-rpc',init);}
    if(payload.error||payload.result==null)throw Error('Consulta histórica não disponível.');return payload.result;}
  const blockTimes=new Map();
  const hex=n=>'0x'+n.toString(16);
  async function timestamp(block){if(!blockTimes.has(block)){const data=await rpc('eth_getBlockByNumber',[hex(block),false]);blockTimes.set(block,Number(BigInt(data.timestamp))*1000);}return blockTimes.get(block);}
  let end,checkpoints={};
  try {
    end=Math.max(0,Number(BigInt(await rpc('eth_blockNumber',[])))-64);
    const endTime=await timestamp(end);
    if(now-endTime>3600000||endTime>now)throw Error('Cabeçalho da rede desatualizado.');
    for(const days of [1,7,30,90]) {
      const target=now-days*DAY;
      let low=Math.max(0,end-Math.ceil((endTime-target)/10000)-10000),high=end;
      // Verify bracket rather than assuming a fixed block interval.
      if(await timestamp(low)>target)low=0;
      while(low<high){const mid=Math.ceil((low+high)/2);if(await timestamp(mid)<=target)low=mid;else high=mid-1;}
      checkpoints[days]=low;
    }
  }catch{report.errors.push({symbol:'ETHEREUM',message:'Saldos históricos indisponíveis; nenhuma conclusão ou alerta.'});if(!options.noWrite)await write('onchain-report.json',report);return report;}
  for(const asset of config.assets.slice(0,4)) {
    try{
      if(asset.network!=='eth-mainnet'||!valid(asset.contract))throw Error('Contrato não suportado.');
      const base=`${EXPLORER}/api/v2/tokens/${asset.contract}`;
      const metadata=await json(base),labels={...(asset.labels||{})},accounts=new Map(),records=[];
      function account(item){if(!item||!valid(item.hash))return;const a=item.hash.toLowerCase();
        const tags=[item.name,item.ens_domain_name,...(item.public_tags||[]).map(t=>t.label||t.display_name),...(item.metadata?.tags||[]).map(t=>t.name)].filter(Boolean).join(' ');
        if(item.is_contract)labels[a]={type:'contract',name:tags||'Contrato',source:`${EXPLORER}/address/${a}`};
        else if(/binance|coinbase|kraken|okx|bitfinex|bybit|kucoin|mexc|gate\.io|huobi|crypto\.com|upbit/i.test(tags))labels[a]={type:'exchange',name:tags,source:`${EXPLORER}/address/${a}`};
        else if(tags)labels[a]={type:'unknown',name:tags,source:`${EXPLORER}/address/${a}`};
        if(!labels[a]||labels[a].type==='unknown')accounts.set(a,item);
      }
      const holders=await json(base+'/holders');
      for(const holder of (holders.items||[]).slice(0,16))account(holder.address);
      const holderCandidates=[...accounts.keys()];
      let cursor=null;
      for(let page=0;page<2;page++){
        const qs=cursor?'?'+new URLSearchParams(cursor).toString():'';
        const data=await json(base+'/transfers'+qs);
        for(const t of data.items||[]){account(t.from);account(t.to);const decimals=Number(t.total?.decimals??metadata.decimals);if(t.token?.address_hash?.toLowerCase()!==asset.contract.toLowerCase()||!Number.isInteger(decimals)||decimals<0||decimals>36||t.type!=='token_transfer')continue;
          const quantity=Number(t.total?.value)/10**decimals;if(!Number.isFinite(quantity)||quantity<=0)continue;
          records.push({id:`${t.transaction_hash}:${t.log_index}`,kind:'transfer',from:t.from?.hash,to:t.to?.hash,quantity,timestamp:t.timestamp,transactionHash:t.transaction_hash,source:`${EXPLORER}/tx/${t.transaction_hash}`});}
        cursor=data.next_page_params;if(!cursor)break;
      }
      const quote=Number(metadata.exchange_rate),priced={...asset,priceUsd:quote>0?quote:null};
      const analysis=Core.analyse(priced,records,labels,now,{complete:false,startTime:null,collectedAt:new Date(now).toISOString(),source:'Blockscout + dRPC público (fallback Blockscout RPC)',negotiationsDecoded:false,priceSource:'Blockscout, cotação indicativa consultada nesta coleta',limitations:['Descoberta parcial: titulares e até 100 transferências recentes.','As consultas balanceOf históricas são independentes da descoberta parcial.','Corretoras sem rótulo e endereços do mesmo dono podem não ser reconhecidos.','Sem cobertura de corretoras centralizadas, derivativos e outras redes.']});
      analysis.positions=[];
      const decimals=Number(BigInt(await rpc('eth_call',[{to:asset.contract,data:'0x313ce567'},hex(end)])));
      if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('Precisão inválida.');
      // Retain previously tracked EOAs so a seller does not disappear from the sample.
      const retained=[];
      for(const previous of options.previous?.assets?.find(a=>a.contract===asset.contract)?.positions||[])
        if(valid(previous.address)&&!labels[previous.address]){accounts.set(previous.address,{hash:previous.address});retained.push(previous.address);}
      const recent=analysis.candidates.map(c=>c.address).filter(a=>accounts.has(a));
      const candidates=[...new Set([...retained.slice(0,4),...recent.slice(0,4),...holderCandidates,...accounts.keys()])].filter(a=>a!=='0x'+'0'.repeat(40)).slice(0,Math.min(12,Number(config.walletLimit)||8));
      for(const wallet of candidates){
        const code=await rpc('eth_getCode',[wallet,hex(end)]);if(code!=='0x')continue;
        const balances={},changes={},data='0x70a08231'+wallet.slice(2).padStart(64,'0');
        for(const [days,block] of Object.entries({0:end,...checkpoints})){
          try{balances[days]=Number(BigInt(await rpc('eth_call',[{to:asset.contract,data},hex(block)])))/10**decimals;}catch{balances[days]=null;}
        }
        for(const days of [1,7,30,90])changes[days]=Core.positionChange(balances[days],balances[0],priced.priceUsd);
        analysis.positions.push({address:wallet,label:labels[wallet]?.name||'Titular não identificado',balances,changes,blocks:{0:end,...checkpoints},timestamps:Object.fromEntries(Object.entries({0:end,...checkpoints}).map(([d,b])=>[d,new Date(blockTimes.get(b)).toISOString()])),source:`${EXPLORER}/address/${wallet}`,priceSource:analysis.coverage.priceSource,precision:'Quantidades aproximadas para exibição; não usar para execução financeira.'});
      }
      analysis.balanceCoverage={tracked:analysis.positions.length,withCurrent:analysis.positions.filter(p=>p.balances[0]!=null).length,with30d:analysis.positions.filter(p=>p.changes[30].available).length};
      analysis.candidates=analysis.candidates.slice(0,8);
      for(const candidate of analysis.candidates)for(const window of Object.values(candidate.windows))window.evidence=window.evidence.slice(0,2);
      if(!analysis.balanceCoverage.withCurrent)throw Error('Sem saldos atuais confirmados.');
      report.assets.push(analysis);
    }catch{report.errors.push({symbol:asset.symbol,message:'Fonte incompleta ou limite de consulta; coleta deste ativo não concluída.'});}
  }
  report.status=report.assets.length?(report.errors.length?'partial':'ready'):'unavailable';
  report.requestCount=requests;
  if(!options.noWrite)await write('onchain-report.json',report);
  return report;
}
module.exports={collectPublic};
if(require.main===module){
  if(process.argv.includes('--telegram-only')){
    fetch('https://raw.githubusercontent.com/ronyekinha-alt/sentinel_scam_dashboard/main/onchain-report.json',{signal:AbortSignal.timeout(15000)}).then(async r=>{if(!r.ok)throw Error('Relatório público indisponível.');return r.json();}).then(report=>notify(report)).then(result=>console.log(JSON.stringify({sent:result.sent}))).catch(e=>{console.error(e.message);process.exitCode=1;});
  }else fs.readFile(path.join(ROOT,'onchain-report.json'),'utf8').then(JSON.parse).catch(()=>null).then(previous=>collectPublic({previous})).then(report=>console.log(JSON.stringify({status:report.status,requests:report.requestCount,coverage:report.assets.map(a=>({symbol:a.symbol,...a.balanceCoverage})),errors:report.errors}))).catch(()=>{console.error('Coleta pública falhou.');process.exitCode=1;});
}
