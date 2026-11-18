import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRoute,searchPath,navigationSection,canWrite,galleryPosition} from '../public/ui.mjs';

test('search links preserve Korean text and literal special characters when returning from a post',()=>{
  const filters=new URLSearchParams({fish:' 농어 ',region:'강릉 & 100%_지점'});
  const path=searchPath(filters);
  const {route,params}=parseRoute('#search'+path.slice(path.indexOf('?')));
  assert.equal(route,'search');assert.equal(params.get('fish'),'농어');assert.equal(params.get('region'),'강릉 & 100%_지점');
  assert.equal(searchPath(params),path);assert.equal(searchPath(new URLSearchParams({fish:'  ',region:''})),'/posts');
  assert.equal(parseRoute('').route,'home');
  assert.equal(navigationSection('following'),'home');assert.equal(navigationSection('post/2'),'home');assert.equal(navigationSection('edit/2'),'write');assert.equal(navigationSection('profile-edit'),'profile');
});

test('writing prompts distinguish login, email verification and suspension before typing',()=>{
  const verified={email_verified:true,suspended:false};
  assert.equal(canWrite(null,{verification_required:true}),false);
  assert.equal(canWrite({email_verified:false},{verification_required:true}),false);
  assert.equal(canWrite(verified,{verification_required:true}),true);
  assert.equal(canWrite({...verified,suspended:true},{verification_required:true}),false);
  assert.equal(canWrite({email_verified:false},{verification_required:false}),true);
});

test('gallery controls handle first and last photos, overscroll and unmeasured layout',()=>{
  assert.equal(galleryPosition(0,360,3),0);assert.equal(galleryPosition(360,360,3),1);assert.equal(galleryPosition(720,360,3),2);
  assert.equal(galleryPosition(-50,360,3),0);assert.equal(galleryPosition(1000,360,3),2);assert.equal(galleryPosition(500,0,3),0);assert.equal(galleryPosition(0,360,0),0);
});

test('photo picker explains iPhone formats, size and count without accepting disguised files',async()=>{
 const {photoSelectionError:check}=await import('../public/ui.mjs');
 const jpg={name:'sea.jpg',type:'image/jpeg',size:100};
 assert.equal(check([jpg],4),'');assert.equal(check([],5),'');
 assert.match(check([jpg],5),/최대 5장/);
 assert.match(check([{name:'IMG.HEIC',type:'',size:100}]),/확장자만/);
 assert.match(check([{name:'sea.jpg',type:'image/heif',size:100}]),/HEIC/);
 assert.match(check([{...jpg,size:10*1024*1024+1}]),/10MB/);
 assert.equal(check([{...jpg,size:10*1024*1024}]),'');
 assert.match(check([{...jpg,size:0}]),/빈 사진/);
 assert.match(check([{...jpg,type:'image/gif'}]),/GIF/);
 assert.match(check([{...jpg,type:''}]),/JPG/);
});

test('extended search round-trips method and dates, validates impossible and reversed ranges',async()=>{
 const {searchValidation:validate}=await import('../public/ui.mjs');
 const fields={fish:'농어',region:'강릉',method:'루어 & 원투_%',date_from:'2024-02-29',date_to:'2026-11-17'};
 const path=searchPath(new URLSearchParams(fields));
 assert.deepEqual(Object.fromEntries(parseRoute('#search'+path.slice(path.indexOf('?'))).params),fields);
 assert.equal(validate(fields),'');assert.equal(validate({date_from:'2024-02-29'}),'');assert.equal(validate({date_to:'2026-11-17'}),'');
 assert.match(validate({date_from:'2025-02-29'}),/날짜/);assert.match(validate({date_to:'2026-11-31'}),/날짜/);
 assert.match(validate({date_from:'2026-11-18',date_to:'2026-11-17'}),/시작일/);
});

test('nickname search links preserve literal Korean queries and clear without exposing unrelated filters',async()=>{
 const {peoplePath}=await import('../public/ui.mjs');
 const query=' 바다 & 50%_\\? ';
 const parsed=parseRoute(peoplePath(query));assert.equal(parsed.route,'people');assert.equal(parsed.params.get('q'),query.trim());
 assert.equal(peoplePath('   '),'#people');assert.equal(peoplePath('친구',true),'/users?q='+encodeURIComponent('친구'));
 assert.equal(navigationSection('people'),'people');
});
