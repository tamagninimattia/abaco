import { supabase } from './supabaseClient.js';

const fmt = (n) => new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

const SOTTOTIPI = {
  attivo: [
    ['conto_corrente', 'Conto corrente'],
    ['cassa_contanti', 'Cassa contanti'],
    ['cassa_dedicata', 'Cassa dedicata'],
    ['dossier_titoli', 'Dossier titoli'],
    ['credito', 'Credito'],
  ],
  passivo: [
    ['carta_credito', 'Carta di credito'],
    ['debito_vario', 'Debito vario'],
  ],
};

let fondiCache = [];
let vociCache = [];

// ---------------- Navigazione ----------------
document.querySelectorAll('.nav button').forEach((btn) => {
  btn.addEventListener('click', () => mostraVista(btn.dataset.vista));
});

function mostraVista(nome) {
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.vista === nome));
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('active', v.id === `vista-${nome}`));
  if (nome === 'movimenti') popolaSelectFondoMovimenti();
  if (nome === 'budget') caricaVociBudget();
}

// ---------------- Fondi ----------------
async function caricaFondi() {
  const { data, error } = await supabase.from('v_saldo_fondi').select('*').order('nome');
  if (error) { console.error(error); return; }
  fondiCache = data;
  renderTabellaFondi(data);
  popolaSelectFondi();
}

function renderTabellaFondi(fondi) {
  const tbody = document.querySelector('#tabella-fondi tbody');
  tbody.innerHTML = '';
  if (!fondi.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="vuoto">Nessun fondo censito. Aggiungine uno qui sotto.</td></tr>`;
    return;
  }
  for (const f of fondi) {
    const tr = document.createElement('tr');
    const scarto = f.saldo_reale != null ? f.saldo_reale - f.saldo_confermato : null;
    tr.innerHTML = `
      <td>${f.nome}</td>
      <td><span class="badge ${f.tipo}">${f.tipo}</span></td>
      <td class="numero importo ${f.saldo_confermato >= 0 ? 'positivo' : 'negativo'}">${fmt(f.saldo_confermato)}</td>
      <td class="numero">${f.saldo_con_provvisori !== f.saldo_confermato ? fmt(f.saldo_con_provvisori) : '—'}</td>
      <td class="numero">
        <input type="number" step="0.01" value="${f.saldo_reale ?? ''}" data-fondo="${f.fondo_id}" class="input-saldo-reale" style="width:100px; text-align:right;">
      </td>
      <td class="numero ${scarto ? 'importo ' + (scarto >= 0 ? 'positivo' : 'negativo') : ''}">${scarto != null ? fmt(scarto) : '—'}</td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.input-saldo-reale').forEach((input) => {
    input.addEventListener('change', async (e) => {
      const fondoId = e.target.dataset.fondo;
      const valore = e.target.value === '' ? null : parseFloat(e.target.value);
      const { error } = await supabase
        .from('fondi')
        .update({ saldo_reale: valore, data_rilevazione_saldo_reale: valore != null ? new Date().toISOString().slice(0, 10) : null })
        .eq('id', fondoId);
      if (error) { console.error(error); alert('Errore salvataggio saldo reale'); return; }
      caricaFondi();
    });
  });
}

function popolaSelectFondi() {
  const selTipo = document.getElementById('nuovo-fondo-tipo');
  aggiornaSottotipi();
  selTipo.addEventListener('change', aggiornaSottotipi);

  function aggiornaSottotipi() {
    const sel = document.getElementById('nuovo-fondo-sottotipo');
    sel.innerHTML = SOTTOTIPI[selTipo.value].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  }
}

document.getElementById('form-nuovo-fondo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('nuovo-fondo-nome').value.trim();
  const tipo = document.getElementById('nuovo-fondo-tipo').value;
  const sottotipo = document.getElementById('nuovo-fondo-sottotipo').value;
  const saldoIniziale = parseFloat(document.getElementById('nuovo-fondo-saldo').value || '0');
  if (!nome) return;

  const { error } = await supabase.from('fondi').insert({ nome, tipo, sottotipo, saldo_iniziale: saldoIniziale });
  if (error) { console.error(error); alert('Errore creazione fondo'); return; }
  e.target.reset();
  caricaFondi();
});

