<?php
declare(strict_types=1);
require __DIR__.'/../inc/lib.php';
$act=$_GET['action']??'';
$post=$_SERVER['REQUEST_METHOD']==='POST';
if($post) need_xhr();
$d=$post?body():[];
const SAT_MAX=20;

function fmt_order(array $o,bool $detail=false): array {
  $r=['id'=>(int)$o['id'],'noOrder'=>$o['no_order'],'status'=>$o['status'],'bayar'=>$o['bayar'],
    'pemesan'=>['nama'=>$o['nama'],'kontak'=>$o['kontak'],'email'=>$o['email'],'alamat'=>$o['alamat']],
    'createdAt'=>strtotime($o['created_at'])*1000,'diskon'=>(float)$o['diskon'],'ongkir'=>(float)$o['ongkir'],
    'noNota'=>$o['no_nota'],'tglNota'=>$o['tgl_nota']?strtotime($o['tgl_nota'])*1000:null,
    'noSJ'=>$o['no_sj'],'tglSJ'=>$o['tgl_sj']?strtotime($o['tgl_sj'])*1000:null,'driver'=>$o['driver'],'plat'=>$o['plat'],
    'updatedAt'=>strtotime($o['updated_at'])*1000];
  if(isset($o['jml_item'])) $r['jmlItem']=(int)$o['jml_item'];
  if(isset($o['sub'])) $r['total']=(float)$o['sub']-(float)$o['diskon']+(float)$o['ongkir'];
  if($detail){
    $r['itemsAsli']=json_decode($o['items_asli'],true)?:[];
    $s=db()->prepare("SELECT nama,qty,satuan,ket,harga FROM order_items WHERE order_id=? ORDER BY urut,id");$s->execute([$o['id']]);
    $r['items']=array_map(fn($i)=>['nama'=>$i['nama'],'qty'=>(float)$i['qty'],'satuan'=>$i['satuan'],'ket'=>$i['ket'],'harga'=>(float)$i['harga']],$s->fetchAll());
    $l=db()->prepare("SELECT l.aksi,l.detail,l.created_at,u.nama AS oleh FROM log l LEFT JOIN users u ON u.id=l.user_id WHERE l.order_id=? ORDER BY l.id");$l->execute([$o['id']]);
    $r['log']=array_map(fn($x)=>['aksi'=>$x['aksi'],'detail'=>$x['detail'],'at'=>strtotime($x['created_at'])*1000,'oleh'=>$x['oleh']],$l->fetchAll());
  }
  return $r;
}
function load_order(int $id,bool $lock=false): array {
  $s=db()->prepare("SELECT * FROM orders WHERE id=?".($lock?" FOR UPDATE":""));$s->execute([$id]);
  $o=$s->fetch();if(!$o) fail('Order tidak ditemukan',404);return $o;
}
function clean_items($raw,bool $needPrice): array {
  if(!is_array($raw)) fail('Data barang tidak valid');
  $out=[];
  foreach($raw as $r){
    if(!is_array($r)) continue;
    $n=mb_substr(trim((string)($r['nama']??'')),0,200);if($n==='') continue;
    $q=round((float)($r['qty']??0),2);$h=round((float)($r['harga']??0),2);
    $s=mb_substr(trim((string)($r['satuan']??'')),0,SAT_MAX);$k=mb_substr(trim((string)($r['ket']??'')),0,200);
    if($q<=0) fail("Jumlah \"$n\" harus lebih dari 0.");
    if($s==='') fail("Satuan \"$n\" kosong.");
    if($h<0||$h>100000000000) fail("Harga \"$n\" tidak valid.");
    if($needPrice&&$h<=0) fail("Harga \"$n\" belum diisi.");
    $out[]=['nama'=>$n,'qty'=>$q,'satuan'=>$s,'ket'=>$k,'harga'=>$h];
  }
  if(count($out)>80) fail('Terlalu banyak baris.');
  if(!$out) fail('Isi minimal satu barang.');
  return $out;
}
function replace_items(int $oid,array $items): void {
  db()->prepare("DELETE FROM order_items WHERE order_id=?")->execute([$oid]);
  $i=db()->prepare("INSERT INTO order_items(order_id,urut,nama,qty,satuan,ket,harga) VALUES(?,?,?,?,?,?,?)");
  foreach($items as $k=>$it) $i->execute([$oid,$k,$it['nama'],$it['qty'],$it['satuan'],$it['ket'],$it['harga']]);
}
function money($v): float { $v=round((float)$v,2); if($v<0||$v>100000000000) fail('Nilai uang tidak valid.'); return $v; }

