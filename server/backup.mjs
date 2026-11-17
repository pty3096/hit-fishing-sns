import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,existsSync,chmodSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export async function backupDatabase(source,destination) {
  if(resolve(source)===resolve(destination))throw new Error('백업 경로는 원본과 달라야 합니다.');
  if(existsSync(destination))throw new Error('기존 백업 파일을 덮어쓰지 않습니다. 새 경로를 지정해주세요.');
  mkdirSync(dirname(destination),{recursive:true,mode:0o700});
  const db=new DatabaseSync(source,{readOnly:true});
  try{await backup(db,destination);}finally{db.close();}
  chmodSync(destination,0o600);
  const copy=new DatabaseSync(destination,{readOnly:true});
  try{if(copy.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('백업 무결성 검사가 실패했습니다.');}finally{copy.close();}
  return destination;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const source=process.env.HIT_DB||resolve('data/hit.sqlite');
  const destination=process.argv[2]||resolve(dirname(source),'backups',`hit-${Date.now()}.sqlite`);
  try{console.log('백업 및 무결성 검사 완료: '+await backupDatabase(source,destination));}catch{console.error('백업하지 못했습니다. 원본 경로와 저장 공간을 확인해주세요.');process.exitCode=1;}
}
