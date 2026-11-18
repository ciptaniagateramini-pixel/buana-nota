<?php
declare(strict_types=1);
require __DIR__.'/../inc/lib.php';
if($_SERVER['REQUEST_METHOD']!=='POST') fail('Metode tidak didukung',405);
need_xhr();
$d=body();
if(!empty($d['website'])) json_out(['ok'=>true,'no_order'=>'ORD-OK']); // jebakan bot
$cl=fn($s,$n)=>mb_substr(trim((string)$s),0,$n);
$nama=$cl($d['nama']??'',120);$kontak=$cl($d['kontak']??'',40);$email=$cl($d['email']??'',120);$alamat=$cl($d['alamat']??'',600);
if($nama==='') fail('Nama wajib diisi.');
if($kontak===''||!preg_match('/^[0-9+\-\s()]{6,40}$/',$kontak)) fail('No. HP/WhatsApp tidak valid.');
if($email!==''&&!filter_var($email,FILTER_VALIDATE_EMAIL)) fail('Format email belum benar.');
if($alamat==='') fail('Alamat wajib diisi.');
$raw=$d['items']??[];if(!is_array($raw)||!$raw) fail('Isi minimal satu barang.');
if(count($raw)>60) fail('Terlalu banyak baris barang.');
$items=[];
foreach($raw as $r){
  if(!is_array($r)) continue;
  $n=$cl($r['nama']??'',200);$q=(float)($r['qty']??0);$s=$cl($r['satuan']??'',20);$k=$cl($r['ket']??'',200);
  if($n===''&&$q<=0) continue;
  if($n==='') fail('Ada baris barang tanpa nama.');
  if($q<=0||$q>1000000) fail("Jumlah untuk \"$n\" tidak valid.");
  if($s==='') fail("Satuan untuk \"$n\" belum diisi.");
  $items[]=['nama'=>$n,'qty'=>$q,'satuan'=>$s,'ket'=>$k];
}
if(!$items) fail('Isi minimal satu barang.');
$ip=client_ip();
$c=db()->prepare("SELECT COUNT(*) FROM orders WHERE ip=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 HOUR)");$c->execute([$ip]);
if((int)$c->fetchColumn()>=8) fail('Terlalu banyak pesanan dari perangkat ini. Coba lagi nanti.',429);
$pdo=db();$pdo->beginTransaction();
try{
  $no='ORD-'.date('Ymd').'-'.str_pad((string)next_seq('ord-'.date('Ymd')),3,'0',STR_PAD_LEFT);
  $pdo->prepare("INSERT INTO orders(no_order,nama,kontak,email,alamat,items_asli,ip) VALUES(?,?,?,?,?,?,?)")
      ->execute([$no,$nama,$kontak,$email,$alamat,json_encode($items,JSON_UNESCAPED_UNICODE),$ip]);
  $oid=(int)$pdo->lastInsertId();
  $ins=$pdo->prepare("INSERT INTO order_items(order_id,urut,nama,qty,satuan,ket) VALUES(?,?,?,?,?,?)");
  foreach($items as $i=>$it) $ins->execute([$oid,$i,$it['nama'],$it['qty'],$it['satuan'],$it['ket']]);
  log_act($oid,null,'order_masuk',$no);
  $pdo->commit();
}catch(Throwable $e){ $pdo->rollBack(); fail('Gagal menyimpan pesanan.',500); }
json_out(['ok'=>true,'no_order'=>$no]);
