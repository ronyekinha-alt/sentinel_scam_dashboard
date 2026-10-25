const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../onchain-core.js'),Monitor=require('../onchain-monitor.cjs');
const {collectPublic}=require('../onchain-public.cjs');
const now=Date.parse('2026-10-25T12:00:00Z'),DAY=86400000;
const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const asset={symbol:'TEST',network:'eth-mainnet',contract:'0x'+'a'.repeat(40),whaleThresholdUsd:1,priceUsd:1};
const coverage={complete:true,startTime:now-90*DAY,collectedAt:new Date(now).toISOString()};
function swaps(){return [1,2,3].flatMap(day=>['buy','sell'].map(side=>({id:day+side,kind:'swap',wallet,side,quantity:side==='buy'?3:1,quoteUsd:side==='buy'?3:1,source:'verified-test-decoder',transactionHash:'0x'+String(day),timestamp:new Date(now-day*DAY).toISOString()})));}
test('saldo triplica sem confundir valorização: 1 milhão para 3 milhões a preço constante',()=>{const change=Core.positionChange(1000000,3000000,1);assert.equal(change.delta,2000000);assert.equal(change.percent,200);assert.equal(change.priceNeutralUsd,2000000);});
test('coleta pública sem credenciais compara saldos e mantém descoberta parcial',async()=>{
  const fetcher=async(url,options)=>{let payload;
    if(!options?.body){payload=url.endsWith('/holders')?{items:[{address:{hash:wallet,is_contract:false}}]}:url.includes('/transfers')?{items:[],next_page_params:null}:{decimals:'0',exchange_rate:'1'};}
    else{const q=JSON.parse(options.body);let result;
      if(q.method==='eth_blockNumber')result='0xf4240';
      else if(q.method==='eth_getBlockByNumber')result={timestamp:'0x'+Math.floor((now-100*DAY+Number(BigInt(q.params[0]))*100*DAY/1000000)/1000).toString(16)};
      else if(q.method==='eth_getCode')result='0x';
      else if(q.params[0].data==='0x313ce567')result='0x0';
      else result=Number(BigInt(q.params[1]))>900000?'0x2dc6c0':'0xf4240';
      payload={result};
    }return {ok:true,json:async()=>payload};
  };
  const report=await collectPublic({config:{assets:[asset]},fetcher,noDelay:true,noWrite:true,now});
  assert.equal(report.status,'ready');assert.equal(report.assets[0].positions[0].changes[30].delta,2000000);assert.equal(report.assets[0].coverage.complete,false);
});
test('nova posição não divide por zero e saldo ausente não vira saldo zero',()=>{assert.equal(Core.positionChange(0,10,1).newPosition,true);assert.equal(Core.positionChange(null,10,1).available,false);assert.equal(Core.positionChange(10,10,3).priceNeutralUsd,0);});
test('comprar 3 e vender 1 acumula 2 por dia',()=>{const r=Core.analyse(asset,swaps(),{},now,coverage),w=r.candidates[0].windows[30];assert.equal(w.buys,9);assert.equal(w.sells,3);assert.equal(w.netTraded,6);assert.equal(r.candidates[0].signal,true);assert.equal(w.buyDays.length,3);});
test('deduplica eventos e ignora futuros e valores inválidos',()=>{const records=swaps();records.push(records[0],{...records[0],id:'future',timestamp:new Date(now+DAY).toISOString()},{...records[0],id:'bad',quantity:NaN});assert.equal(Core.analyse(asset,records,{},now,coverage).recordCount,6);});
test('transferências recorrentes não são compras',()=>{const records=[1,2,3].map(day=>({id:String(day),kind:'transfer',from:other,to:wallet,quantity:100000,timestamp:new Date(now-day*DAY).toISOString(),source:'test'}));const r=Core.analyse(asset,records,{},now,coverage);assert.equal(r.candidates.find(w=>w.address===wallet).windows[30].buys,0);assert(r.candidates.every(w=>!w.signal));});
test('exclui pools e transferências internas',()=>{const records=[...swaps(),{id:'self',kind:'transfer',from:wallet,to:wallet,quantity:10,timestamp:new Date(now).toISOString(),source:'test'}];assert.equal(Core.analyse(asset,records,{[wallet]:{type:'pool',source:'test'}},now,coverage).candidates.length,0);});
test('histórico parcial ou antigo nunca habilita alerta de compras',()=>{for(const c of [{...coverage,complete:false},{...coverage,collectedAt:new Date(now-2*DAY).toISOString()}])assert.equal(Core.analyse(asset,swaps(),{},now,c).candidates[0].signal,false);});
test('desbloqueios sem revisão recente ou denominador não geram alerta',()=>{const e={symbol:'TEST',date:new Date(now+DAY).toISOString(),amount:20,circulatingSupply:1000,source:'https://example.org/docs',confirmed:true,reviewedAt:new Date(now).toISOString()};assert.equal(Core.unlocks([e],now)[0].attention,true);assert.equal(Core.unlocks([{...e,reviewedAt:'2020-01-01'}],now)[0].attention,false);assert.equal(Core.unlocks([{...e,circulatingSupply:null}],now)[0].attention,false);});
test('entrega deduplicada só após confirmação e HTML escapado',async()=>{const a=Core.analyse(asset,swaps(),{},now,coverage),report={status:'ready',asOf:new Date(now).toISOString(),assets:[a],unlocks:[]};let sent=0;const first=await Monitor.notify(report,{state:{sent:{}},noWrite:true,send:async()=>{sent++;}});await Monitor.notify(report,{state:first.state,noWrite:true,send:async()=>{sent++;}});assert.equal(sent,1);assert(Core.telegramMessage({symbol:'<x>',text:'a&b'}).includes('&lt;x&gt;'));const state={sent:{}};await assert.rejects(Monitor.notify(report,{state,noWrite:true,send:async()=>{throw Error('failed');}}));assert.equal(Object.keys(state.sent).length,0);});
test('sem chave não consulta fontes nem apresenta monitor ativo',async()=>{const r=await Monitor.run({config:{assets:[asset]},key:'',noWrite:true,fetcher:()=>{throw Error('must not fetch');},now});assert.equal(r.status,'unconfigured');assert.deepEqual(r.assets,[]);});
test('um relatório antigo não envia alertas mesmo com flag fresh antiga',async()=>{const a=Core.analyse(asset,swaps(),{},now,coverage),result=await Monitor.notify({status:'ready',asOf:new Date(now-2*DAY).toISOString(),assets:[a],unlocks:[]},{now,state:{sent:{}},noWrite:true,send:async()=>{throw Error('não deveria enviar');}});assert.equal(result.sent,0);});
test('coletor consulta saldos históricos reais mesmo com descoberta parcial',async()=>{
  const methods=[];
  const fetcher=async(url,options)=>{const request=JSON.parse(options.body);methods.push(request.method);let result;
    if(request.method==='eth_blockNumber') result='0x186a0';
    else if(request.method==='eth_getBlockByNumber') result={timestamp:'0x'+Math.floor((now-100*DAY+Number(BigInt(request.params[0]))*100*DAY/100000)/1000).toString(16)};
    else if(request.method==='alchemy_getAssetTransfers')result={transfers:[{uniqueId:'tx1',from:other,to:wallet,value:2,hash:'0x123',metadata:{blockTimestamp:new Date(now-DAY).toISOString()}}],pageKey:'more'};
    else if(request.method==='eth_getCode')result='0x';
    else if(request.params[0].data==='0x313ce567')result='0x0';
    else result=Number(BigInt(request.params[1]))>90000?'0x2dc6c0':'0xf4240';
    return {ok:true,json:async()=>({result})};
  };
  const result=await Monitor.collect(asset,'TEST-ONLY',fetcher,now,1);
  assert.equal(result.coverage.complete,false);assert.equal(result.positions.length,2);assert(result.positions.every(p=>p.changes[30].delta===2000000));assert(methods.includes('eth_call'));assert.equal(result.coverage.negotiationsDecoded,false);
});
