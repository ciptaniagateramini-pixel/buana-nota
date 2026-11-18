<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Jakarta');
function config_path(): string { return dirname(__DIR__,3).'/bsd-nota-config.php'; }
if(!is_file(config_path())){ http_response_code(503); header('Content-Type: application/json; charset=utf-8'); echo json_encode(['error'=>'Aplikasi belum dikonfigurasi. Buka /setup.php']); exit; }
require config_path();

function db(): PDO {
  static $p=null;
  if(!$p){
    $p=new PDO('mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',DB_USER,DB_PASS,[
      PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
    $p->exec("SET time_zone='+07:00'");
  }
  return $p;
}
function json_out($d,int $c=200): never {
  http_response_code($c);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
  echo json_encode($d,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;
}
function fail(string $m,int $c=400): never { json_out(['error'=>$m],$c); }
function body(): array { $r=json_decode(file_get_contents('php://input')?:'',true);return is_array($r)?$r:[]; }
function client_ip(): string { return substr($_SERVER['REMOTE_ADDR']??'',0,45); }
function is_https(): bool { return !empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off' || ($_SERVER['HTTP_X_FORWARDED_PROTO']??'')==='https'; }
function need_xhr(): void { if(($_SERVER['HTTP_X_REQUESTED_WITH']??'')!=='bsd') fail('Permintaan tidak valid',403); }

/* ---- penomoran aman (atomik) ---- */
function next_seq(string $name): int {
  $s=db()->prepare("INSERT INTO counters(name,val) VALUES(?,LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE val=LAST_INSERT_ID(val+1)");
  $s->execute([$name]);
  return (int)db()->lastInsertId();
}

/* ---- sesi perangkat ---- */
const COOKIE='bsd_t';
function current_user(): ?array {
  $t=$_COOKIE[COOKIE]??'';
  if(!preg_match('/^[a-f0-9]{64}$/',$t)) return null;
  $h=hash('sha256',$t);
  $s=db()->prepare("SELECT u.id,u.nama,u.role,s.expires FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>NOW() AND u.aktif=1");
  $s->execute([$h]);$u=$s->fetch();
  if(!$u) return null;
  if(strtotime($u['expires'])<time()+(SESSION_DAYS-1)*86400){
    db()->prepare("UPDATE sessions SET expires=DATE_ADD(NOW(),INTERVAL ? DAY) WHERE token_hash=?")->execute([SESSION_DAYS,$h]);
    set_cookie($t);
  }
  return ['id'=>(int)$u['id'],'nama'=>$u['nama'],'role'=>$u['role']];
}
function set_cookie(string $t,bool $clear=false): void {
  setcookie(COOKIE,$clear?'':$t,['expires'=>$clear?time()-3600:time()+SESSION_DAYS*86400,'path'=>BASE_PATH.'/','secure'=>is_https(),'httponly'=>true,'samesite'=>'Lax']);
}
function start_session(int $uid): void {
  $t=bin2hex(random_bytes(32));
  db()->prepare("INSERT INTO sessions(token_hash,user_id,expires,ua) VALUES(?,?,DATE_ADD(NOW(),INTERVAL ? DAY),?)")
    ->execute([hash('sha256',$t),$uid,SESSION_DAYS,substr($_SERVER['HTTP_USER_AGENT']??'',0,200)]);
  db()->exec("DELETE FROM sessions WHERE expires<NOW()");
  set_cookie($t);
}
function require_user(): array { $u=current_user(); if(!$u) fail('Belum masuk',401); return $u; }
function require_admin(): array { $u=require_user(); if($u['role']!=='admin') fail('Hanya admin',403); return $u; }
function log_act(?int $oid,?int $uid,string $aksi,string $detail=''): void {
  db()->prepare("INSERT INTO log(order_id,user_id,aksi,detail) VALUES(?,?,?,?)")->execute([$oid,$uid,$aksi,substr($detail,0,500)]);
}
