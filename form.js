const GROUPS={'Hitungan':['pcs','unit','set','pasang','buah','lembar','batang','biji'],'Kemasan':['sak','dus','box','kaleng','botol','pack','bungkus','roll','ikat','karung'],'Ukuran':['kg','ton','gram','liter','meter','m²','m³'],'Lain-lain':['truk','rit','lot']};
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const num=v=>{const n=parseFloat(v);return isFinite(n)?n:0};
function satOpts(){let h='';for(const g in GROUPS)h+=`<optgroup label="${g}">`+GROUPS[g].map(s=>`<option${s==='pcs'?' selected':''}>${s}</option>`).join('')+'</optgroup>';return h+'<option value="__other">Lainnya…</option>'}
function addRow(){$('#rows').insertAdjacentHTML('beforeend',`<div class="irow"><input class="in-nama" maxlength="200" placeholder="Nama barang, mis. Semen 50 kg"><input class="in-qty" type="number" min="0" step="any" inputmode="decimal" placeholder="Jumlah"><div class="satwrap"><select class="in-sat">${satOpts()}</select><input class="in-sat-other" maxlength="20" placeholder="Ketik satuan" hidden></div><input class="in-ket" maxlength="200" placeholder="Keterangan (opsional)"><button type="button" class="x" data-rm title="Hapus baris">×</button></div>`)}
$('#add-row').onclick=addRow;
$('#rows').addEventListener('click',e=>{const b=e.target.closest('[data-rm]');if(!b)return;if($$('#rows .irow').length>1)b.closest('.irow').remove();else $$('input',b.closest('.irow')).forEach(i=>i.value='')});
$('#rows').addEventListener('change',e=>{if(!e.target.classList.contains('in-sat'))return;const o=$('.in-sat-other',e.target.closest('.satwrap'));o.hidden=e.target.value!=='__other';if(!o.hidden)o.focus()});
function reset(){['f-nama','f-kontak','f-email','f-alamat'].forEach(i=>$('#'+i).value='');$('#rows').innerHTML='';addRow();$('#form-err').textContent=''}
$('#submit-order').onclick=async()=>{
  const err=m=>{$('#form-err').textContent=m};
  const nama=$('#f-nama').value.trim(),kontak=$('#f-kontak').value.trim(),email=$('#f-email').value.trim(),alamat=$('#f-alamat').value.trim();
  if(!nama)return err('Nama wajib diisi.');if(!kontak)return err('No. HP / WhatsApp wajib diisi.');
  if(email&&!/^\S+@\S+\.\S+$/.test(email))return err('Format email belum benar.');if(!alamat)return err('Alamat wajib diisi.');
  const items=[];
  for(const r of $$('#rows .irow')){
    const n=$('.in-nama',r).value.trim(),q=num($('.in-qty',r).value),ket=$('.in-ket',r).value.trim();let s=$('.in-sat',r).value;if(s==='__other')s=$('.in-sat-other',r).value.trim();
    if(!n&&!q&&!ket)continue;if(!n)return err('Ada baris barang tanpa nama.');if(q<=0)return err(`Jumlah untuk "${n}" harus lebih dari 0.`);if(!s)return err(`Satuan untuk "${n}" belum diisi.`);
    items.push({nama:n,qty:q,satuan:s,ket});
  }
  if(!items.length)return err('Isi minimal satu barang.');
  err('');const btn=$('#submit-order');btn.disabled=true;
  try{
    const r=await fetch('api/order.php',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'bsd'},body:JSON.stringify({nama,kontak,email,alamat,items,website:$('#f-website').value})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)err(j.error||'Gagal mengirim pesanan. Coba lagi.');
    else{$('#done-no').textContent=j.no_order;$('#form-wrap').hidden=true;$('#done-wrap').hidden=false}
  }catch(e){err('Tidak bisa terhubung. Periksa internet Anda lalu coba lagi.')}
  btn.disabled=false;
};
$('#new-order').onclick=()=>{reset();$('#done-wrap').hidden=true;$('#form-wrap').hidden=false};
reset();
