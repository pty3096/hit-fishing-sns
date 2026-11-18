import test from 'node:test';
import assert from 'node:assert/strict';
import {marketFilters,marketSearchError,marketPath} from '../public/market-search.mjs';
import {parseRoute} from '../public/ui.mjs';

test('market filters round-trip literal keywords, zero bounds, author and status for links and API pagination',()=>{
  const fields={q:'릴 & 가방_%\\?',region:' 강릉 ',min_price:'0',max_price:'20000'};
  const hash=marketPath(fields,'sold',12),parsed=parseRoute(hash);
  assert.equal(parsed.route,'market');assert.equal(parsed.params.get('author'),'12');assert.equal(parsed.params.get('status'),'sold');
  assert.deepEqual(marketFilters(parsed.params),{...fields,region:'강릉'});
  const api=new URL(marketPath(fields,'sold',12,true),'https://hit.example.test');
  assert.equal(api.searchParams.get('kind'),'market');assert.equal(api.searchParams.get('trade_status'),'sold');assert.equal(api.searchParams.get('max_price'),'20000');
  assert.equal(api.searchParams.get('min_price'),'0');assert.equal(api.searchParams.get('q'),fields.q);
  assert.equal(parseRoute(marketPath({},'all',12)).params.get('q'),null);
});

test('market price validation accepts free and inclusive integer bounds while rejecting malformed and reversed ranges',()=>{
  for(const fields of [{},{max_price:'0'},{min_price:'0',max_price:'0'},{min_price:' 15000 ',max_price:'15000'},{max_price:'1000000000'}])assert.equal(marketSearchError(fields),'');
  for(const value of ['-1','1.1','1e3','Infinity','NaN','1000000001','9007199254740992','x','+1'])assert.match(marketSearchError({min_price:value}),/가격 조건/);
  assert.match(marketSearchError({min_price:'15001',max_price:'15000'}),/최저 가격/);
  assert.match(marketSearchError({q:'가'.repeat(81)}),/80자/);
});
