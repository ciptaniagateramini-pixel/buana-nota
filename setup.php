<?php
declare(strict_types=1);
date_default_timezone_set('Asia/Jakarta');
$cfg=dirname(__DIR__,2).'/bsd-nota-config.php';
$msg='';$done=false;$nama='';
function connect(string $n,string $u,string $p): PDO {
  return new PDO('mysql:host=127.0.0.1;dbname='.$n.';charset=utf8mb4',$u,$p,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
}
$have=is_file($cfg);
if($have){
  require $cfg;
  try{$pdo=connect(DB_NAME,DB_USER,DB_PASS);
    $t=(int)$pdo->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='users'")->fetchColumn();
    if($t&&(int)$pdo->query("SELECT COUNT(*) FROM users")->fetchColumn()>0){http_response_code(403);exit('<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:30px">Setup sudah selesai. Hapus file setup.php dari hosting.</body>');}
  }catch(Throwable $e){$msg='Konfigurasi lama tidak bisa terhubung ke database. Isi ulang di bawah.';$have=false;}
}
if($_SERVER['REQUEST_METHOD']==='POST'){
  $dn=trim($_POST['dbname']??'');$du=trim($_POST['dbuser']??'');$dp=(string)($_POST['dbpass']??'');
  $nama=trim($_POST['nama']??'');$pin=$_POST['pin']??'';$pin2=$_POST['pin2']??'';
  if(!$have&&($dn===''||$du===''||$dp==='')) $msg='Data database wajib diisi.';
  elseif($nama===''||mb_strlen($nama)>60) $msg='Nama admin wajib diisi.';
  elseif(!preg_match('/^\d{6}$/',$pin)) $msg='PIN harus 6 angka.';
  elseif($pin!==$pin2) $msg='Konfirmasi PIN tidak sama.';
  else{
    try{
      if(!$have){ $pdo=connect($dn,$du,$dp);
        $php="<?php\ndefine('DB_HOST','127.0.0.1');\ndefine('DB_NAME',".var_export($dn,true).");\ndefine('DB_USER',".var_export($du,true).");\ndefine('DB_PASS',".var_export($dp,true).");\ndefine('BASE_PATH','');\ndefine('SESSION_DAYS',60);\n";
        if(file_put_contents($cfg,$php)===false) throw new RuntimeException('Tidak bisa menulis file konfigurasi di '.dirname($cfg));
        @chmod($cfg,0600);
      }
      foreach(array_filter(array_map('trim',explode(';',file_get_contents(__DIR__.'/inc/schema.sql')))) as $q) $pdo->exec($q);
      $pdo->prepare("INSERT INTO users(nama,pin_hash,role) VALUES(?,?, 'admin')")->execute([$nama,password_hash($pin,PASSWORD_DEFAULT)]);
      $done=true;
    }catch(Throwable $e){ $msg='Gagal: '.$e->getMessage(); }
  }
}
?><!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Setup</title>
<style>body{font-family:system-ui,sans-serif;background:#f6f7f4;margin:0;padding:24px}.c{max-width:440px;margin:30px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px}input{width:100%;padding:10px;margin:6px 0 14px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;box-sizing:border-box}button{background:#4a2c12;color:#fff;border:0;padding:11px 18px;border-radius:8px;font:inherit;cursor:pointer}.e{color:#b42318}h3{margin:6px 0}</style></head><body><div class="c">
<img src="logo.jpg" style="height:60px"><h2>Setup Sistem Nota</h2>
<?php if($done): ?><p>✓ Selesai. Admin <b><?=htmlspecialchars($nama)?></b> sudah dibuat.</p><p>Hapus file <code>setup.php</code>, lalu buka <a href="panel-bsd/">halaman petugas</a>.</p>
<?php else: if($msg):?><p class="e"><?=htmlspecialchars($msg)?></p><?php endif;?>
<form method="post" autocomplete="off">
<?php if(!$have): ?><h3>Database</h3><label>Nama database</label><input name="dbname" value="u282736333_nota"><label>User database</label><input name="dbuser" value="u282736333_nota"><label>Sandi database</label><input name="dbpass" type="password"><?php endif;?>
<h3>Akun admin</h3><label>Nama admin</label><input name="nama" required maxlength="60"><label>PIN (6 angka)</label><input name="pin" type="password" inputmode="numeric" maxlength="6" required><label>Ulangi PIN</label><input name="pin2" type="password" inputmode="numeric" maxlength="6" required><button>Selesaikan setup</button></form><?php endif;?>
</div></body></html>
