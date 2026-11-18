
const COMPANY={nama:'CV BUANA SASTRA DAHANA',
  alamat:'Kp. Cikadu RT 019 RW 006, Kec. Sukatani, Kab. Purwakarta',
  telp:'0812-1429-6499',
  npwp:'1000 0000 1076 7902',
  bayar:['Pembayaran ditransfer ke rekening Bank Mandiri','No. Rekening: 1730022198254','a.n. CV BUANA SASTRA DAHANA']
};
const GROUPS={'Hitungan':['pcs','unit','set','pasang','buah','lembar','batang','biji'],'Kemasan':['sak','dus','box','kaleng','botol','pack','bungkus','roll','ikat','karung'],'Ukuran':['kg','ton','gram','liter','meter','m²','m³'],'Lain-lain':['truk','rit','lot']};
const ALL_SAT=Object.values(GROUPS).flat();
const STATUS=['Masuk','Nota terbit','Surat jalan terbit','Selesai','Batal'];
const BAYAR=['Belum bayar','DP','Lunas'];
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp=n=>'Rp '+Math.round(n||0).toLocaleString('id-ID');
const fmtDate=t=>new Date(t).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'});
const fmtDT=t=>new Date(t).toLocaleString('id-ID',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
const clone=o=>JSON.parse(JSON.stringify(o));
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0};
const badgeCls=s=>'b-'+s.split(' ')[0];
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),3000)}
function satOpts(sel){let h='';for(const g in GROUPS)h+=`<optgroup label="${g}">`+GROUPS[g].map(s=>`<option${s===sel?' selected':''}>${esc(s)}</option>`).join('')+'</optgroup>';if(sel&&!ALL_SAT.includes(sel))h+=`<optgroup label="Lainnya"><option selected>${esc(sel)}</option></optgroup>`;return h}

async function api(action,{q='',body=null}={}){
  const opt={credentials:'same-origin',headers:{'X-Requested-With':'bsd'}};
  if(body!==null){opt.method='POST';opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body)}
  const r=await fetch('../api/panel.php?action='+action+q,opt);
  const j=await r.json().catch(()=>({error:'Respon server tidak valid'}));
  if(r.status===401&&action!=='login'&&action!=='me'){showLogin();throw new Error('Sesi berakhir, masuk lagi.')}
  if(!r.ok)throw new Error(j.error||'Terjadi kesalahan');
  return j;
}

/* ===== state ===== */
let user=null,orders=[],sel=null,draft=null,dirty=false,filter='Semua',armCancel=false,tab='order',pollT=null;
const subtotal=o=>o.items.reduce((s,i)=>s+num(i.qty)*num(i.harga),0);
const grand=o=>subtotal(o)-num(o.diskon)+num(o.ongkir);

/* ===== login ===== */
function showLogin(){
  clearInterval(pollT);user=null;$('#app').hidden=true;$('#app-head').style.display='none';$('#login').hidden=false;$('#l-pin').value='';
}
$('#l-go').onclick=doLogin;$('#l-pin').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin()});
async function doLogin(){
  $('#l-err').textContent='';
  try{await api('login',{body:{nama:$('#l-nama').value.trim(),pin:$('#l-pin').value}});await boot()}
  catch(e){$('#l-err').textContent=e.message}
}
$('#logout').onclick=async()=>{try{await api('logout',{body:{}})}catch(e){}showLogin()};
async function boot(){
  const j=await api('me');
  if(!j.user){showLogin();return}
  user=j.user;$('#login').hidden=true;$('#app').hidden=false;$('#app-head').style.display='flex';
  $('#who').textContent=user.nama+(user.role==='admin'?' (admin)':'');
  $('#tab-user').hidden=user.role!=='admin';
  await loadOrders();setTab('order');
  clearInterval(pollT);pollT=setInterval(()=>{if(!document.hidden&&!dirty&&tab==='order')loadOrders()},30000);
}

/* ===== tab ===== */
function setTab(t){
  tab=t;['order','rekap','user'].forEach(x=>{$('#v-'+x).hidden=x!==t;$('#tab-'+x).classList.toggle('on',x===t)});
  if(t==='rekap')loadRekap();if(t==='user')loadUsers();
}
['order','rekap','user'].forEach(t=>$('#tab-'+t).onclick=()=>setTab(t));