// ---------------- Movimenti ----------------
function popolaSelectFondoMovimenti() {
  const sel = document.getElementById('filtro-fondo-movimenti');
  const selNuovoFondo = document.getElementById('nuovo-mov-fondo');
  const selNuovoDest = document.getElementById('nuovo-mov-destinazione');
  const opzioni = fondiCache.map((f) => `<option value="${f.fondo_id}">${f.nome}</option>`).join('');
  sel.innerHTML = opzioni;
  selNuovoFondo.innerHTML = opzioni;
  selNuovoDest.innerHTML = opzioni;
  if (fondiCache.length) caricaMovimenti();
}

document.getElementById('filtro-fondo-movimenti').addEventListener('change', caricaMovimenti);
document.getElementById('filtro-mostra-provvisori').addEventListener('change', caricaMovimenti);

async function caricaMovimenti() {
  const fondoId = document.getElementById('filtro-fondo-movimenti').value;
  const mostraProvvisori = document.getElementById('filtro-mostra-provvisori').checked;
  if (!fondoId) return;

  let query = supabase
    .from('movimenti')
    .select('*, fondo_destinazione:fondo_destinazione_id(nome), voce:voce_id(nome)')
    .or(`fondo_id.eq.${fondoId},fondo_destinazione_id.eq.${fondoId}`)
    .order('data', { ascending: false });

  if (!mostraProvvisori) query = query.eq('stato', 'confermato');

  const { data, error } = await query;
  if (error) { console.error(error); return; }
  renderTabellaMovimenti(data, fondoId);
}

function renderTabellaMovimenti(movimenti, fondoId) {
  const tbody = document.querySelector('#tabella-movimenti tbody');
  tbody.innerHTML = '';
  if (!movimenti.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="vuoto">Nessun movimento per questo fondo.</td></tr>`;
    return;
  }
  for (const m of movimenti) {
    const uscita = (m.tipo === 'spesa') || (m.tipo === 'giroconto' && m.fondo_id === fondoId);
    const segnoClasse = uscita ? 'negativo' : 'positivo';
    let descrizioneTipo = m.tipo;
    if (m.tipo === 'giroconto') {
      descrizioneTipo = uscita ? `Giroconto → ${m.fondo_destinazione?.nome ?? ''}` : `Giroconto da altro fondo`;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(m.data).toLocaleDateString('it-IT')}</td>
      <td><span class="badge ${m.tipo}">${descrizioneTipo}</span></td>
      <td>${m.voce?.nome ?? '—'}</td>
      <td>${m.descrizione ?? '—'}</td>
      <td class="numero importo ${segnoClasse}">${uscita ? '−' : '+'}${fmt(m.importo)}</td>
      <td>${m.stato === 'provvisorio' ? '<span class="badge provvisorio">provvisorio</span>' : ''}</td>
    `;
    if (m.stato === 'provvisorio') {
      tr.style.cursor = 'pointer';
      tr.title = 'Clicca per confermare';
      tr.addEventListener('click', () => confermaMovimento(m.id));
    }
    tbody.appendChild(tr);
  }
}

async function confermaMovimento(id) {
  const { error } = await supabase
    .from('movimenti')
    .update({ stato: 'confermato', data_conferma: new Date().toISOString() })
    .eq('id', id);
  if (error) { console.error(error); return; }
  caricaMovimenti();
}

document.getElementById('nuovo-mov-tipo').addEventListener('change', (e) => {
  aggiornaCampiPerTipo(e.target.value);
});

function aggiornaCampiPerTipo(tipo) {
  const isGiroconto = tipo === 'giroconto';
  document.getElementById('campo-destinazione').style.display = isGiroconto ? 'block' : 'none';
  document.getElementById('campo-voce').style.display = isGiroconto ? 'none' : 'block';
  document.getElementById('nuovo-mov-voce').required = !isGiroconto;
  if (!isGiroconto) popolaSelectVoceMovimento(tipo);
}

