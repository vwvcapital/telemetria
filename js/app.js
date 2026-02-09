// ===== Supabase Config =====
// SUPABASE_URL e SUPABASE_KEY vêm de config.js (injetado pelo GitHub Actions)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== Group state =====
let GROUP_MAP = {};      // placa (uppercase, no hyphen) → group name
let GROUP_LIST = [];     // sorted unique group names
let GROUP_FILTER = '__all';
let GROUP_BY = false;

// ===== DOM Elements =====
const fileInput = document.getElementById('fileInput');
const fileName = document.getElementById('fileName');
const uploadSection = document.getElementById('uploadSection');
const reportSection = document.getElementById('reportSection');
const reportContent = document.getElementById('reportContent');
const topbarActions = document.getElementById('topbarActions');
const pageTitle = document.getElementById('pageTitle');
const pageSubtitle = document.getElementById('pageSubtitle');
const btnPdf = document.getElementById('btnPdf');
const btnPrint = document.getElementById('btnPrint');
const dropZone = document.getElementById('dropZone');
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const navRelatorio = document.getElementById('navRelatorio');
const navBadge = document.getElementById('navBadge');
const navGrupos = document.getElementById('navGrupos');
const groupSelect = document.getElementById('groupSelect');
const btnGroupBy = document.getElementById('btnGroupBy');
const gruposSection = document.getElementById('gruposSection');
const gruposTableBody = document.getElementById('gruposTableBody');
const gruposSearch = document.getElementById('gruposSearch');
const btnAddPlaca = document.getElementById('btnAddPlaca');

// ===== Initialize Lucide icons + Load groups =====
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  loadGroups();
});

// ===== Load groups from Supabase =====
async function loadGroups() {
  try {
    const { data, error } = await supabaseClient.from('grupos').select('*').order('grupo').order('placa');
    if (error) { console.warn('Supabase grupos error:', error); return; }
    if (!data || data.length === 0) { console.warn('Tabela grupos vazia'); return; }

    allGruposData = data; // store for management page

    const map = {};
    const groupSet = new Set();
    const keys = Object.keys(data[0]);

    data.forEach(row => {
      // Try to find placa and grupo fields flexibly
      const placa = row.placa || row.placa_veiculo || row.plate || row.veiculo || row[keys[0]];
      const grupo = row.grupo || row.nome || row.name || row.group_name || row[keys[1]];
      if (placa && grupo) {
        const normalized = String(placa).toUpperCase().trim();
        const grupoStr = String(grupo).trim();
        map[normalized] = grupoStr;
        groupSet.add(grupoStr);
      }
    });

    GROUP_MAP = map;
    GROUP_LIST = Array.from(groupSet).sort();

    // Populate select
    if (groupSelect) {
      groupSelect.innerHTML = '<option value="__all">Todos os Grupos</option>';
      GROUP_LIST.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        groupSelect.appendChild(opt);
      });
    }

    console.log(`Grupos carregados: ${GROUP_LIST.length} grupos, ${Object.keys(map).length} placas mapeadas`);
  } catch (err) {
    console.warn('Erro ao carregar grupos:', err);
  }
}

// ===== Resolve group for a plate =====
function getGroupForPlate(plateStr) {
  // Remove trailing suffix like -2, -1, etc. (e.g. "SCD1G70-2" → "SCD1G70")
  const base = String(plateStr).replace(/-\d+$/, '').toUpperCase().trim();
  return GROUP_MAP[base] || 'Sem Grupo';
}

// ===== Sidebar toggle (mobile) =====
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('active');
});

sidebarOverlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
});

// ===== Group filter & group-by =====
groupSelect.addEventListener('change', () => {
  GROUP_FILTER = groupSelect.value;
  if (currentVehicles) renderReport(currentVehicles, currentTotalRows, currentFileName);
});

btnGroupBy.addEventListener('click', () => {
  GROUP_BY = !GROUP_BY;
  btnGroupBy.querySelector('span').textContent = GROUP_BY ? 'Desagrupar' : 'Agrupar';
  if (currentVehicles) renderReport(currentVehicles, currentTotalRows, currentFileName);
});