/* ===== daftar order ===== */
async function loadOrders(){
  try{const j=await api('orders');orders=j.orders;renderList();
    if(sel&&!dirty){const o=orders.find(x=>x.id===sel);if(o&&draft&&o.updatedAt!==draft.updatedAt){await openOrder(sel,true)}}}
  catch(e){if(user)toast(e.message)}
}
function renderList(){
  const n=orders.filter(o=>o.status==='Masuk').length;$('#cnt-new').textContent=n?`(${n})`:'';
  $('#chips').innerHTML=['Semua',...STATUS].map(s=>{const c=s==='Semua'?orders.length:orders.filter(o=>o.status===s).length;return `<button class="chip${filter===s?' on':''}" data-f="${s}">${s} ${c}</button>`}).join('');
  const list=orders.filter(o=>filter==='Semua'||o.status===filter);
  $('#olist').innerHTML=list.length?list.map(o=>`<div class="oitem${o.id===sel?' on':''}" data-id="${o.id}"><b>${esc(o.pemesan.nama)}</b><span>${esc(o.noOrder)} · ${fmtDate(o.createdAt)} · ${o.jmlItem} barang${o.noNota?' · '+rp(o.total):''}</span><br><span class="badge ${badgeCls(o.status)}">${o.status}</span>${o.noNota&&o.status!=='Batal'?` <span class="badge">${o.bayar}</span>`:''}</div>`).join(''):'<div class="empty">Belum ada order.</div>';
}
$('#chips').addEventListener('click',e=>{const b=e.target.closest('[data-f]');if(!b)return;filter=b.dataset.f;renderList()});
$('#olist').addEventListener('click',async e=>{const it=e.target.closest('[data-id]');if(!it)return;
  if(dirty&&sel!==+it.dataset.id&&!confirmLeave())return;
  await openOrder(+it.dataset.id);$('#detail').scrollIntoView({behavior:'smooth',block:'start'})});
let leaveArmed=false;function confirmLeave(){if(leaveArmed){leaveArmed=false;return true}leaveArmed=true;toast('Ada perubahan belum disimpan. Klik order lagi untuk membuangnya.');setTimeout(()=>leaveArmed=false,4000);return false}
async function openOrder(id,silent){
  try{const j=await api('order',{q:'&id='+id});sel=id;draft=j.order;dirty=false;armCancel=false;renderList();renderDetail()}
  catch(e){if(!silent)toast(e.message)}
}