/* ---------- login / sesi ---------- */
if($act==='login'&&$post){
  $ip=client_ip();
  $c=db()->prepare("SELECT COUNT(*) FROM login_fail WHERE ip=? AND created_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE)");$c->execute([$ip]);
  if((int)$c->fetchColumn()>=8) fail('Terlalu banyak percobaan. Coba lagi 15 menit lagi.',429);
  $nama=trim((string)($d['nama']??''));$pin=(string)($d['pin']??'');
  $s=db()->prepare("SELECT id,pin_hash,aktif FROM users WHERE nama=?");$s->execute([$nama]);$u=$s->fetch();
  if(!$u||!$u['aktif']||!password_verify($pin,$u['pin_hash'])){
    db()->prepare("INSERT INTO login_fail(ip) VALUES(?)")->execute([$ip]);usleep(400000);fail('Nama atau PIN salah.',401);
  }
  db()->prepare("DELETE FROM login_fail WHERE ip=?")->execute([$ip]);
  start_session((int)$u['id']);log_act(null,(int)$u['id'],'login');
  json_out(['ok'=>true]);
}
if($act==='logout'&&$post){
  $t=$_COOKIE[COOKIE]??'';if($t) db()->prepare("DELETE FROM sessions WHERE token_hash=?")->execute([hash('sha256',$t)]);
  set_cookie('',true);json_out(['ok'=>true]);
}
if($act==='me'){ $u=current_user();json_out(['user'=>$u]); }

$U=require_user();

/* ---------- order ---------- */
if($act==='orders'){
  $rows=db()->query("SELECT o.*,(SELECT COUNT(*) FROM order_items WHERE order_id=o.id) jml_item,(SELECT COALESCE(SUM(qty*harga),0) FROM order_items WHERE order_id=o.id) sub FROM orders o ORDER BY o.id DESC LIMIT 500")->fetchAll();
  json_out(['orders'=>array_map('fmt_order',$rows)]);
}
if($act==='order'){ json_out(['order'=>fmt_order(load_order((int)($_GET['id']??0)),true)]); }

if($act==='save_draft'&&$post){
  $pdo=db();$pdo->beginTransaction();
  $o=load_order((int)($d["id"]??0),true);if($o['status']!=='Masuk') fail('Order sudah diproses, tidak bisa diubah.',409);
  replace_items((int)$o['id'],clean_items($d['items']??[],false));
  $pdo->prepare("UPDATE orders SET diskon=?,ongkir=? WHERE id=?")->execute([money($d['diskon']??0),money($d['ongkir']??0),$o['id']]);
  log_act((int)$o['id'],$U['id'],'simpan_draft');$pdo->commit();
  json_out(['order'=>fmt_order(load_order((int)$o['id']),true)]);
}
if($act==='issue_nota'&&$post){
  $pdo=db();$pdo->beginTransaction();
  $o=load_order((int)($d["id"]??0),true);if($o['status']!=='Masuk') fail('Nota sudah pernah diterbitkan atau order dibatalkan.',409);
  $items=clean_items($d['items']??[],true);$dis=money($d['diskon']??0);$ong=money($d['ongkir']??0);
  $sub=array_sum(array_map(fn($i)=>$i['qty']*$i['harga'],$items));
  if($sub-$dis+$ong<0) fail('Diskon melebihi total.');
  replace_items((int)$o['id'],$items);
  $no=sprintf('BSD/%s/%04d',date('Y/m'),next_seq('nota-'.date('Y-m')));
  $pdo->prepare("UPDATE orders SET diskon=?,ongkir=?,no_nota=?,tgl_nota=NOW(),nota_oleh=?,status='Nota terbit' WHERE id=?")->execute([$dis,$ong,$no,$U['id'],$o['id']]);
  log_act((int)$o['id'],$U['id'],'nota_terbit',$no);$pdo->commit();
  json_out(['order'=>fmt_order(load_order((int)$o['id']),true)]);
}
if($act==='issue_sj'&&$post){
  $pdo=db();$pdo->beginTransaction();
  $o=load_order((int)($d["id"]??0),true);if($o['status']!=='Nota terbit') fail('Surat jalan hanya bisa diterbitkan setelah nota terbit.',409);
  $drv=mb_substr(trim((string)($d['driver']??'')),0,80);$plat=mb_strtoupper(mb_substr(trim((string)($d['plat']??'')),0,20));
  if($drv==='') fail('Nama driver wajib diisi.');if($plat==='') fail('No. plat wajib diisi.');
  $no=sprintf('SJ/BSD/%s/%04d',date('Y/m'),next_seq('sj-'.date('Y-m')));
  $pdo->prepare("UPDATE orders SET driver=?,plat=?,no_sj=?,tgl_sj=NOW(),sj_oleh=?,status='Surat jalan terbit' WHERE id=?")->execute([$drv,$plat,$no,$U['id'],$o['id']]);
  log_act((int)$o['id'],$U['id'],'sj_terbit',"$no / $drv / $plat");$pdo->commit();
  json_out(['order'=>fmt_order(load_order((int)$o['id']),true)]);
}
if($act==='set_bayar'&&$post){
  $b=$d['bayar']??'';if(!in_array($b,['Belum bayar','DP','Lunas'],true)) fail('Status bayar tidak valid.');
  $o=load_order((int)($d["id"]??0));if($o['status']==='Batal') fail('Order sudah dibatalkan.',409);
  db()->prepare("UPDATE orders SET bayar=? WHERE id=?")->execute([$b,$o['id']]);log_act((int)$o['id'],$U['id'],'bayar',$b);
  json_out(['order'=>fmt_order(load_order((int)$o['id']),true)]);
}
if($act==='finish'&&$post){
  $o=load_order((int)($d["id"]??0));if(!in_array($o['status'],['Nota terbit','Surat jalan terbit'],true)) fail('Status tidak bisa diselesaikan.',409);
  db()->prepare("UPDATE orders SET status='Selesai' WHERE id=?")->execute([$o['id']]);log_act((int)$o['id'],$U['id'],'selesai');
  json_out(['order'=>fmt_order(load_order((int)$o['id']),true)]);
}
if($act==='cancel'&&$post){
  $o=load_order((int)($d["id"]??0));
  if($o['status']==='Batal'||$o['status']==='Selesai') fail('Order tidak bisa dibatalkan.',409);
  if($o['status']!=='Masuk'&&$U['role']!=='admin') fail('Hanya admin yang boleh membatalkan nota yang sudah terbit.',403);
  db()->prepare("UPDATE orders SET status='Batal' WHERE id=?")->execute([$o['id']]);log_act((int)$o['id'],$U['id'],'batal');
  json_out(['order'=>fmt_order(load_order((int)$o['id']),true)]);
}