// ===== Navigation =====
let currentVehicles = null;
let currentTotalRows = 0;
let currentFileName = '';
let allGruposData = []; // full data from supabase for the management page

const reportButtons = [groupSelect, btnGroupBy, btnPrint, btnPdf];

function hideAllPages() {
  uploadSection.classList.add('hidden');
  reportSection.classList.add('hidden');
  gruposSection.classList.add('hidden');
  // hide report-only buttons
  reportButtons.forEach(el => el.classList.add('hidden'));
  // deactivate all nav
  navRelatorio.classList.remove('active');
  navGrupos.classList.remove('active');
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('active');
}

function switchToUpload() {
  hideAllPages();
  uploadSection.classList.remove('hidden');
  pageTitle.textContent = 'Carregar Arquivo';
  pageSubtitle.textContent = 'Selecione a planilha de infrações de velocidade';
}

function switchToReport() {
  if (!currentVehicles) return;
  hideAllPages();
  reportSection.classList.remove('hidden');
  reportButtons.forEach(el => el.classList.remove('hidden'));
  pageTitle.textContent = 'Relatório de Infrações';
  pageSubtitle.textContent = 'Análise de velocidade por veículo';
  navRelatorio.classList.add('active');
}

function switchToGrupos() {
  hideAllPages();
  gruposSection.classList.remove('hidden');
  pageTitle.textContent = 'Gerenciar Grupos';
  pageSubtitle.textContent = 'Editar associação placa → grupo';
  navGrupos.classList.add('active');
  renderGruposTable();
}

navRelatorio.addEventListener('click', (e) => {
  e.preventDefault();
  switchToReport();
});

navGrupos.addEventListener('click', (e) => {
  e.preventDefault();
  switchToGrupos();
});

// ===== Drag and Drop =====
['dragenter', 'dragover'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
});

['dragleave', 'drop'].forEach((evt) => {
  dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
  });
});

dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

// ===== Column mapping =====
function normalizeRow(raw) {
  const keys = Object.keys(raw);
  return {
    data: raw[keys[0]] || '',
    veiculo: raw[keys[1]] || '',
    motorista: raw[keys[2]] || '',
    hodometro: raw[keys[3]] || '',
    duracao: raw[keys[4]] || '',
    velocidade: parseFloat(String(raw[keys[5]]).replace(',', '.')) || 0,
    rpmMaximo: raw[keys[6]] || '',
    tipoEvento: raw[keys[7]] || '',
    descricaoEvento: raw[keys[8]] || '',
    limite: parseFloat(String(raw[keys[9]]).replace(',', '.')) || 0,
  };
}

// ===== Process data =====
function processData(rows) {
  const vehicleMap = {};

  rows.forEach((raw) => {
    const row = normalizeRow(raw);
    if (!row.veiculo || row.velocidade === 0) return;

    if (!vehicleMap[row.veiculo]) {
      vehicleMap[row.veiculo] = {
        veiculo: row.veiculo,
        totalInfracoes: 0,
        maiorVelocidade: 0,
        limiteNaMaiorInfracao: 0,
      };
    }

    const v = vehicleMap[row.veiculo];
    v.totalInfracoes++;

    if (row.velocidade > v.maiorVelocidade) {
      v.maiorVelocidade = row.velocidade;
      v.limiteNaMaiorInfracao = row.limite;
    }
  });

  return Object.values(vehicleMap)
    .map(v => {
      v.grupo = getGroupForPlate(v.veiculo);
      return v;
    })
    .sort(
      (a, b) => b.maiorVelocidade - a.maiorVelocidade
    );
}

