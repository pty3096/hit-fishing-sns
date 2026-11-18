// Broad viewing windows, never catch coordinates or exact fishing locations.
export const mapRegions = Object.freeze([
  {name:'전국',region:'',bbox:[124,32.5,132,39]},
  {name:'거제',region:'거제',bbox:[128.3,34.6,129,35.15]},
  {name:'통영',region:'통영',bbox:[128.1,34.55,128.65,35]},
  {name:'제주',region:'제주',bbox:[126,33.05,127.1,33.7]},
  {name:'부산',region:'부산',bbox:[128.75,34.85,129.4,35.45]},
  {name:'강릉',region:'강릉',bbox:[128.65,37.45,129.2,38]},
  {name:'여수',region:'여수',bbox:[127.3,34.3,128,34.95]},
  {name:'인천',region:'인천',bbox:[125.9,37.1,127,37.9]},
  {name:'태안',region:'태안',bbox:[125.9,36.35,126.65,37.1]}
]);
export function regionMapView(region='') {
  const selected=mapRegions.find(item=>item.region===region)||mapRegions[0];
  const query=new URLSearchParams({bbox:selected.bbox.join(','),layer:'mapnik'});
  const [west,south,east,north]=selected.bbox;
  return {name:selected.name,matched:!region||selected.region===region,
    embed:'https://www.openstreetmap.org/export/embed.html?'+query,
    external:`https://www.openstreetmap.org/#map=${selected.region?9:7}/${(south+north)/2}/${(west+east)/2}`};
}
export function regionMapPath(region='') {
  const value=region.trim().slice(0,50);
  return '#map'+(value?'?'+new URLSearchParams({region:value}):'');
}