/* ===== detail ===== */
function renderDetail(){
  const el=$('#detail');
  if(!draft){el.innerHTML='<div class="empty">Pilih order di sebelah kiri untuk diproses.</div>';return}
  const o=draft,p=o.pemesan,edit=o.status==='Masuk',closed=o.status==='Batal';
  let h=`<h2>${esc(o.noOrder)} <span class="badge ${badgeCls(o.status)}">${o.status}</span></h2>
  <div class="grid2" style="font-size:14px"><div><b>${esc(p.nama)}</b><br>${esc(p.alamat)}</div><div>HP/WA: ${esc(p.kontak)}<br>${p.email?'Email: '+esc(p.email)+'<br>':''}Dipesan: ${fmtDate(o.createdAt)}</div></div>`;
  h+=`<details><summary>Lihat pesanan asli dari pemesan</summary><ul style="margin:6px 0;padding-left:20px;font-size:14px">${o.itemsAsli.map(i=>`<li>${esc(i.nama)} — ${i.qty} ${esc(i.satuan)}${i.ket?' ('+esc(i.ket)+')':''}</li>`).join('')}</ul></details>`;
  h+=`<h3>Rincian nota</h3><div class="tablewrap"><table class="items"><thead><tr><th>#</th><th style="width:34%">Nama barang</th><th style="width:11%">Jumlah</th><th style="width:14%">Satuan</th><th class="r" style="width:17%">Harga satuan</th><th class="r" style="width:17%">Subtotal</th><th></th></tr></thead><tbody>`;
  o.items.forEach((i,k)=>{
    if(edit)h+=`<tr data-i="${k}"><td>${k+1}</td><td><input data-f="nama" maxlength="200" value="${esc(i.nama)}"></td><td><input data-f="qty" type="number" step="any" min="0" value="${i.qty}"></td><td><select data-f="satuan">${satOpts(i.satuan)}</select></td><td><input data-f="harga" type="number" step="any" min="0" inputmode="numeric" value="${i.harga||''}" placeholder="0" style="text-align:right"></td><td class="r sub">${rp(num(i.qty)*num(i.harga))}</td><td><button class="x" data-act="del-row" data-i="${k}" style="height:34px">×</button></td></tr>`;
    else h+=`<tr><td>${k+1}</td><td>${esc(i.nama)}${i.ket?'<br><span class="note">'+esc(i.ket)+'</span>':''}</td><td>${i.qty}</td><td>${esc(i.satuan)}</td><td class="r">${rp(i.harga)}</td><td class="r">${rp(num(i.qty)*num(i.harga))}</td><td></td></tr>`;
  });
  h+='</tbody></table></div>';
  if(edit)h+='<button class="btn ghost sm" data-act="add-row" style="margin-top:8px">+ Tambah baris</button>';
  h+=`<div class="tot"><div><span>Subtotal</span><span id="t-sub">${rp(subtotal(o))}</span></div>
  <div><span>Diskon</span>${edit?`<input data-f="diskon" type="number" min="0" inputmode="numeric" value="${o.diskon||''}" placeholder="0" style="width:150px;text-align:right">`:`<span>- ${rp(o.diskon)}</span>`}</div>
  <div><span>Ongkos kirim</span>${edit?`<input data-f="ongkir" type="number" min="0" inputmode="numeric" value="${o.ongkir||''}" placeholder="0" style="width:150px;text-align:right">`:`<span>${rp(o.ongkir)}</span>`}</div>
  <div class="gt"><span>TOTAL</span><span id="t-total">${rp(grand(o))}</span></div></div>`;
  if(o.noNota)h+=`<p class="note">No. Nota: <b>${esc(o.noNota)}</b> · ${fmtDate(o.tglNota)}</p>`;
  if(o.noNota&&!closed)h+=`<div class="grid2" style="margin-top:10px"><div><label>Status pembayaran</label><select data-f="bayar">${BAYAR.map(b=>`<option${b===o.bayar?' selected':''}>${b}</option>`).join('')}</select></div></div>`;
  h+='<div class="actions">';
  if(edit)h+='<button class="btn ghost" data-act="save">Simpan draft</button><button class="btn" data-act="issue-nota">Terbitkan Nota</button>';
  if(o.noNota)h+='<button class="btn ghost" data-act="pdf-nota">⬇ Unduh Nota (PDF)</button>';
  h+='</div>';
  if(['Nota terbit','Surat jalan terbit','Selesai'].includes(o.status)){
    h+='<h3>Surat jalan</h3>';
    if(o.noSJ)h+=`<p style="margin:0 0 8px">No. SJ: <b>${esc(o.noSJ)}</b> · Driver: <b>${esc(o.driver)}</b> · Plat: <b>${esc(o.plat)}</b></p><div class="actions" style="margin-top:0"><button class="btn ghost" data-act="pdf-sj">⬇ Unduh Surat Jalan (PDF)</button></div>`;
    else if(o.status==='Nota terbit')h+=`<div class="grid2"><div><label>Nama driver</label><input id="drv" maxlength="80"></div><div><label>No. plat kendaraan</label><input id="plat" maxlength="20" placeholder="mis. KT 1234 AB" style="text-transform:uppercase"></div></div><div class="actions"><button class="btn" data-act="issue-sj">Terbitkan Surat Jalan</button></div>`;
    else h+='<p class="note">Order selesai tanpa surat jalan.</p>';
  }
  if(!closed&&o.status!=='Selesai'){
    h+='<div class="actions" style="border-top:1px solid var(--line);padding-top:14px">';
    if(o.noNota)h+='<button class="btn ghost" data-act="finish">Tandai selesai</button>';
    if(o.status==='Masuk'||user.role==='admin')h+=`<button class="btn warn${armCancel?' armed':''}" data-act="cancel">${armCancel?'Klik lagi untuk membatalkan order':'Batalkan order'}</button>`;
    h+='</div>';
  }
  if(o.log&&o.log.length)h+=`<details><summary>Riwayat aktivitas</summary><ul style="margin:6px 0;padding-left:20px;font-size:13px;color:#475569">${o.log.map(l=>`<li>${fmtDT(l.at)} · ${esc(l.aksi)}${l.detail?' ('+esc(l.detail)+')':''}${l.oleh?' · '+esc(l.oleh):''}</li>`).join('')}</ul></details>`;
  el.innerHTML=h;
}
function updateTotals(){
  $$('#detail tr[data-i]').forEach(tr=>{const i=draft.items[+tr.dataset.i];$('.sub',tr).textContent=rp(num(i.qty)*num(i.harga))});
  $('#t-sub').textContent=rp(subtotal(draft));$('#t-total').textContent=rp(grand(draft));
}
async function onField(e){
  const t=e.target,f=t.dataset&&t.dataset.f;if(!f||!draft)return;const tr=t.closest('tr[data-i]');
  if(tr){const i=draft.items[+tr.dataset.i];i[f]=['qty','harga'].includes(f)?num(t.value):t.value;dirty=true;updateTotals()}
  else if(['diskon','ongkir'].includes(f)){draft[f]=num(t.value);dirty=true;updateTotals()}
  else if(f==='bayar'&&e.type==='change')await run('set_bayar',{id:draft.id,bayar:t.value},'Status pembayaran disimpan');
}
$('#detail').addEventListener('input',onField);$('#detail').addEventListener('change',onField);