/* ---------- rekap ---------- */
function month_range(): array {
  $b=$_GET['bulan']??date('Y-m');if(!preg_match('/^\d{4}-\d{2}$/',$b)) fail('Bulan tidak valid');
  return [$b.'-01 00:00:00',date('Y-m-d H:i:s',strtotime($b.'-01 +1 month')),$b];
}
if($act==='rekap'){
  [$a,$z,$b]=month_range();
  $s=db()->prepare("SELECT o.id,o.no_nota,o.tgl_nota,o.nama,o.status,o.bayar,o.diskon,o.ongkir,(SELECT COALESCE(SUM(qty*harga),0) FROM order_items WHERE order_id=o.id) sub FROM orders o WHERE o.no_nota IS NOT NULL AND o.tgl_nota>=? AND o.tgl_nota<? ORDER BY o.tgl_nota,o.id");
  $s->execute([$a,$z]);$nota=[];$omzet=0;$bb=0;$dp=0;$lunas=0;$batal=0;
  foreach($s->fetchAll() as $r){
    $t=(float)$r['sub']-(float)$r['diskon']+(float)$r['ongkir'];
    $nota[]=['noNota'=>$r['no_nota'],'tgl'=>strtotime($r['tgl_nota'])*1000,'nama'=>$r['nama'],'status'=>$r['status'],'bayar'=>$r['bayar'],'total'=>$t];
    if($r['status']==='Batal'){$batal++;continue;}
    $omzet+=$t;if($r['bayar']==='Lunas')$lunas+=$t;elseif($r['bayar']==='DP')$dp+=$t;else $bb+=$t;
  }
  $s=db()->prepare("SELECT LOWER(i.nama) k,MIN(i.nama) nama,MIN(i.satuan) satuan,SUM(i.qty) qty,SUM(i.qty*i.harga) nilai FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.no_nota IS NOT NULL AND o.status<>'Batal' AND o.tgl_nota>=? AND o.tgl_nota<? GROUP BY LOWER(i.nama) ORDER BY nilai DESC LIMIT 10");
  $s->execute([$a,$z]);
  $c=db()->prepare("SELECT status,COUNT(*) n FROM orders WHERE created_at>=? AND created_at<? GROUP BY status");$c->execute([$a,$z]);
  json_out(['bulan'=>$b,'omzet'=>$omzet,'lunas'=>$lunas,'dp'=>$dp,'belumBayar'=>$bb,'batal'=>$batal,'nota'=>$nota,'topBarang'=>$s->fetchAll(),'orderPerStatus'=>$c->fetchAll(PDO::FETCH_KEY_PAIR)]);
}
if($act==='export_csv'){
  [$a,$z,$b]=month_range();
  header('Content-Type: text/csv; charset=utf-8');header('Content-Disposition: attachment; filename="rekap-nota-'.$b.'.csv"');
  $out=fopen('php://output','w');fwrite($out,"\xEF\xBB\xBF");
  $row=fn($r)=>fputcsv($out,$r,';');
  $row(['No Nota','Tanggal','Pelanggan','Barang','Jumlah','Satuan','Harga Satuan','Subtotal','Diskon Nota','Ongkir Nota','Total Nota','Pembayaran','Status']);
  $s=db()->prepare("SELECT o.*,(SELECT COALESCE(SUM(qty*harga),0) FROM order_items WHERE order_id=o.id) sub FROM orders o WHERE o.no_nota IS NOT NULL AND o.tgl_nota>=? AND o.tgl_nota<? ORDER BY o.tgl_nota,o.id");$s->execute([$a,$z]);
  $it=db()->prepare("SELECT nama,qty,satuan,harga FROM order_items WHERE order_id=? ORDER BY urut,id");
  foreach($s->fetchAll() as $o){
    $tot=(float)$o['sub']-(float)$o['diskon']+(float)$o['ongkir'];$it->execute([$o['id']]);$first=true;
    foreach($it->fetchAll() as $i){
      $row([$o['no_nota'],date('Y-m-d',strtotime($o['tgl_nota'])),$o['nama'],$i['nama'],(float)$i['qty'],$i['satuan'],(float)$i['harga'],(float)$i['qty']*(float)$i['harga'],
        $first?(float)$o['diskon']:'',$first?(float)$o['ongkir']:'',$first?$tot:'',$o['bayar'],$o['status']]);$first=false;
    }
  }
  exit;
}