// ===== Build table rows =====
function buildTableRows(vehicles, startIndex) {
  return vehicles
    .map((v, i) => {
      const excesso = v.maiorVelocidade - v.limiteNaMaiorInfracao;
      let badgeClass = 'badge-success';
      if (v.maiorVelocidade >= 120) badgeClass = 'badge-danger';
      else if (v.maiorVelocidade >= 100) badgeClass = 'badge-warning';

      return `<tr>
        <td>${startIndex + i + 1}</td>
        <td class="cell-vehicle">
          <div>${v.veiculo}</div>
          <div class="vehicle-group-tag">${v.grupo || ''}</div>
        </td>
        <td>${v.totalInfracoes}</td>
        <td><span class="badge ${badgeClass}">${v.maiorVelocidade} km/h</span></td>
        <td>${v.limiteNaMaiorInfracao} km/h</td>
        <td><span class="badge badge-danger">+${excesso} km/h</span></td>
      </tr>`;
    })
    .join('');
}

// ===== Build table section =====
function buildTableSection(title, subtitle, iconName, vehicles, startIndex) {
  return `
    <div class="section-card">
      <div class="section-card-header">
        <div>
          <div class="section-card-title">
            <i data-lucide="${iconName}"></i>
            <span>${title}</span>
          </div>
          ${subtitle ? `<div class="section-card-subtitle">${subtitle}</div>` : ''}
        </div>
      </div>
      <div class="table-wrapper">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Veículo</th>
              <th>Infrações</th>
              <th>Maior Vel.</th>
              <th>Limite</th>
              <th>Excesso</th>
            </tr>
          </thead>
          <tbody>${buildTableRows(vehicles, startIndex)}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ===== Inject DOM watermarks =====
function injectWatermarks() {
  // Remove any existing watermark layer
  const old = reportContent.querySelector('.watermark-layer');
  if (old) old.remove();

  // Create a container that covers the full scrollable height of report content
  const layer = document.createElement('div');
  layer.className = 'watermark-layer';

  // Wait a tick so the browser can compute the content height
  requestAnimationFrame(() => {
    const contentHeight = reportContent.scrollHeight;
    layer.style.height = contentHeight + 'px';

    const TEXT = 'DESENVOLVIDO POR VINICIUS VITTO';
    const SPACING_Y = 200; // px between watermark rows
    const COLS = 3; // number of columns across
    const count = Math.ceil(contentHeight / SPACING_Y);

    for (let row = 0; row < count; row++) {
      for (let col = 0; col < COLS; col++) {
        const wm = document.createElement('div');
        wm.className = 'watermark-item';
        wm.textContent = TEXT;
        const xPercent = ((col + 0.5) / COLS) * 100;
        wm.style.top = (row * SPACING_Y + 60) + 'px';
        wm.style.left = xPercent + '%';
        layer.appendChild(wm);
      }
    }

    reportContent.style.position = 'relative';
    reportContent.insertBefore(layer, reportContent.firstChild);
  });
}

// ===== Render report =====
function renderReport(vehicles, totalRows, uploadedFileName) {
  // Apply group filter
  let filtered = vehicles;
  if (GROUP_FILTER && GROUP_FILTER !== '__all') {
    filtered = vehicles.filter(v => v.grupo === GROUP_FILTER);
  }

  const totalInfracoes = filtered.reduce((s, v) => s + v.totalInfracoes, 0);
  const totalVeiculos = filtered.length;
  const maiorVelocidadeGeral = filtered.length > 0 ? Math.max(...filtered.map((v) => v.maiorVelocidade)) : 0;
  const veiculoMaisRapido = filtered[0]?.veiculo || '-';
  const mediaExcesso =
    filtered.length > 0
      ? (
          filtered.reduce(
            (s, v) => s + (v.maiorVelocidade - v.limiteNaMaiorInfracao),
            0
          ) / filtered.length
        ).toFixed(1)
      : 0;

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR');
  const timeStr = now.toLocaleTimeString('pt-BR');

  // Build table content depending on group-by mode
  let tableHTML = '';

  if (GROUP_BY) {
    // Group by grupo
    const groups = {};
    filtered.forEach(v => {
      const g = v.grupo || 'Sem Grupo';
      if (!groups[g]) groups[g] = [];
      groups[g].push(v);
    });

    const sortedGroups = Object.keys(groups).sort();
    let globalIndex = 0;

    sortedGroups.forEach(groupName => {
      const groupVehicles = groups[groupName];
      const groupInfracoes = groupVehicles.reduce((s, v) => s + v.totalInfracoes, 0);

      tableHTML += `
        <div class="group-heading">
          <i data-lucide="folder"></i>
          <span>${groupName}</span>
          <span class="group-count">${groupVehicles.length} veículo${groupVehicles.length > 1 ? 's' : ''} · ${groupInfracoes} infração${groupInfracoes > 1 ? 'ões' : ''}</span>
        </div>
      `;

      tableHTML += buildTableSection(
        groupName,
        groupVehicles.length + ' veículo' + (groupVehicles.length > 1 ? 's' : '') + ' neste grupo',
        'users',
        groupVehicles,
        globalIndex
      );

      globalIndex += groupVehicles.length;
    });
  } else {
    // Normal mode: top 10 + remaining
    const top10 = filtered.slice(0, 10);
    const remaining = filtered.slice(10);

    tableHTML += buildTableSection(
      'Top 10 — Maiores Velocidades',
      'Ordenado por maior velocidade registrada (decrescente)',
      'zap',
      top10,
      0
    );

    if (remaining.length > 0) {
      tableHTML += `
        <div class="report-footer" style="margin-bottom:1.5rem">
          <p>Página 1 de 2</p>
        </div>
        <div class="report-page">
      `;
      tableHTML += buildTableSection(
        'Demais Veículos',
        'Posições 11–' + filtered.length + ' de ' + filtered.length + ' veículos',
        'list',
        remaining,
        10
      );
      tableHTML += '</div>';
    }
  }

  const filterLabel = GROUP_FILTER !== '__all' ? ` · Grupo: <strong>${GROUP_FILTER}</strong>` : '';

  reportContent.innerHTML = `
    <div class="report-page">
      <!-- Meta bar -->
      <div class="report-meta-bar">
        <div class="report-meta-left">
          <div class="meta-item">
            <i data-lucide="file-text"></i>
            <span>Arquivo: <strong>${uploadedFileName}</strong></span>
          </div>
          <div class="meta-item">
            <i data-lucide="calendar"></i>
            <span>Gerado em: <strong>${dateStr} ${timeStr}</strong></span>
          </div>
          <div class="meta-item">
            <i data-lucide="database"></i>
            <span>Registros: <strong>${totalRows}</strong>${filterLabel}</span>
          </div>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="stat-card">
          <div class="stat-card-body">
            <span class="stat-label">Total de Infrações</span>
            <span class="stat-value">${totalInfracoes}</span>
            <span class="stat-sub">${totalVeiculos} veículos envolvidos</span>
          </div>
          <div class="stat-icon-wrap red">
            <i data-lucide="alert-triangle"></i>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-body">
            <span class="stat-label">Maior Velocidade</span>
            <span class="stat-value">${maiorVelocidadeGeral}</span>
            <span class="stat-sub">km/h registrados</span>
          </div>
          <div class="stat-icon-wrap amber">
            <i data-lucide="gauge"></i>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-body">
            <span class="stat-label">Veículo + Rápido</span>
            <span class="stat-value" style="font-size:1.1rem">${veiculoMaisRapido}</span>
            <span class="stat-sub">maior velocidade registrada</span>
          </div>
          <div class="stat-icon-wrap blue">
            <i data-lucide="truck"></i>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-body">
            <span class="stat-label">Média de Excesso</span>
            <span class="stat-value">${mediaExcesso}</span>
            <span class="stat-sub">km/h acima do limite</span>
          </div>
          <div class="stat-icon-wrap green">
            <i data-lucide="trending-up"></i>
          </div>
        </div>
      </div>

      ${tableHTML}

      <div class="report-footer">
        <p>Relatório gerado automaticamente pelo sistema de Telemetria</p>
        <p>${dateStr} às ${timeStr}</p>
      </div>
    </div>
  `;

  // Re-render lucide icons inside dynamic content
  lucide.createIcons();

  // Inject DOM-based watermarks (html2canvas-compatible)
  injectWatermarks();

  // Update nav
  navRelatorio.classList.add('ready');
  navRelatorio.classList.remove('disabled');
  navBadge.style.display = '';
  navBadge.textContent = totalVeiculos;

  switchToReport();
}

// ===== Handle file =====
function handleFile(file) {
  if (!file) return;
  fileName.textContent = file.name;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = new Uint8Array(evt.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      if (rows.length === 0) {
        alert('A planilha está vazia ou não possui dados válidos.');
        return;
      }

      const vehicles = processData(rows);

      if (vehicles.length === 0) {
        alert('Nenhum dado de infração encontrado na planilha.');
        return;
      }

      currentVehicles = vehicles;
      currentTotalRows = rows.length;
      currentFileName = file.name;

      renderReport(vehicles, rows.length, file.name);
    } catch (err) {
      console.error(err);
      alert('Erro ao ler o arquivo. Verifique se é um arquivo .xlsx válido.');
    }
  };

  reader.readAsArrayBuffer(file);
}

// ===== File input handler =====
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

// ===== Print =====
btnPrint.addEventListener('click', () => {
  window.print();
});

// ===== Export PDF =====
btnPdf.addEventListener('click', () => {
  const element = reportContent;

  const opt = {
    margin: [10, 10, 10, 10],
    filename: `relatorio-infracoes-${new Date().toISOString().slice(0, 10)}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      letterRendering: true,
    },
    jsPDF: {
      unit: 'mm',
      format: 'a4',
      orientation: 'portrait',
    },
    pagebreak: {
      mode: ['avoid-all', 'css', 'legacy'],
      avoid: ['tr', '.stat-card', '.summary-grid', '.report-meta-bar', '.section-card-header', '.group-heading'],
    },
  };

  element.style.borderRadius = '0';

  // Small delay to ensure watermark DOM elements are fully rendered
  setTimeout(() => {
    html2pdf()
      .set(opt)
      .from(element)
      .save()
      .then(() => {
        element.style.borderRadius = '';
      });
  }, 100);
});