async function run(action,body,msg){
  try{const j=await api(action,{body});draft=j.order;dirty=false;armCancel=false;await loadOrders();sel=draft.id;renderList();renderDetail();if(msg)toast(msg);return true}
  catch(e){toast(e.message);return false}
}
const pl=o=>({id:o.id,items:o.items,diskon:o.diskon,ongkir:o.ongkir});
const safe=s=>String(s).replace(/[^\w\-]+/g,'_').slice(0,30);
$('#detail').addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b||!draft)return;const a=b.dataset.act,o=draft;
  if(a!=='cancel'&&armCancel)armCancel=false;
  if(a==='add-row'){o.items.push({nama:'',qty:1,satuan:'pcs',ket:'',harga:0});dirty=true;renderDetail()}
  else if(a==='del-row'){o.items.splice(+b.dataset.i,1);dirty=true;renderDetail()}
  else if(a==='save')await run('save_draft',pl(o),'Draft tersimpan');
  else if(a==='issue-nota'){b.disabled=true;await run('issue_nota',pl(o),'Nota terbit');b.disabled=false}
  else if(a==='pdf-nota')makeNota(o).save('Nota_'+o.noNota.replace(/\//g,'-')+'_'+safe(o.pemesan.nama)+'.pdf');
  else if(a==='issue-sj'){b.disabled=true;await run('issue_sj',{id:o.id,driver:$('#drv').value,plat:$('#plat').value},'Surat jalan terbit');b.disabled=false}
  else if(a==='pdf-sj')makeSJ(o).save('SuratJalan_'+o.noSJ.replace(/\//g,'-')+'_'+safe(o.pemesan.nama)+'.pdf');
  else if(a==='finish')await run('finish',{id:o.id},'Order selesai');
  else if(a==='cancel'){if(!armCancel){armCancel=true;renderDetail();return}await run('cancel',{id:o.id},'Order dibatalkan')}
});

/* ===== rekap ===== */
$('#bulan').value=new Date().toISOString().slice(0,7);
const rekapQ=()=>'&bulan='+($('#periode').value==='semua'?'semua':$('#bulan').value)+'&q='+encodeURIComponent($('#cari').value.trim());
let cariT=null;
$('#bulan').addEventListener('change',loadRekap);
$('#periode').addEventListener('change',()=>{$('#bulan').style.display=$('#periode').value==='semua'?'none':'';loadRekap()});
$('#cari').addEventListener('input',()=>{clearTimeout(cariT);cariT=setTimeout(loadRekap,350)});
$('#reset').onclick=()=>{$('#cari').value='';loadRekap()};
$('#csv').onclick=()=>{location.href='../api/panel.php?action=export_csv'+rekapQ()};
$('#rekap').addEventListener('click',e=>{const b=e.target.closest('[data-pel]');if(!b)return;$('#cari').value=b.dataset.pel;loadRekap()});
async function loadRekap(){
  try{
    const j=await api('rekap',{q:rekapQ()});
    const st=j.orderPerStatus,cari=$('#cari').value.trim();
    $('#rekap-ket').textContent=(j.bulan==='semua'?'Semua waktu':'Bulan '+j.bulan)+' · '+(cari?'pelanggan: "'+cari+'"':'semua pelanggan');
    const pelTbl=cari?'':`<h3>Per pelanggan</h3><div class="tablewrap"><table class="plain"><thead><tr><th>Pelanggan</th><th class="r">Jumlah nota</th><th class="r">Total</th><th class="r">Belum lunas</th></tr></thead><tbody>${j.perPelanggan.length?j.perPelanggan.map(p=>`<tr><td><a href="#" data-pel="${esc(p.nama)}" onclick="return false" style="color:var(--acc);font-weight:600">${esc(p.nama)}</a></td><td class="r">${p.nota}</td><td class="r">${rp(p.total)}</td><td class="r">${rp(p.belumBayar)}</td></tr>`).join(''):'<tr><td colspan="4" class="note">Belum ada nota.</td></tr>'}</tbody></table></div><p class="note">Klik nama pelanggan untuk melihat rekapnya saja.</p>`;
    $('#rekap').innerHTML=`<div class="stat"><div><b>${rp(j.omzet)}</b><span>Total nota (tidak termasuk batal)</span></div><div><b>${rp(j.lunas)}</b><span>Lunas</span></div><div><b>${rp(j.dp)}</b><span>DP / sebagian</span></div><div><b>${rp(j.belumBayar)}</b><span>Belum bayar (piutang)</span></div><div><b>${j.nota.length}</b><span>Nota terbit (${j.batal} batal)</span></div><div><b>${Object.values(st).reduce((a,b)=>a+(+b),0)}</b><span>Order masuk</span></div></div>
    ${pelTbl}
    <h3>Daftar nota</h3><div class="tablewrap"><table class="plain"><thead><tr><th>No. Nota</th><th>Tanggal</th><th>Pelanggan</th><th>Pembayaran</th><th>Status</th><th class="r">Total</th></tr></thead><tbody>${j.nota.length?j.nota.map(n=>`<tr><td>${esc(n.noNota)}</td><td>${fmtDate(n.tgl)}</td><td>${esc(n.nama)}</td><td>${n.bayar}</td><td>${n.status}</td><td class="r">${rp(n.total)}</td></tr>`).join(''):'<tr><td colspan="6" class="note">Belum ada nota.</td></tr>'}</tbody></table></div>
    <h3>Barang terlaris (berdasarkan nilai)</h3><div class="tablewrap"><table class="plain"><thead><tr><th>Barang</th><th class="r">Jumlah</th><th class="r">Nilai</th></tr></thead><tbody>${j.topBarang.length?j.topBarang.map(t=>`<tr><td>${esc(t.nama)}</td><td class="r">${(+t.qty).toLocaleString('id-ID')} ${esc(t.satuan)}</td><td class="r">${rp(+t.nilai)}</td></tr>`).join(''):'<tr><td colspan="3" class="note">Belum ada data.</td></tr>'}</tbody></table></div>`;
  }catch(e){toast(e.message)}
}

/* ===== pengguna ===== */
async function loadUsers(){
  try{
    const j=await api('users');
    $('#ulist').innerHTML=`<table class="plain"><thead><tr><th>Nama</th><th>Peran</th><th>Status</th><th></th></tr></thead><tbody>${j.users.map(u=>`<tr data-u="${u.id}"><td>${esc(u.nama)}</td><td>${u.role}</td><td>${+u.aktif?'Aktif':'Nonaktif'}</td><td class="r"><button class="btn ghost sm" data-ua="pin">Ganti PIN</button> ${+u.id===user.id?'':`<button class="btn ghost sm" data-ua="toggle" data-aktif="${+u.aktif?0:1}">${+u.aktif?'Nonaktifkan':'Aktifkan'}</button>`}</td></tr>`).join('')}</tbody></table>`;
  }catch(e){toast(e.message)}
}
$('#ulist').addEventListener('click',async e=>{
  const b=e.target.closest('[data-ua]');if(!b)return;const id=+b.closest('tr').dataset.u;
  try{
    if(b.dataset.ua==='pin'){const pin=prompt('PIN baru (6 angka):');if(pin===null)return;await api('user_update',{body:{id,pin}});toast('PIN diganti. Perangkat lama otomatis keluar.')}
    else{await api('user_update',{body:{id,aktif:b.dataset.aktif==='1'}});toast('Tersimpan')}
    loadUsers();
  }catch(e){toast(e.message)}
});
$('#u-add').onclick=async()=>{
  try{await api('user_add',{body:{nama:$('#u-nama').value,pin:$('#u-pin').value,role:$('#u-role').value}});$('#u-nama').value='';$('#u-pin').value='';toast('Pengguna ditambahkan');loadUsers()}
  catch(e){toast(e.message)}
};
$('#my-pin').onclick=async()=>{
  const lama=prompt('PIN lama:');if(lama===null)return;const baru=prompt('PIN baru (6 angka):');if(baru===null)return;
  try{await api('ganti_pin',{body:{lama,baru}});toast('PIN Anda diganti')}catch(e){toast(e.message)}
};

/* ===== PDF ===== */
function terbilang(n){
  n=Math.floor(Math.abs(n));
  const s=['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan','sepuluh','sebelas'];
  if(n===0)return 'nol';
  const t=n=>{
    if(n<12)return s[n];
    if(n<20)return s[n-10]+' belas';
    if(n<100)return s[Math.floor(n/10)]+' puluh'+(n%10?' '+s[n%10]:'');
    if(n<200)return 'seratus'+(n%100?' '+t(n%100):'');
    if(n<1000)return s[Math.floor(n/100)]+' ratus'+(n%100?' '+t(n%100):'');
    if(n<2000)return 'seribu'+(n%1000?' '+t(n%1000):'');
    if(n<1e6)return t(Math.floor(n/1e3))+' ribu'+(n%1e3?' '+t(n%1e3):'');
    if(n<1e9)return t(Math.floor(n/1e6))+' juta'+(n%1e6?' '+t(n%1e6):'');
    if(n<1e12)return t(Math.floor(n/1e9))+' miliar'+(n%1e9?' '+t(n%1e9):'');
    return t(Math.floor(n/1e12))+' triliun'+(n%1e12?' '+t(n%1e12):'');
  };
  return t(n);
}
function pdfHead(doc,title){
  const lh=22,lw=lh*LOGO_RATIO;
  try{doc.addImage(LOGO,'JPEG',14,10,lw,lh)}catch(e){}
  const tx=14+lw+5;
  doc.setFont('helvetica','bold');doc.setFontSize(15);doc.text(COMPANY.nama,tx,19);
  doc.setFont('helvetica','normal');doc.setFontSize(9);let y=24;
  if(COMPANY.alamat){const al=doc.splitTextToSize(COMPANY.alamat,196-tx);doc.text(al,tx,y);y+=al.length*4.5}
  const kon=[COMPANY.telp?'Telp: '+COMPANY.telp:'',COMPANY.npwp?'NPWP: '+COMPANY.npwp:''].filter(Boolean).join('   |   ');
  if(kon){doc.text(kon,tx,y);y+=4.5}
  y=Math.max(y,34);
  doc.setLineWidth(.6);doc.setDrawColor(74,44,18);doc.line(14,y,196,y);
  doc.setFont('helvetica','bold');doc.setFontSize(13);doc.setTextColor(31,42,55);doc.text(title,105,y+8,{align:'center'});
  return y+15;
}
function infoBlock(doc,y,leftTitle,o,rows){
  doc.setFontSize(9.5);doc.setFont('helvetica','bold');doc.text(leftTitle,14,y);
  doc.setFont('helvetica','normal');
  const p=o.pemesan;let ly=y+5;
  doc.setFont('helvetica','bold');doc.text(p.nama,14,ly);doc.setFont('helvetica','normal');ly+=5;
  const al=doc.splitTextToSize(p.alamat,95);doc.text(al,14,ly);ly+=al.length*4.5;
  doc.text('HP/WA: '+p.kontak,14,ly);ly+=4.5;
  let ry=y;rows.forEach(([k,v])=>{doc.text(k,128,ry);doc.text(': '+v,152,ry,{maxWidth:44});ry+=5});
  return Math.max(ly,ry)+3;
}
function signatures(doc,y,labels){
  if(y>255){doc.addPage();y=20}
  const w=182/labels.length;
  labels.forEach((l,i)=>{const cx=14+w*i+w/2;doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.text(l,cx,y,{align:'center'});doc.line(cx-w/2+8,y+22,cx+w/2-8,y+22)});
}
function watermark(doc){
  const t='CV BSD ORDER';
  for(let i=1;i<=doc.getNumberOfPages();i++){
    doc.setPage(i);
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({opacity:0.09}));
    doc.setFont('helvetica','bold');doc.setFontSize(58);doc.setTextColor(74,44,18);
    const w=doc.getTextWidth(t),k=Math.SQRT1_2;
    doc.text(t,105-(w/2)*k,148.5+(w/2)*k,{angle:45});
    doc.restoreGraphicsState();
  }
}
function makeNota(o){
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
  let y=pdfHead(doc,'NOTA PENJUALAN');
  y=infoBlock(doc,y,'Kepada Yth.',o,[['No. Nota',o.noNota],['Tanggal',fmtDate(o.tglNota)],['No. Order',o.noOrder],['Pembayaran',o.bayar]]);
  doc.autoTable({startY:y,theme:'grid',head:[['No','Nama Barang','Jumlah','Satuan','Harga Satuan','Jumlah (Rp)']],
    body:o.items.map((i,k)=>[k+1,i.nama+(i.ket?'\n'+i.ket:''),i.qty,i.satuan,rp(i.harga),rp(num(i.qty)*num(i.harga))]),
    styles:{fontSize:9,cellPadding:2,textColor:[31,42,55]},headStyles:{fillColor:[74,44,18],textColor:[255,255,255],halign:'center',fontStyle:'bold'},
    columnStyles:{0:{cellWidth:10,halign:'center'},2:{cellWidth:18,halign:'right'},3:{cellWidth:20},4:{cellWidth:30,halign:'right'},5:{cellWidth:32,halign:'right'}},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+6;if(y>235){doc.addPage();y=20}
  const line=(k,v,bold)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(bold?11:9.5);doc.text(k,140,y);doc.text(v,196,y,{align:'right'});y+=bold?7:5.5};
  line('Subtotal',rp(subtotal(o)));
  if(num(o.diskon))line('Diskon','- '+rp(o.diskon));
  if(num(o.ongkir))line('Ongkos kirim',rp(o.ongkir));
  doc.line(140,y-3.5,196,y-3.5);line('TOTAL',rp(grand(o)),true);
  doc.setFont('helvetica','italic');doc.setFontSize(9);
  const tb='Terbilang: '+terbilang(grand(o)).replace(/^./,c=>c.toUpperCase())+' rupiah';
  const tl=doc.splitTextToSize(tb,120);doc.text(tl,14,y-12);
  let ey=y-12+tl.length*4.5+4;
  if(COMPANY.bayar.length){
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('Panduan Pembayaran',14,ey);ey+=4.5;
    doc.setFont('helvetica','normal');
    COMPANY.bayar.forEach(b=>{const l=doc.splitTextToSize(b,120);doc.text(l,14,ey);ey+=l.length*4.2});
  }
  signatures(doc,Math.max(y+6,ey+10),['Penerima','Hormat kami']);
  watermark(doc);
  return doc;
}
function makeSJ(o){
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a4'});
  let y=pdfHead(doc,'SURAT JALAN');
  y=infoBlock(doc,y,'Dikirim kepada',o,[['No. SJ',o.noSJ],['Tanggal',fmtDate(o.tglSJ)],['Ref. Nota',o.noNota],['Driver',o.driver],['No. Plat',o.plat]]);
  doc.autoTable({startY:y,theme:'grid',head:[['No','Nama Barang','Jumlah','Satuan','Keterangan']],
    body:o.items.map((i,k)=>[k+1,i.nama,i.qty,i.satuan,i.ket||'']),
    styles:{fontSize:9.5,cellPadding:2.4,textColor:[31,42,55]},headStyles:{fillColor:[74,44,18],textColor:[255,255,255],halign:'center',fontStyle:'bold'},
    columnStyles:{0:{cellWidth:10,halign:'center'},2:{cellWidth:22,halign:'right'},3:{cellWidth:24},4:{cellWidth:50}},margin:{left:14,right:14}});
  y=doc.lastAutoTable.finalY+6;
  doc.setFont('helvetica','italic');doc.setFontSize(9);
  doc.text('Barang telah diterima dalam keadaan baik dan jumlah sesuai.',14,y);
  signatures(doc,y+10,['Penerima','Driver','Pengirim']);
  watermark(doc);
  return doc;
}

function savePdfUnused(){}
boot().catch(()=>showLogin());