/* ---------- pengguna ---------- */
if($act==='ganti_pin'&&$post){
  $s=db()->prepare("SELECT pin_hash FROM users WHERE id=?");$s->execute([$U['id']]);
  if(!password_verify((string)($d['lama']??''),(string)$s->fetchColumn())) fail('PIN lama salah.');
  if(!preg_match('/^\d{6}$/',(string)($d['baru']??''))) fail('PIN baru harus 6 angka.');
  db()->prepare("UPDATE users SET pin_hash=? WHERE id=?")->execute([password_hash($d['baru'],PASSWORD_DEFAULT),$U['id']]);
  json_out(['ok'=>true]);
}
if($act==='users'){ require_admin();json_out(['users'=>db()->query("SELECT id,nama,role,aktif FROM users ORDER BY id")->fetchAll()]); }
if($act==='user_add'&&$post){
  require_admin();$n=mb_substr(trim((string)($d['nama']??'')),0,60);$pin=(string)($d['pin']??'');$role=($d['role']??'')==='admin'?'admin':'petugas';
  if($n==='') fail('Nama wajib diisi.');if(!preg_match('/^\d{6}$/',$pin)) fail('PIN harus 6 angka.');
  try{db()->prepare("INSERT INTO users(nama,pin_hash,role) VALUES(?,?,?)")->execute([$n,password_hash($pin,PASSWORD_DEFAULT),$role]);}
  catch(PDOException $e){fail('Nama sudah dipakai.');}
  json_out(['ok'=>true]);
}
if($act==='user_update'&&$post){
  $A=require_admin();$id=(int)($d['id']??0);
  if(isset($d['pin'])&&$d['pin']!==''){
    if(!preg_match('/^\d{6}$/',(string)$d['pin'])) fail('PIN harus 6 angka.');
    db()->prepare("UPDATE users SET pin_hash=? WHERE id=?")->execute([password_hash((string)$d['pin'],PASSWORD_DEFAULT),$id]);
    db()->prepare("DELETE FROM sessions WHERE user_id=?")->execute([$id]);
  }
  if(isset($d['aktif'])){
    if($id===$A['id']&&!$d['aktif']) fail('Tidak bisa menonaktifkan akun sendiri.');
    db()->prepare("UPDATE users SET aktif=? WHERE id=?")->execute([$d['aktif']?1:0,$id]);
    if(!$d['aktif']) db()->prepare("DELETE FROM sessions WHERE user_id=?")->execute([$id]);
  }
  json_out(['ok'=>true]);
}
fail('Aksi tidak dikenal',404);
