import test from 'node:test';
import assert from 'node:assert/strict';
import {mapRegions,regionMapView,regionMapPath} from '../public/region-map.mjs';
import {navigationSection,parseRoute} from '../public/ui.mjs';

test('region map uses fixed broad windows and never puts arbitrary search text in external URLs',()=>{
  for(const region of mapRegions){
    const view=regionMapView(region.region),url=new URL(view.embed);
    assert.equal(url.origin,'https://www.openstreetmap.org');
    assert.equal(url.pathname,'/export/embed.html');assert.equal(view.matched,true);
    assert.deepEqual(url.searchParams.get('bbox').split(',').map(Number),region.bbox);
    assert.equal(url.searchParams.has('marker'),false);
    const [w,s,e,n]=region.bbox;assert.ok(w<e&&s<n&&e-w>=0.5&&n-s>=0.4);
  }
  for(const input of ['unknown','<script>&?','https://other.example','강릉시']){
    const view=regionMapView(input);assert.equal(view.matched,false);
    assert.equal(view.embed,regionMapView().embed);assert.equal(view.external,regionMapView().external);
  }
});

test('map search keeps literal region text and URL history separate from external map parameters',()=>{
  const region=' 강릉 & 거제_%? ';
  assert.deepEqual(Object.fromEntries(parseRoute(regionMapPath(region)).params),{region:region.trim()});
  assert.equal(regionMapPath('  '),'#map');
  assert.equal(parseRoute(regionMapPath('가'.repeat(100))).params.get('region').length,50);
  assert.equal(navigationSection('map'),'map');
});