// ===== Toast =====
function showToast(message, isError = false) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== Grupos Management =====
function renderGruposTable(filter = '') {
  const filtered = filter
    ? allGruposData.filter(r =>
        (r.placa || '').toLowerCase().includes(filter.toLowerCase()) ||
        (r.grupo || '').toLowerCase().includes(filter.toLowerCase())
      )
    : allGruposData;

  if (filtered.length === 0) {
    gruposTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:2rem;color:var(--muted-foreground)">${allGruposData.length === 0 ? 'Carregando...' : 'Nenhum resultado encontrado'}</td></tr>`;
    return;
  }

  gruposTableBody.innerHTML = filtered.map(row => `
    <tr data-placa="${row.placa}">
      <td style="font-weight:600">${row.placa}</td>
      <td>${row.grupo || ''}</td>
      <td style="color:var(--muted-foreground);font-size:0.82rem">${row.modelo || ''}</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" title="Editar" onclick="startEditRow('${row.placa}')">
            <i data-lucide="pencil"></i>
          </button>
          <button class="btn-icon delete" title="Excluir" onclick="deleteRow('${row.placa}')">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

window.startEditRow = function(placa) {
  const row = allGruposData.find(r => r.placa === placa);
  if (!row) return;
  const tr = gruposTableBody.querySelector(`tr[data-placa="${placa}"]`);
  if (!tr) return;

  tr.innerHTML = `
    <td><input class="grupo-edit-input" value="${row.placa}" id="editPlaca" /></td>
    <td><input class="grupo-edit-input" value="${row.grupo || ''}" id="editGrupo" /></td>
    <td><input class="grupo-edit-input" value="${row.modelo || ''}" id="editModelo" /></td>
    <td>
      <div class="action-btns">
        <button class="btn-icon save" title="Salvar" onclick="saveEditRow('${placa}')">
          <i data-lucide="check"></i>
        </button>
        <button class="btn-icon cancel" title="Cancelar" onclick="renderGruposTable(gruposSearch.value)">
          <i data-lucide="x"></i>
        </button>
      </div>
    </td>
  `;
  lucide.createIcons();
  tr.querySelector('#editGrupo').focus();
};

window.saveEditRow = async function(originalPlaca) {
  const newPlaca = document.getElementById('editPlaca').value.trim().toUpperCase();
  const newGrupo = document.getElementById('editGrupo').value.trim();
  const newModelo = document.getElementById('editModelo').value.trim();

  if (!newPlaca || !newGrupo) {
    showToast('Placa e Grupo são obrigatórios', true);
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('grupos')
      .update({ placa: newPlaca, grupo: newGrupo, modelo: newModelo })
      .eq('placa', originalPlaca);

    if (error) throw error;

    showToast('Atualizado com sucesso!');
    await reloadGrupos();
  } catch (err) {
    console.error(err);
    showToast('Erro ao salvar: ' + err.message, true);
  }
};

window.deleteRow = async function(placa) {
  if (!confirm(`Deseja excluir a placa ${placa}?`)) return;

  try {
    const { error } = await supabaseClient
      .from('grupos')
      .delete()
      .eq('placa', placa);

    if (error) throw error;

    showToast('Placa excluída!');
    await reloadGrupos();
  } catch (err) {
    console.error(err);
    showToast('Erro ao excluir: ' + err.message, true);
  }
};

btnAddPlaca.addEventListener('click', () => {
  // Insert empty row at the top for editing
  const existingNew = gruposTableBody.querySelector('tr[data-placa="__new__"]');
  if (existingNew) return; // already adding

  const tr = document.createElement('tr');
  tr.setAttribute('data-placa', '__new__');
  tr.innerHTML = `
    <td><input class="grupo-edit-input" placeholder="ABC1D23" id="newPlaca" /></td>
    <td><input class="grupo-edit-input" placeholder="Nome do grupo" id="newGrupo" /></td>
    <td><input class="grupo-edit-input" placeholder="Modelo (opcional)" id="newModelo" /></td>
    <td>
      <div class="action-btns">
        <button class="btn-icon save" title="Salvar" onclick="saveNewRow()">
          <i data-lucide="check"></i>
        </button>
        <button class="btn-icon cancel" title="Cancelar" onclick="this.closest('tr').remove()">
          <i data-lucide="x"></i>
        </button>
      </div>
    </td>
  `;
  gruposTableBody.prepend(tr);
  lucide.createIcons();
  tr.querySelector('#newPlaca').focus();
});

window.saveNewRow = async function() {
  const placa = document.getElementById('newPlaca').value.trim().toUpperCase();
  const grupo = document.getElementById('newGrupo').value.trim();
  const modelo = document.getElementById('newModelo').value.trim();

  if (!placa || !grupo) {
    showToast('Placa e Grupo são obrigatórios', true);
    return;
  }

  try {
    const { error } = await supabaseClient
      .from('grupos')
      .insert({ placa, grupo, modelo });

    if (error) throw error;

    showToast('Placa adicionada!');
    await reloadGrupos();
  } catch (err) {
    console.error(err);
    showToast('Erro ao adicionar: ' + err.message, true);
  }
};

async function reloadGrupos() {
  await loadGroups();
  // Also reload management table data
  try {
    const { data } = await supabaseClient.from('grupos').select('*').order('grupo').order('placa');
    allGruposData = data || [];
  } catch (e) { /* already loaded in loadGroups */ }
  renderGruposTable(gruposSearch.value);

  // Re-process vehicles if loaded
  if (currentVehicles) {
    currentVehicles.forEach(v => {
      v.grupo = getGroupForPlate(v.veiculo);
    });
  }
}

gruposSearch.addEventListener('input', () => {
  renderGruposTable(gruposSearch.value);
});