function popolaSelectVoceMovimento(tipo) {
  const sel = document.getElementById('nuovo-mov-voce');
  const filtrate = vociCache.filter((v) => v.tipo === tipo);
  sel.innerHTML = filtrate.length
    ? filtrate.map((v) => `<option value="${v.id}">${v.nome}</option>`).join('')
    : '<option value="">Nessuna voce — creala nella vista Budget</option>';
}

document.getElementById('form-nuovo-movimento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fondo_id = document.getElementById('nuovo-mov-fondo').value;
  const tipo = document.getElementById('nuovo-mov-tipo').value;
  const importo = parseFloat(document.getElementById('nuovo-mov-importo').value);
  const data = document.getElementById('nuovo-mov-data').value;
  const stato = document.getElementById('nuovo-mov-stato').value;
  const descrizione = document.getElementById('nuovo-mov-descrizione').value.trim() || null;
  const fondo_destinazione_id = tipo === 'giroconto' ? document.getElementById('nuovo-mov-destinazione').value : null;
  const voce_id = tipo !== 'giroconto' ? (document.getElementById('nuovo-mov-voce').value || null) : null;

  if (!fondo_id || !importo || !data) return;
  if (tipo === 'giroconto' && fondo_destinazione_id === fondo_id) {
    alert('Il fondo di destinazione deve essere diverso dal fondo di origine.');
    return;
  }
  if (tipo !== 'giroconto' && !voce_id) {
    alert('Seleziona una voce (creane una nella vista Budget se non esiste ancora).');
    return;
  }

  const { error } = await supabase.from('movimenti').insert({
    fondo_id, tipo, importo, data, stato, descrizione, fondo_destinazione_id, voce_id,
  });
  if (error) { console.error(error); alert('Errore inserimento movimento'); return; }
  e.target.reset();
  document.getElementById('nuovo-mov-data').value = new Date().toISOString().slice(0, 10);
  caricaFondi();
  caricaMovimenti();
});

// ---------------- Voci budget (anagrafica spese/entrate di dettaglio) ----------------
document.getElementById('filtro-tipo-voci').addEventListener('change', caricaVociBudget);

async function caricaVociBudget() {
  const { data, error } = await supabase.from('voci_budget').select('*').eq('attivo', true).order('nome');
  if (error) { console.error(error); return; }
  vociCache = data;

  const tipo = document.getElementById('filtro-tipo-voci').value;
  renderTabellaVoci(tipo ? data.filter((v) => v.tipo === tipo) : data);

  // aggiorna anche la select del form movimento, se un tipo spesa/entrata è già selezionato
  const tipoMovAttuale = document.getElementById('nuovo-mov-tipo').value;
  if (tipoMovAttuale !== 'giroconto') popolaSelectVoceMovimento(tipoMovAttuale);
}

function renderTabellaVoci(voci) {
  const tbody = document.querySelector('#tabella-voci tbody');
  tbody.innerHTML = '';
  if (!voci.length) {
    tbody.innerHTML = `<tr><td colspan="2" class="vuoto">Nessuna voce censita. Aggiungine una qui sotto.</td></tr>`;
    return;
  }
  for (const v of voci) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${v.nome}</td>
      <td><span class="badge ${v.tipo}">${v.tipo}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

document.getElementById('form-nuova-voce').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nome = document.getElementById('nuova-voce-nome').value.trim();
  const tipo = document.getElementById('nuova-voce-tipo').value;
  if (!nome) return;

  const { error } = await supabase.from('voci_budget').insert({ nome, tipo });
  if (error) { console.error(error); alert('Errore creazione voce'); return; }
  e.target.reset();
  caricaVociBudget();
});

// ---------------- Avvio ----------------
document.getElementById('nuovo-mov-data').value = new Date().toISOString().slice(0, 10);
document.getElementById('campo-destinazione').style.display = 'none';
caricaFondi();
caricaVociBudget();
