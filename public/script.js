/* ==========================================================================
   NETWORK HANDOVER & AUDIT SUITE - FRONTEND APPLICATION LOGIC
   ========================================================================== */

const API_BASE = '/api';
const LOCAL_STORAGE_KEY = 'nethandover_records_v1';

let currentTemplate = 'handover';
let savedRecords = [];
let editingRecordId = null;
let isClientLocked = false;
let userClearedRecords = false;
let sigDataUrl = '';
let rxTrendChart = null;
let templateDistChart = null;
let slaSparkChart = null;

function getTodayFormatted() {
  return new Date()
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    .toUpperCase()
    .replace(/ /g, '-');
}

let commonState = {
  companyName: 'CALABARZON FIBER NETWORKS',
  companySubtitle: 'Enterprise Core & Access Provisioning',
  companyLogo: '',
  woNumber: 'WO-2026-0841',
  formDate: getTodayFormatted(),
  clientName: 'Batangas Logistics & Cold Storage Corp.',
  siteAddress: 'Diversion Road, Brgy. Alangilan, Batangas City',
  techName: 'Engr. R. Mendoza (NOC Field Ops)'
};

let templateState = {
  handover: {
    circuitType: 'Dedicated Fiber DIA (GPON / Active Ethernet)',
    bandwidth: '500 Mbps Symmetrical (CIR 1:1)',
    wanIp: '120.28.142.18',
    wanSubnet: '255.255.255.252 (/30)',
    wanGateway: '120.28.142.17',
    dnsServers: '1.1.1.1, 8.8.8.8',
    vlanId: 'VLAN 412 (Enterprise DIA)',
    rxPower: '-18.4',
    txPower: '+2.1',
    ontSerial: 'HWTC-99482A1F',
    remarks: 'BERT & RFC-2544 throughput verified at 99.4% line rate. Optical patch cord dressed and labeled at customer demarcation.'
  },
  lan: {
    switchModel: 'Cisco Catalyst C9200L-24P-4G',
    switchMgmtIp: '10.24.10.2 /24',
    lanSubnet: '192.168.10.0/24',
    dhcpRange: '192.168.10.50 - 192.168.10.220',
    vlanList: 'VLAN 10 (Corp), VLAN 20 (VoIP), VLAN 30 (CCTV), VLAN 99 (Mgmt)',
    uplinkPort: 'Te1/1/1 -> Core-SW-01 (10G SFP+ LR)',
    poeBudget: '142W / 370W Utilized (12 Active AP/VoIP Endpoints)',
    cableCert: 'Fluke DSX-5000 Cat6A Permanent Link — PASS',
    notes: 'RSTP root guard and BPDU guard enabled on all access ports. Port-security sticky MAC configured.'
  },
  tags: {
    odfPort: 'ODF-02 / Panel B / Port 14',
    napBox: 'NAP-BTG-048 (Pole #114)',
    splitterRatio: '1:16 PLC Optical Splitter',
    fiberCore: 'Core #07 (Blue Buffer / Red Strand)',
    dropLength: '185 Meters (2-Core Fig-8 Outdoor Drop)',
    routePath: 'Main Riser -> MDF Conduit B -> Ground Floor Telecom Room',
    tagCount: '4'
  },
  rack: {
    rackLocation: '2nd Floor Server Room — IDF Cabinet A',
    cabinetId: 'RACK-IDF-01 (42U Enclosed)',
    routerModel: 'MikroTik CCR2004-1G-12S+2XS',
    routerSerial: 'HFE0892K114',
    upsModel: 'APC Smart-UPS 1500VA LCD (SMT1500RM2U)',
    upsBattery: '100% Charge — 48 Mins Estimated Runtime',
    tempC: '21.5 °C (46% RH)',
    groundingStatus: 'Bonded to Main Telecom Ground Busbar (< 1.2 Ohms)',
    auditNotes: 'Dual PSU failover tested. Velcro cable management dressed cleanly; zero airflow obstruction.'
  },
  diag: {
    ssid24: 'CorpNet-IoT (2.4 GHz / 20 MHz)',
    ssid5: 'CorpNet-Enterprise (5 GHz / 40 MHz)',
    channelPlan: 'Ch 1, 6, 11 (2.4G) | Ch 36, 44, 149 (5G)',
    rssiDbm: '-54 dBm (SNR 38 dB)',
    gatewayPing: '1.8 ms (0% Loss)',
    dnsPing: '8.4 ms (0% Loss)',
    packetLoss: '0.00% (1000 ICMP Packets)',
    speedDown: '492.6 Mbps',
    speedUp: '488.1 Mbps',
    triageVerdict: 'PASS — Zero RF co-channel interference; roaming handoff verified < 45ms.'
  }
};

const TEMPLATE_NAV_CONFIG = {
  handover: {
    jump04: 'WAN & Optical',
    title04: 'WAN & Optical Telemetry',
    badge04: 'DIA / GPON',
    jump05: 'Signature',
    title05: 'Client Acceptance Signature'
  },
  lan: {
    jump04: 'LAN & Switch',
    title04: 'LAN & Switching Matrix',
    badge04: 'L2 / L3 VLAN',
    jump05: 'Signature',
    title05: 'Client Acceptance Signature'
  },
  tags: {
    jump04: 'Fiber Labels',
    title04: 'Fiber Drop & ODF Labels',
    badge04: 'TIA-598-C',
    jump05: 'Verification',
    title05: 'Technician & Site Verification'
  },
  rack: {
    jump04: 'Rack & Power',
    title04: 'CPE, Rack & Power Audit',
    badge04: 'IDF / UPS',
    jump05: 'Sign-Off',
    title05: 'Facility & Client Sign-Off'
  },
  diag: {
    jump04: 'Wi-Fi & Ping',
    title04: 'Wi-Fi & Latency Triage',
    badge04: 'RF / ICMP',
    jump05: 'Sign-Off',
    title05: 'Diagnostic Acceptance Sign-Off'
  }
};

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Chart !== 'undefined') {
    Chart.defaults.font.family = 'Helvetica, "Helvetica Neue", Arial, sans-serif';
  }
  syncCommonInputsFromState();
  initSignaturePad();
  initFormScrollSpy();
  initCidrSelect();
  runSubnetCalc();
  runFiberColorLookup();
  calcLossBudget();
  selectTemplate(currentTemplate);
  loadRecordsFromServer();
  switchScreen('home');
});

function syncCommonInputsFromState() {
  const map = {
    'common-company-name': commonState.companyName,
    'common-company-subtitle': commonState.companySubtitle,
    'common-wo-number': commonState.woNumber,
    'common-form-date': commonState.formDate,
    'common-client-name': commonState.clientName,
    'common-site-address': commonState.siteAddress,
    'common-tech-name': commonState.techName
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  });
  updateLogoPreviewUI();
}

function handleCommonInput(key, value) {
  commonState[key] = value;
  renderDocumentPreview();
}

function handleTemplateInput(key, value) {
  templateState[currentTemplate][key] = value;
  renderDocumentPreview();
}

/* ==========================================================================
   LOGO UPLOAD
   ========================================================================== */
function handleLogoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    commonState.companyLogo = e.target.result;
    updateLogoPreviewUI();
    renderDocumentPreview();
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  commonState.companyLogo = '';
  const input = document.getElementById('company-logo-file');
  if (input) input.value = '';
  updateLogoPreviewUI();
  renderDocumentPreview();
}

function updateLogoPreviewUI() {
  const box = document.getElementById('company-logo-preview');
  const removeBtn = document.getElementById('btn-remove-logo');
  if (!box) return;
  if (commonState.companyLogo) {
    box.innerHTML = `<img src="${commonState.companyLogo}" alt="Logo" class="w-full h-full object-contain bg-white p-1">`;
    if (removeBtn) removeBtn.classList.remove('hidden');
  } else {
    box.innerHTML = `<i class="fa-solid fa-network-wired text-xs"></i>`;
    if (removeBtn) removeBtn.classList.add('hidden');
  }
}

/* ==========================================================================
   NAVIGATION, JUMP BAR & TEMPLATE SWITCHING
   ========================================================================== */
function setActiveJumpPill(sectionId) {
  document.querySelectorAll('.jump-pill').forEach(btn => {
    btn.className = 'jump-pill bg-[#242629] hover:bg-[#2e3134] border border-[#3e4146] text-slate-200 font-medium px-2.5 py-0.5 rounded-none cursor-pointer whitespace-nowrap transition';
  });
  const activeBtn = document.getElementById(`jump-btn-${sectionId}`);
  if (activeBtn) {
    activeBtn.className = 'jump-pill bg-[#f26b3a] text-white border border-[#f26b3a] font-semibold px-2.5 py-0.5 rounded-none cursor-pointer whitespace-nowrap transition';
  }
}

function jumpToFormSection(sectionId) {
  const form = document.getElementById('doc-form');
  const target = document.getElementById(sectionId);
  if (!form || !target) return;

  const formRect = form.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const nextTop = form.scrollTop + (targetRect.top - formRect.top) - 10;

  form.scrollTo({
    top: Math.max(0, nextTop),
    behavior: 'smooth'
  });

  setActiveJumpPill(sectionId);

  target.classList.remove('section-highlight-flash');
  void target.offsetWidth;
  target.classList.add('section-highlight-flash');
}

function initFormScrollSpy() {
  const form = document.getElementById('doc-form');
  if (!form) return;

  form.addEventListener('scroll', () => {
    const sectionIds = ['sec-provider', 'sec-client', 'sec-specs', 'sec-signature'];
    const formTop = form.getBoundingClientRect().top;
    let currentId = sectionIds[0];

    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top - formTop <= 75) {
        currentId = id;
      }
    }
    setActiveJumpPill(currentId);
  }, { passive: true });
}

function syncStudioColumnHeights() {
  const sidebar = document.getElementById('studio-sidebar');
  const previewMain = document.getElementById('studio-preview-main');
  if (!sidebar || !previewMain) return;

  if (window.innerWidth >= 768 && previewMain.offsetHeight > 0) {
    sidebar.style.height = `${previewMain.offsetHeight}px`;
  } else {
    sidebar.style.height = '';
  }
}

window.addEventListener('resize', syncStudioColumnHeights);

if (typeof ResizeObserver !== 'undefined') {
  const previewEl = document.getElementById('studio-preview-main');
  if (previewEl) {
    new ResizeObserver(syncStudioColumnHeights).observe(previewEl);
  }
}

function switchScreen(screenName) {
  ['home', 'studio', 'vault', 'analytics', 'tools'].forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (el) el.classList.add('hidden');

    const navEl = document.getElementById(`nav-${s}`);
    if (navEl) {
      navEl.className = 'h-full text-xs font-medium text-slate-300 hover:text-white border-b-2 border-transparent transition cursor-pointer px-1 flex items-center gap-1.5';
    }

    const mNavEl = document.getElementById(`mnav-${s}`);
    if (mNavEl) {
      mNavEl.className = 'text-slate-200 px-3 py-1 rounded-none cursor-pointer';
    }
  });

  const activeEl = document.getElementById(`screen-${screenName}`);
  if (activeEl) activeEl.classList.remove('hidden');

  const activeNav = document.getElementById(`nav-${screenName}`);
  if (activeNav) {
    activeNav.className = 'h-full text-xs font-semibold transition cursor-pointer text-[#f26b3a] border-b-2 border-[#f26b3a] px-1 flex items-center gap-1.5';
  }

  const activeMNav = document.getElementById(`mnav-${screenName}`);
  if (activeMNav) {
    activeMNav.className = 'bg-[#f26b3a] text-white px-3 py-1 rounded-none cursor-pointer';
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (screenName === 'home') renderHomeOverview();
  if (screenName === 'studio') syncStudioColumnHeights();
  if (screenName === 'vault') renderVaultTable();
  if (screenName === 'analytics') renderAnalyticsScreen();
}

function launchTemplateFromHome(tmpl) {
  selectTemplate(tmpl);
  switchScreen('studio');
}

function selectTemplate(tmpl) {
  currentTemplate = tmpl;
  ['handover', 'lan', 'tags', 'rack', 'diag'].forEach(t => {
    const pill = document.getElementById(`tab-${t}`);
    if (!pill) return;
    if (t === tmpl) {
      pill.classList.add('active-pill');
    } else {
      pill.classList.remove('active-pill');
    }
  });

  const navCfg = TEMPLATE_NAV_CONFIG[tmpl] || TEMPLATE_NAV_CONFIG.handover;
  const jump04 = document.getElementById('jump-btn-sec-specs');
  const jump05 = document.getElementById('jump-btn-sec-signature');
  const title04 = document.getElementById('sec-specs-title');
  const badge04 = document.getElementById('sec-specs-badge');
  const title05 = document.getElementById('sec-signature-title');

  if (jump04) jump04.textContent = navCfg.jump04;
  if (jump05) jump05.textContent = navCfg.jump05;
  if (title04) title04.textContent = navCfg.title04;
  if (badge04) badge04.textContent = navCfg.badge04;
  if (title05) title05.textContent = navCfg.title05;

  renderDynamicFields();
  renderDocumentPreview();
}

/* ==========================================================================
   MAIN PAGE / OVERVIEW LIVE METRICS & RECENT HANDOVERS
   ========================================================================== */
function renderHomeOverview() {
  const total = savedRecords.length;
  const signed = savedRecords.filter(r => Boolean(r.signature)).length;
  const signoffRate = total > 0 ? Math.round((signed / total) * 100) : 0;

  const rxValues = [];
  let passCount = 0;

  savedRecords.forEach(r => {
    const d = r.data || {};
    if (r.template === 'handover' && d.rxPower) {
      const val = parseFloat(d.rxPower);
      if (!isNaN(val)) {
        rxValues.push(val);
        if (val >= -25.0 && val <= -8.0) passCount++;
      }
    }
  });

  const meanRx = rxValues.length > 0
    ? (rxValues.reduce((a, b) => a + b, 0) / rxValues.length)
    : (parseFloat(templateState.handover.rxPower) || -18.4);

  const passRate = rxValues.length > 0 ? Math.round((passCount / rxValues.length) * 100) : 100;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('home-kpi-total', total);
  setText('home-kpi-signed', `${signoffRate}%`);
  setText('home-kpi-rx', `${meanRx.toFixed(1)} dBm`);
  setText('home-kpi-passrate', `${passRate}%`);

  const tbody = document.getElementById('home-recent-tbody');
  if (!tbody) return;

  const recent = savedRecords.slice(0, 5);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="py-6 text-center text-slate-300">No circuit records available yet. Click "Create Handover" to begin.</td></tr>`;
    return;
  }

  tbody.innerHTML = recent.map(r => {
    const c = r.common || r || {};
    return `
      <tr class="hover:bg-[#212326] transition">
        <td class="py-3 px-3.5 font-mono font-bold text-[#ff8b60] whitespace-nowrap">
          ${escapeHtml(c.woNumber || r.id)}
          <span class="block text-[10px] font-normal text-[#9ca3af]">${escapeHtml(c.formDate || '')}</span>
        </td>
        <td class="py-3 px-3.5">
          <div class="font-semibold text-white">${escapeHtml(c.clientName || 'Unnamed Client')}</div>
          <div class="text-[11px] text-[#9ca3af]">${escapeHtml(c.siteAddress || '')}</div>
        </td>
        <td class="py-3 px-3.5 whitespace-nowrap">
          ${r.signature
            ? '<span class="inline-flex items-center gap-1.5 bg-emerald-950 text-emerald-300 border border-emerald-500/60 px-2 py-0.5 text-[11px] font-semibold"><span class="w-1.5 h-1.5 bg-emerald-400"></span>Signed</span>'
            : '<span class="inline-flex items-center gap-1.5 bg-amber-950 text-amber-300 border border-amber-500/60 px-2 py-0.5 text-[11px] font-semibold"><span class="w-1.5 h-1.5 bg-amber-400"></span>Pending</span>'}
        </td>
        <td class="py-3 px-3.5 text-right whitespace-nowrap">
          <button type="button" onclick="loadWorkOrderFromDB('${r.id}')" class="bg-[#f26b3a] hover:bg-[#e05a2b] text-white text-[11px] font-bold px-3 py-1 cursor-pointer transition">
            Open
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ==========================================================================
   DYNAMIC TECHNICAL PARAMETER INPUTS
   ========================================================================== */
function renderDynamicFields() {
  const container = document.getElementById('dynamic-template-fields-container');
  if (!container) return;
  const d = templateState[currentTemplate];
  const disabledAttr = isClientLocked ? 'disabled' : '';

  if (currentTemplate === 'handover') {
    container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Service / Circuit Type</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.circuitType)}" oninput="handleTemplateInput('circuitType', this.value)" class="form-input w-full">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Subscribed Bandwidth</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.bandwidth)}" oninput="handleTemplateInput('bandwidth', this.value)" class="form-input w-full">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Assigned WAN IP</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.wanIp)}" oninput="handleTemplateInput('wanIp', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Subnet Mask</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.wanSubnet)}" oninput="handleTemplateInput('wanSubnet', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Default Gateway</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.wanGateway)}" oninput="handleTemplateInput('wanGateway', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">DNS Resolvers</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.dnsServers)}" oninput="handleTemplateInput('dnsServers', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Service VLAN</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.vlanId)}" oninput="handleTemplateInput('vlanId', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Optical RX (dBm)</label>
          <input type="number" step="0.1" ${disabledAttr} value="${escapeHtml(d.rxPower)}" oninput="handleTemplateInput('rxPower', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Optical TX (dBm)</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.txPower)}" oninput="handleTemplateInput('txPower', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">ONT / CPE Serial</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.ontSerial)}" oninput="handleTemplateInput('ontSerial', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-200 mb-1">Commissioning & Acceptance Notes</label>
        <textarea rows="2" ${disabledAttr} oninput="handleTemplateInput('remarks', this.value)" class="form-input w-full">${escapeHtml(d.remarks)}</textarea>
      </div>
    `;
  } else if (currentTemplate === 'lan') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Access Switch Model</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.switchModel)}" oninput="handleTemplateInput('switchModel', this.value)" class="form-input w-full">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Management IP</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.switchMgmtIp)}" oninput="handleTemplateInput('switchMgmtIp', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">LAN CIDR Block</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.lanSubnet)}" oninput="handleTemplateInput('lanSubnet', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">DHCP Scope</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.dhcpRange)}" oninput="handleTemplateInput('dhcpRange', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-200 mb-1">Configured VLAN Segmentation</label>
        <input type="text" ${disabledAttr} value="${escapeHtml(d.vlanList)}" oninput="handleTemplateInput('vlanList', this.value)" class="form-input w-full font-mono">
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Trunk Uplink Interface</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.uplinkPort)}" oninput="handleTemplateInput('uplinkPort', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">PoE+ Load Budget</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.poeBudget)}" oninput="handleTemplateInput('poeBudget', this.value)" class="form-input w-full">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-200 mb-1">Structured Cabling Certification</label>
        <input type="text" ${disabledAttr} value="${escapeHtml(d.cableCert)}" oninput="handleTemplateInput('cableCert', this.value)" class="form-input w-full">
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-200 mb-1">Switching & Security Notes</label>
        <textarea rows="2" ${disabledAttr} oninput="handleTemplateInput('notes', this.value)" class="form-input w-full">${escapeHtml(d.notes)}</textarea>
      </div>
    `;
  } else if (currentTemplate === 'tags') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">ODF / Patch Panel Port</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.odfPort)}" oninput="handleTemplateInput('odfPort', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">NAP / Closure ID</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.napBox)}" oninput="handleTemplateInput('napBox', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Splitter Ratio</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.splitterRatio)}" oninput="handleTemplateInput('splitterRatio', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">TIA-598-C Core Color</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.fiberCore)}" oninput="handleTemplateInput('fiberCore', this.value)" class="form-input w-full">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Drop Cable Span</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.dropLength)}" oninput="handleTemplateInput('dropLength', this.value)" class="form-input w-full">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Printable Tag Copies (A4)</label>
          <select ${disabledAttr} onchange="handleTemplateInput('tagCount', this.value)" class="form-input w-full">
            <option value="2" ${d.tagCount === '2' ? 'selected' : ''}>2 Large Tags</option>
            <option value="4" ${d.tagCount === '4' ? 'selected' : ''}>4 Standard Tags</option>
            <option value="6" ${d.tagCount === '6' ? 'selected' : ''}>6 Compact Tags</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-200 mb-1">Physical Conduit / Riser Pathway</label>
        <input type="text" ${disabledAttr} value="${escapeHtml(d.routePath)}" oninput="handleTemplateInput('routePath', this.value)" class="form-input w-full">
      </div>
    `;
  } else if (currentTemplate === 'rack') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Room / Facility Location</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.rackLocation)}" oninput="handleTemplateInput('rackLocation', this.value)" class="form-input w-full">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Cabinet Designation</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.cabinetId)}" oninput="handleTemplateInput('cabinetId', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Edge Router / Firewall</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.routerModel)}" oninput="handleTemplateInput('routerModel', this.value)" class="form-input w-full">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Chassis Serial #</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.routerSerial)}" oninput="handleTemplateInput('routerSerial', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">UPS Backup Unit</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.upsModel)}" oninput="handleTemplateInput('upsModel', this.value)" class="form-input w-full">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Battery & Load Status</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.upsBattery)}" oninput="handleTemplateInput('upsBattery', this.value)" class="form-input w-full">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Ambient Temp / RH</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.tempC)}" oninput="handleTemplateInput('tempC', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Earth Grounding</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.groundingStatus)}" oninput="handleTemplateInput('groundingStatus', this.value)" class="form-input w-full">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-200 mb-1">Physical Inspection Remarks</label>
        <textarea rows="2" ${disabledAttr} oninput="handleTemplateInput('auditNotes', this.value)" class="form-input w-full">${escapeHtml(d.auditNotes)}</textarea>
      </div>
    `;
  } else if (currentTemplate === 'diag') {
    container.innerHTML = `
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">2.4 GHz SSID</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.ssid24)}" oninput="handleTemplateInput('ssid24', this.value)" class="form-input w-full">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">5 GHz SSID</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.ssid5)}" oninput="handleTemplateInput('ssid5', this.value)" class="form-input w-full">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">RF Channel Allocation</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.channelPlan)}" oninput="handleTemplateInput('channelPlan', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Signal RSSI / SNR</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.rssiDbm)}" oninput="handleTemplateInput('rssiDbm', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Gateway RTT</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.gatewayPing)}" oninput="handleTemplateInput('gatewayPing', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">External DNS RTT</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.dnsPing)}" oninput="handleTemplateInput('dnsPing', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Packet Loss</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.packetLoss)}" oninput="handleTemplateInput('packetLoss', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Measured Download</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.speedDown)}" oninput="handleTemplateInput('speedDown', this.value)" class="form-input w-full font-mono">
        </div>
        <div>
          <label class="block text-xs font-medium text-slate-200 mb-1">Measured Upload</label>
          <input type="text" ${disabledAttr} value="${escapeHtml(d.speedUp)}" oninput="handleTemplateInput('speedUp', this.value)" class="form-input w-full font-mono">
        </div>
      </div>
      <div>
        <label class="block text-xs font-medium text-slate-200 mb-1">Diagnostic Triage Conclusion</label>
        <textarea rows="2" ${disabledAttr} oninput="handleTemplateInput('triageVerdict', this.value)" class="form-input w-full">${escapeHtml(d.triageVerdict)}</textarea>
      </div>
    `;
  }
}

/* ==========================================================================
   OPTICAL VALIDATION GUARDRAIL
   ========================================================================== */
function evaluateOpticalStatus() {
  const rx = parseFloat(templateState.handover.rxPower);
  const statusEl = document.getElementById('sidebar-validation-status');
  if (isNaN(rx)) {
    if (statusEl) {
      statusEl.textContent = 'N/A';
      statusEl.className = 'text-slate-300 font-bold';
    }
    return { label: 'UNVERIFIED', pass: true };
  }
  if (rx >= -25.0 && rx <= -8.0) {
    if (statusEl) {
      statusEl.textContent = `PASS (${rx.toFixed(1)} dBm OPTIMAL)`;
      statusEl.className = 'text-emerald-400 font-bold';
    }
    return { label: 'PASS (OPTIMAL)', pass: true };
  }
  if (rx < -25.0 && rx >= -28.0) {
    if (statusEl) {
      statusEl.textContent = `WARN (${rx.toFixed(1)} dBm MARGINAL)`;
      statusEl.className = 'text-amber-300 font-bold';
    }
    return { label: 'WARNING (MARGINAL)', pass: true };
  }
  if (statusEl) {
    statusEl.textContent = `FAIL (${rx.toFixed(1)} dBm OUT OF RANGE)`;
    statusEl.className = 'text-rose-400 font-bold';
  }
  return { label: 'FAIL (OUT OF SPEC)', pass: false };
}

/* ==========================================================================
   A4 PRINTABLE DOCUMENT RENDERER
   ========================================================================== */
function renderDocumentPreview() {
  const canvas = document.getElementById('printable-canvas');
  if (!canvas) return;
  const opt = evaluateOpticalStatus();

  const logoHtml = commonState.companyLogo
    ? `<img src="${commonState.companyLogo}" alt="Logo" class="h-12 w-auto max-w-[130px] object-contain">`
    : `<div class="w-11 h-11 rounded-none bg-slate-900 text-white flex items-center justify-center text-lg font-bold"><i class="fa-solid fa-network-wired"></i></div>`;

  const docTitles = {
    handover: { code: 'FORM-NOC-01', title: 'CIRCUIT COMMISSIONING & SERVICE ACCEPTANCE CERTIFICATE' },
    lan: { code: 'FORM-LAN-02', title: 'ENTERPRISE LAN & SWITCHING INFRASTRUCTURE HANDOVER' },
    tags: { code: 'TAG-OSP-03', title: 'OPTICAL FIBER DROP & ODF IDENTIFICATION LABELS' },
    rack: { code: 'AUD-IDF-04', title: 'CPE, SERVER RACK & POWER INFRASTRUCTURE AUDIT SHEET' },
    diag: { code: 'DIA-RF-05', title: 'WI-FI COVERAGE & END-TO-END LATENCY TRIAGE REPORT' }
  };

  const meta = docTitles[currentTemplate];

  const headerBlock = `
    <div class="flex items-start justify-between border-b-2 border-slate-900 pb-3.5 mb-3.5">
      <div class="flex items-center gap-3.5">
        ${logoHtml}
        <div>
          <div class="text-base font-extrabold tracking-tight text-slate-900 uppercase">${escapeHtml(commonState.companyName)}</div>
          <div class="text-xs text-slate-600 font-medium">${escapeHtml(commonState.companySubtitle)}</div>
        </div>
      </div>
      <div class="text-right font-mono">
        <span class="inline-block bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-none">${meta.code}</span>
        <div class="text-xs font-bold text-slate-900 mt-1">REF: ${escapeHtml(commonState.woNumber)}</div>
        <div class="text-[11px] text-slate-600">DATE: ${escapeHtml(commonState.formDate)}</div>
      </div>
    </div>

    <div class="bg-slate-100 border border-slate-300 px-3.5 py-2 mb-3.5 flex items-center justify-between">
      <span class="text-xs font-extrabold tracking-wide text-slate-900 uppercase">${meta.title}</span>
      <span class="font-mono text-[10px] font-bold px-2 py-0.5 rounded-none ${opt.pass ? 'bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-rose-100 text-rose-800 border border-rose-300'}">${opt.label}</span>
    </div>

    <table class="w-full border-collapse border border-slate-300 text-xs mb-4">
      <tbody>
        <tr>
          <td class="border border-slate-300 bg-slate-50 font-bold text-slate-700 px-3 py-1.5 w-1/4">Subscriber / Client</td>
          <td class="border border-slate-300 font-semibold text-slate-900 px-3 py-1.5 w-3/4">${escapeHtml(commonState.clientName)}</td>
        </tr>
        <tr>
          <td class="border border-slate-300 bg-slate-50 font-bold text-slate-700 px-3 py-1.5">Installation Site</td>
          <td class="border border-slate-300 text-slate-800 px-3 py-1.5">${escapeHtml(commonState.siteAddress)}</td>
        </tr>
        <tr>
          <td class="border border-slate-300 bg-slate-50 font-bold text-slate-700 px-3 py-1.5">Commissioning Engineer</td>
          <td class="border border-slate-300 text-slate-800 px-3 py-1.5">${escapeHtml(commonState.techName)}</td>
        </tr>
      </tbody>
    </table>
  `;

  let bodyBlock = '';
  const d = templateState[currentTemplate];

  if (currentTemplate === 'handover') {
    bodyBlock = `
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">1. IPv4 WAN & Service Provisioning Parameters</div>
        <table class="w-full border-collapse border border-slate-300 text-xs">
          <tbody>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Circuit Type</td>
              <td class="border border-slate-300 px-3 py-1.5 w-1/4">${escapeHtml(d.circuitType)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Bandwidth Profile</td>
              <td class="border border-slate-300 font-bold px-3 py-1.5 w-1/4">${escapeHtml(d.bandwidth)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Usable WAN IP</td>
              <td class="border border-slate-300 font-mono font-semibold px-3 py-1.5">${escapeHtml(d.wanIp)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Subnet Mask</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.wanSubnet)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Default Gateway</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.wanGateway)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Service VLAN</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.vlanId)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Primary / Sec DNS</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5" colspan="3">${escapeHtml(d.dnsServers)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">2. Physical Layer & Optical Transceiver Telemetry</div>
        <table class="w-full border-collapse border border-slate-300 text-xs">
          <tbody>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Optical RX Power</td>
              <td class="border border-slate-300 font-mono font-bold px-3 py-1.5 w-1/4">${escapeHtml(d.rxPower)} dBm</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Optical TX Power</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5 w-1/4">${escapeHtml(d.txPower)} dBm</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">ONT / CPE Serial #</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5" colspan="3">${escapeHtml(d.ontSerial)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">3. Acceptance Testing & Field Remarks</div>
        <div class="border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800 leading-relaxed min-h-[50px]">${escapeHtml(d.remarks)}</div>
      </div>
    `;
  } else if (currentTemplate === 'lan') {
    bodyBlock = `
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">1. Switching & Layer-3 Addressing Matrix</div>
        <table class="w-full border-collapse border border-slate-300 text-xs">
          <tbody>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Switch Hardware</td>
              <td class="border border-slate-300 font-semibold px-3 py-1.5 w-1/4">${escapeHtml(d.switchModel)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Mgmt IP</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5 w-1/4">${escapeHtml(d.switchMgmtIp)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Primary LAN CIDR</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.lanSubnet)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">DHCP Pool</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.dhcpRange)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">VLAN Trunk Plan</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5" colspan="3">${escapeHtml(d.vlanList)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Uplink Interface</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.uplinkPort)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">PoE+ Budget</td>
              <td class="border border-slate-300 px-3 py-1.5">${escapeHtml(d.poeBudget)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Cabling Test</td>
              <td class="border border-slate-300 font-semibold px-3 py-1.5" colspan="3">${escapeHtml(d.cableCert)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">2. Spanning-Tree & Port Security Notes</div>
        <div class="border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800 leading-relaxed min-h-[50px]">${escapeHtml(d.notes)}</div>
      </div>
    `;
  } else if (currentTemplate === 'tags') {
    const count = parseInt(d.tagCount, 10) || 4;
    let cards = '';
    for (let i = 1; i <= count; i++) {
      cards += `
        <div class="border-2 border-dashed border-slate-800 p-3 rounded-none bg-slate-50 font-mono text-[11px] space-y-1">
          <div class="flex items-center justify-between border-b border-slate-400 pb-1">
            <span class="font-extrabold text-slate-900">${escapeHtml(commonState.woNumber)}</span>
            <span class="bg-slate-900 text-white px-1.5 py-0.5 text-[9px] font-bold">TAG #${i}</span>
          </div>
          <div><strong>CLIENT:</strong> ${escapeHtml(commonState.clientName)}</div>
          <div><strong>ODF:</strong> ${escapeHtml(d.odfPort)}</div>
          <div><strong>NAP / SPLITTER:</strong> ${escapeHtml(d.napBox)} (${escapeHtml(d.splitterRatio)})</div>
          <div><strong>CORE:</strong> ${escapeHtml(d.fiberCore)} | ${escapeHtml(d.dropLength)}</div>
          <div class="text-[10px] text-slate-600"><strong>PATH:</strong> ${escapeHtml(d.routePath)}</div>
        </div>
      `;
    }
    bodyBlock = `
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">Cut-Out Weatherproof Patch & Drop Cable Labels</div>
        <div class="grid grid-cols-2 gap-2.5">${cards}</div>
      </div>
    `;
  } else if (currentTemplate === 'rack') {
    bodyBlock = `
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">1. IDF / MDF Rack & Power Audit Checklist</div>
        <table class="w-full border-collapse border border-slate-300 text-xs">
          <tbody>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Facility Room</td>
              <td class="border border-slate-300 px-3 py-1.5 w-1/4">${escapeHtml(d.rackLocation)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">Rack ID</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5 w-1/4">${escapeHtml(d.cabinetId)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Edge Router / CPE</td>
              <td class="border border-slate-300 font-semibold px-3 py-1.5">${escapeHtml(d.routerModel)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Serial Number</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.routerSerial)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">UPS System</td>
              <td class="border border-slate-300 px-3 py-1.5">${escapeHtml(d.upsModel)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Battery Health</td>
              <td class="border border-slate-300 px-3 py-1.5">${escapeHtml(d.upsBattery)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Environment</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.tempC)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Grounding</td>
              <td class="border border-slate-300 px-3 py-1.5">${escapeHtml(d.groundingStatus)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">2. Physical Audit Findings</div>
        <div class="border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800 leading-relaxed min-h-[50px]">${escapeHtml(d.auditNotes)}</div>
      </div>
    `;
  } else if (currentTemplate === 'diag') {
    bodyBlock = `
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">1. Wireless RF & Latency Diagnostic Summary</div>
        <table class="w-full border-collapse border border-slate-300 text-xs">
          <tbody>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">2.4 GHz SSID</td>
              <td class="border border-slate-300 px-3 py-1.5 w-1/4">${escapeHtml(d.ssid24)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5 w-1/4">5 GHz SSID</td>
              <td class="border border-slate-300 px-3 py-1.5 w-1/4">${escapeHtml(d.ssid5)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Channel Plan</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.channelPlan)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">RSSI / SNR</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.rssiDbm)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Gateway RTT</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.gatewayPing)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">External DNS RTT</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.dnsPing)}</td>
            </tr>
            <tr>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Packet Loss</td>
              <td class="border border-slate-300 font-mono px-3 py-1.5">${escapeHtml(d.packetLoss)}</td>
              <td class="border border-slate-300 bg-slate-50 font-bold px-3 py-1.5">Throughput</td>
              <td class="border border-slate-300 font-mono font-bold px-3 py-1.5">${escapeHtml(d.speedDown)} Down / ${escapeHtml(d.speedUp)} Up</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="mb-4">
        <div class="text-[11px] font-extrabold uppercase tracking-wider text-slate-800 mb-1.5">2. Engineering Triage Verdict</div>
        <div class="border border-slate-300 bg-slate-50 p-3 text-xs text-slate-800 leading-relaxed min-h-[50px]">${escapeHtml(d.triageVerdict)}</div>
      </div>
    `;
  }

  const signatureImgHtml = sigDataUrl
    ? `<img src="${sigDataUrl}" alt="Client Signature" class="h-14 mx-auto object-contain">`
    : `<div class="h-14 flex items-center justify-center text-[10px] text-slate-400 italic">Awaiting Client Signature</div>`;

  const footerBlock = `
    <div class="mt-4 pt-3.5 border-t-2 border-slate-900 grid grid-cols-12 gap-4 items-end">
      <div class="col-span-5 text-center">
        <div class="h-14 flex items-end justify-center pb-1 font-sans italic text-sm text-slate-800">${escapeHtml(commonState.techName)}</div>
        <div class="border-t border-slate-800 pt-1 text-[10px] font-bold uppercase text-slate-700">Prepared & Tested By (Field Engineer)</div>
      </div>

      <div class="col-span-5 text-center">
        ${signatureImgHtml}
        <div class="border-t border-slate-800 pt-1 text-[10px] font-bold uppercase text-slate-700">Client Acceptance (Conforme / Signature)</div>
      </div>

      <div class="col-span-2 flex flex-col items-center justify-end">
        <div id="doc-qr-box" class="p-1 border border-slate-300 bg-white"></div>
        <span class="text-[8px] font-mono text-slate-500 mt-1">VERIFY ID</span>
      </div>
    </div>
  `;

  canvas.innerHTML = `
    <div class="a4-sheet-inner p-7 sm:p-9 flex-1 flex flex-col justify-between">
      <div>${headerBlock}${bodyBlock}</div>
      <div>${footerBlock}</div>
    </div>
  `;

  const qrBox = document.getElementById('doc-qr-box');
  if (qrBox && typeof QRCode !== 'undefined') {
    qrBox.innerHTML = '';
    new QRCode(qrBox, {
      text: `${commonState.woNumber}|${commonState.clientName}|${commonState.formDate}`,
      width: 54,
      height: 54,
      colorDark: '#0f172a',
      colorLight: '#ffffff'
    });
  }

  syncStudioColumnHeights();
}

/* ==========================================================================
   DIGITAL SIGNATURE PAD
   ========================================================================== */
function initSignaturePad() {
  const pad = document.getElementById('sig-pad');
  if (!pad) return;
  const ctx = pad.getContext('2d');
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0f172a';

  let drawing = false;

  function getCoords(e) {
    const rect = pad.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (pad.width / rect.width),
      y: (clientY - rect.top) * (pad.height / rect.height)
    };
  }

  function startDraw(e) {
    drawing = true;
    const pos = getCoords(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  function moveDraw(e) {
    if (!drawing) return;
    if (e.cancelable) e.preventDefault();
    const pos = getCoords(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }

  function endDraw() {
    if (!drawing) return;
    drawing = false;
    sigDataUrl = pad.toDataURL('image/png');
    renderDocumentPreview();
  }

  pad.addEventListener('mousedown', startDraw);
  pad.addEventListener('mousemove', moveDraw);
  window.addEventListener('mouseup', endDraw);

  pad.addEventListener('touchstart', startDraw, { passive: false });
  pad.addEventListener('touchmove', moveDraw, { passive: false });
  pad.addEventListener('touchend', endDraw);
}

function clearSignature() {
  const pad = document.getElementById('sig-pad');
  if (pad) {
    const ctx = pad.getContext('2d');
    ctx.clearRect(0, 0, pad.width, pad.height);
  }
  sigDataUrl = '';
  renderDocumentPreview();
}

/* ==========================================================================
   CLIENT SIGN-OFF LOCK & SINGLE-PAGE A4 PDF EXPORT
   ========================================================================== */
function toggleClientSignOffLock() {
  isClientLocked = !isClientLocked;
  const formInputs = document.querySelectorAll('#doc-form input, #doc-form textarea, #doc-form select');
  formInputs.forEach(el => {
    el.disabled = isClientLocked;
  });

  const icon = document.getElementById('client-lock-icon');
  const label = document.getElementById('client-lock-label');
  if (icon && label) {
    icon.className = isClientLocked ? 'fa-solid fa-lock text-emerald-400' : 'fa-solid fa-lock-open text-[#f26b3a]';
    label.textContent = isClientLocked ? 'Form Locked (Ready for Signature)' : 'Lock Form for Client Sign-Off';
  }
}

async function exportToPDF() {
  const sourceCanvas = document.getElementById('printable-canvas');
  if (!sourceCanvas || typeof html2pdf === 'undefined') {
    window.print();
    return;
  }

  const filename = `${commonState.woNumber || 'Handover'}_${currentTemplate.toUpperCase()}.pdf`;

  const exportHost = document.createElement('div');
  exportHost.style.position = 'fixed';
  exportHost.style.left = '0';
  exportHost.style.top = '0';
  exportHost.style.width = '734px';
  exportHost.style.background = '#ffffff';
  exportHost.style.zIndex = '-9999';
  exportHost.style.pointerEvents = 'none';

  const sheetClone = document.createElement('div');
  sheetClone.className = 'pdf-render-sheet';
  sheetClone.innerHTML = sourceCanvas.innerHTML;
  exportHost.appendChild(sheetClone);
  document.body.appendChild(exportHost);

  const clonedQrBox = sheetClone.querySelector('#doc-qr-box');
  if (clonedQrBox && typeof QRCode !== 'undefined') {
    clonedQrBox.innerHTML = '';
    new QRCode(clonedQrBox, {
      text: `${commonState.woNumber}|${commonState.clientName}|${commonState.formDate}`,
      width: 52,
      height: 52,
      colorDark: '#0f172a',
      colorLight: '#ffffff'
    });
  }

  await new Promise(resolve => setTimeout(resolve, 60));

  try {
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          x: 0,
          y: 0,
          scrollX: 0,
          scrollY: 0,
          windowWidth: 734,
          backgroundColor: '#ffffff'
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      })
      .from(sheetClone)
      .save();
  } finally {
    document.body.removeChild(exportHost);
  }
}

/* ==========================================================================
   35 REALISTIC CIRCUIT RECORDS GENERATOR & SERVER SYNC
   ========================================================================== */
function createSampleSignatureDataUrl(initials) {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 60;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(24, 42);
  ctx.bezierCurveTo(50, 12, 75, 48, 105, 24);
  ctx.bezierCurveTo(130, 10, 155, 46, 208, 28);
  ctx.stroke();
  ctx.font = 'italic 12px Helvetica, Arial, sans-serif';
  ctx.fillStyle = '#334155';
  ctx.fillText(`Signed: ${initials}`, 26, 54);
  return c.toDataURL('image/png');
}

function generateSampleRecordsList() {
  const sites = [
    { client: 'Batangas Logistics & Cold Storage Corp.', site: 'Diversion Road, Brgy. Alangilan, Batangas City', tmpl: 'handover', rx: '-18.4', signed: true, init: 'J. Reyes' },
    { client: 'Lima Technology Center — BPO Hub 2', site: 'Lot 14 Block 3, Malvar-Lipa, Batangas', tmpl: 'lan', rx: '-17.1', signed: true, init: 'M. Santos' },
    { client: 'Bauan Marine & Shipyard Terminal', site: 'Brgy. San Roque, Bauan, Batangas', tmpl: 'rack', rx: '-19.2', signed: true, init: 'A. Dizon' },
    { client: 'Lipa City Medical & Diagnostic Center', site: 'JP Laurel Highway, Marawoy, Lipa City', tmpl: 'handover', rx: '-16.8', signed: true, init: 'Dr. C. Cruz' },
    { client: 'Tanauan Industrial Park Manufacturing Inc.', site: 'Brgy. Pantay Bata, Tanauan City, Batangas', tmpl: 'diag', rx: '-20.1', signed: false, init: '' },
    { client: 'Santo Tomas Semiconductor Packaging Corp.', site: 'First Philippine Industrial Park, Sto. Tomas', tmpl: 'handover', rx: '-17.9', signed: true, init: 'R. Villanueva' },
    { client: 'Calamba Premier Business & IT Tower', site: 'Brgy. Real, Calamba City, Laguna', tmpl: 'lan', rx: '-18.0', signed: true, init: 'K. Bautista' },
    { client: 'Santa Rosa Laguna Data & Cloud Annex', site: 'Greenfield Parkway, Sta. Rosa, Laguna', tmpl: 'rack', rx: '-16.4', signed: true, init: 'L. Navarro' },
    { client: 'Tagaytay Highlands Convention Resort', site: 'Calabuso North, Tagaytay City, Cavite', tmpl: 'diag', rx: '-21.3', signed: true, init: 'P. Mendoza' },
    { client: 'Nasugbu Coastal Marina & Yacht Club', site: 'Brgy. Wawa, Nasugbu, Batangas', tmpl: 'tags', rx: '-22.4', signed: false, init: '' },
    { client: 'Lemery Agro-Industrial Cold Chain', site: 'Palico-Balayan Hwy, Lemery, Batangas', tmpl: 'handover', rx: '-19.8', signed: true, init: 'D. Ramos' },
    { client: 'Rosario Commercial & Retail Plaza', site: 'Gualberto Ave., Poblacion, Rosario, Batangas', tmpl: 'lan', rx: '-18.7', signed: true, init: 'E. Torres' },
    { client: 'San Pascual Petrochemical Depot Office', site: 'Brgy. San Antonio, San Pascual, Batangas', tmpl: 'rack', rx: '-17.5', signed: true, init: 'G. Castillo' },
    { client: 'Batangas Port Container Freight Station', site: 'Santa Clara Pier Zone, Batangas City', tmpl: 'handover', rx: '-18.1', signed: true, init: 'H. Aquino' },
    { client: 'Balayan Sugar & Bio-Energy Refinery', site: 'Brgy. Caloocan, Balayan, Batangas', tmpl: 'tags', rx: '-23.1', signed: false, init: '' },
    { client: 'Ibaan Poultry & Feedmill Operations', site: 'Brgy. Talaibon, Ibaan, Batangas', tmpl: 'handover', rx: '-20.6', signed: true, init: 'N. Mercado' },
    { client: 'San Jose Agri-Tech Cold Warehouse', site: 'Brgy. Banay-Banay, San Jose, Batangas', tmpl: 'diag', rx: '-19.0', signed: true, init: 'S. Flores' },
    { client: 'Taal Heritage Boutique Hotel & Spa', site: 'Calle Marcella Agoncillo, Taal, Batangas', tmpl: 'lan', rx: '-21.5', signed: false, init: '' },
    { client: 'Calaca Power Generation Admin Bldg', site: 'Brgy. San Rafael, Calaca, Batangas', tmpl: 'rack', rx: '-16.9', signed: true, init: 'T. Morales' },
    { client: 'Mabini Anilao Dive Resort & Marina', site: 'Brgy. Solo, Mabini, Batangas', tmpl: 'tags', rx: '-22.8', signed: true, init: 'V. Garcia' },
    { client: 'Lipa Aero-Park Aviation Training Hub', site: 'Fernando Airbase Corridor, Lipa City', tmpl: 'handover', rx: '-17.3', signed: true, init: 'Capt. B. Silva' },
    { client: 'Malvar Cyberzone Shared Services Center', site: 'Lima Commercial Estate, Malvar, Batangas', tmpl: 'lan', rx: '-18.2', signed: true, init: 'C. Pangilinan' },
    { client: 'Cuenca Mountain View Telecom Relay', site: 'Brgy. Dita, Cuenca, Batangas', tmpl: 'tags', rx: '-20.9', signed: false, init: '' },
    { client: 'Alitagtag Municipal Commercial Arcade', site: 'Poblacion East, Alitagtag, Batangas', tmpl: 'diag', rx: '-19.4', signed: true, init: 'F. Dimaculangan' },
    { client: 'Talisay Lakeside Resort & Convention', site: 'Brgy. Aya, Talisay, Batangas', tmpl: 'handover', rx: '-21.1', signed: false, init: '' },
    { client: 'Laurel Ridge Eco-Tourism Command Post', site: 'Brgy. Bugaan East, Laurel, Batangas', tmpl: 'rack', rx: '-22.0', signed: true, init: 'R. Manalo' },
    { client: 'Padre Garcia Livestock Auction Hub', site: 'Brgy. Poblacion, Padre Garcia, Batangas', tmpl: 'handover', rx: '-18.9', signed: true, init: 'J. Evangelista' },
    { client: 'San Juan Laiya Beachfront Hotel Wing', site: 'Brgy. Laiya-Aplaya, San Juan, Batangas', tmpl: 'diag', rx: '-23.4', signed: false, init: '' },
    { client: 'Lobo Coastal Marine Research Station', site: 'Brgy. Fabrica, Lobo, Batangas', tmpl: 'tags', rx: '-24.1', signed: true, init: 'Dr. M. Ocampo' },
    { client: 'Taysan Quarry & Cement Logistics HQ', site: 'Brgy. Mapulo, Taysan, Batangas', tmpl: 'rack', rx: '-19.7', signed: true, init: 'O. Magpantay' },
    { client: 'Batangas City Downtown Financial Tower', site: 'P. Burgos St., Poblacion, Batangas City', tmpl: 'lan', rx: '-16.5', signed: true, init: 'A. Soriano' },
    { client: 'Sto. Tomas North Gate Logistics Hub', site: 'Maharlika Highway, Sto. Tomas, Batangas', tmpl: 'handover', rx: '-17.6', signed: true, init: 'W. Hernandez' },
    { client: 'San Luis Coastal Cold Storage & Pier', site: 'Brgy. Poblacion, San Luis, Batangas', tmpl: 'handover', rx: '-18.8', signed: true, init: 'G. De Leon' },
    { client: 'Mataasnakahoy Lakeside IT Operations Center', site: 'Brgy. Nangkaan, Mataasnakahoy, Batangas', tmpl: 'lan', rx: '-19.1', signed: true, init: 'P. Macatangay' },
    { client: 'Tuy Western Batangas Agro-Supply Hub', site: 'Palico-Nasugbu Hwy, Tuy, Batangas', tmpl: 'rack', rx: '-20.4', signed: false, init: '' }
  ];

  const engineers = [
    'Engr. R. Mendoza (NOC Field Ops)',
    'Engr. K. Alcantara (OSP Fiber)',
    'Engr. J. Vergara (Enterprise Core)',
    'Engr. M. Macaraeg (RF & Access)'
  ];

  return sites.map((item, idx) => {
    const woNum = `WO-2026-${String(841 - idx).padStart(4, '0')}`;
    const d = new Date();
    d.setDate(d.getDate() - idx);
    const dateStr = d
      .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      .toUpperCase()
      .replace(/ /g, '-');

    const baseData = JSON.parse(JSON.stringify(templateState[item.tmpl]));
    if (item.tmpl === 'handover') {
      baseData.rxPower = item.rx;
      baseData.wanIp = `120.28.${142 + Math.floor(idx / 8)}.${18 + (idx % 8) * 4}`;
      baseData.wanGateway = `120.28.${142 + Math.floor(idx / 8)}.${17 + (idx % 8) * 4}`;
      baseData.vlanId = `VLAN ${412 + idx} (Enterprise DIA)`;
      baseData.ontSerial = `HWTC-${(994820 + idx * 17).toString(16).toUpperCase()}`;
    }

    return {
      id: `REC-SEED-${841 - idx}`,
      updatedAt: d.toISOString(),
      template: item.tmpl,
      common: {
        companyName: 'CALABARZON FIBER NETWORKS',
        companySubtitle: 'Enterprise Core & Access Provisioning',
        companyLogo: '',
        woNumber: woNum,
        formDate: dateStr,
        clientName: item.client,
        siteAddress: item.site,
        techName: engineers[idx % engineers.length]
      },
      data: baseData,
      signature: item.signed ? createSampleSignatureDataUrl(item.init) : ''
    };
  });
}

function seedSampleRecords(showAlert = false) {
  const samples = generateSampleRecordsList();
  const existingIds = new Set(savedRecords.map(r => r.id));
  let added = 0;

  samples.forEach(sample => {
    if (!existingIds.has(sample.id)) {
      savedRecords.push(sample);
      added++;
    }
  });

  userClearedRecords = false;
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedRecords));
  refreshRecordSelectors();
  renderVaultTable();
  renderHomeOverview();
  if (showAlert) {
    alert(`Loaded ${added} sample records (${savedRecords.length} total records in archive).`);
  }
}

function setBackendStatus(connected) {
  const dot = document.getElementById('backend-status-dot');
  const text = document.getElementById('backend-status-text');
  if (!dot || !text) return;
  if (connected) {
    dot.className = 'w-2 h-2 rounded-none bg-emerald-500';
    text.textContent = 'Express.js API Connected';
  } else {
    dot.className = 'w-2 h-2 rounded-none bg-amber-400';
    text.textContent = 'Offline Mode (Local Storage)';
  }
}

async function loadRecordsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/records`);
    if (!res.ok) throw new Error('API unavailable');
    const data = await res.json();
    savedRecords = Array.isArray(data) ? data : (data.records || []);
    setBackendStatus(true);
  } catch (err) {
    const local = localStorage.getItem(LOCAL_STORAGE_KEY);
    savedRecords = local ? JSON.parse(local) : [];
    setBackendStatus(false);
  }

  if (!userClearedRecords && savedRecords.length < 30) {
    const samples = generateSampleRecordsList();
    const existingIds = new Set(savedRecords.map(r => r.id));
    samples.forEach(sample => {
      if (!existingIds.has(sample.id)) {
        savedRecords.push(sample);
      }
    });
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedRecords));
  refreshRecordSelectors();
  renderHomeOverview();
}

async function saveCurrentWorkOrder() {
  const record = {
    id: editingRecordId || `REC-${Date.now()}`,
    updatedAt: new Date().toISOString(),
    template: currentTemplate,
    common: { ...commonState },
    data: { ...templateState[currentTemplate] },
    signature: sigDataUrl
  };

  const existingIdx = savedRecords.findIndex(r => r.id === record.id);
  if (existingIdx >= 0) {
    savedRecords[existingIdx] = record;
  } else {
    savedRecords.unshift(record);
  }
  editingRecordId = record.id;

  try {
    const res = await fetch(`${API_BASE}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record)
    });
    if (!res.ok) throw new Error('Failed API save');
    setBackendStatus(true);
  } catch (err) {
    setBackendStatus(false);
  }

  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedRecords));
  refreshRecordSelectors();
  renderHomeOverview();
  alert(`Record ${record.common.woNumber} saved successfully (${savedRecords.length} total records).`);
}

function createNewWorkOrder() {
  editingRecordId = null;
  const nextNum = 842 + savedRecords.length;
  commonState.woNumber = `WO-2026-${String(nextNum).padStart(4, '0')}`;
  commonState.formDate = getTodayFormatted();
  clearSignature();
  syncCommonInputsFromState();
  renderDocumentPreview();
}

function loadWorkOrderFromDB(id) {
  if (!id) return;
  const rec = savedRecords.find(r => r.id === id);
  if (!rec) return;

  editingRecordId = rec.id;
  commonState = { ...commonState, ...(rec.common || {}) };
  currentTemplate = rec.template || 'handover';
  templateState[currentTemplate] = { ...templateState[currentTemplate], ...(rec.data || {}) };
  sigDataUrl = rec.signature || '';

  syncCommonInputsFromState();
  selectTemplate(currentTemplate);
  switchScreen('studio');
}

async function deleteWorkOrder(id) {
  savedRecords = savedRecords.filter(r => r.id !== id);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedRecords));
  try {
    await fetch(`${API_BASE}/records/${id}`, { method: 'DELETE' });
  } catch (e) {}
  refreshRecordSelectors();
  renderVaultTable();
  renderHomeOverview();
}

async function clearAllWorkOrders() {
  if (!confirm('Delete all saved handover records?')) return;
  userClearedRecords = true;
  savedRecords = [];
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify([]));
  try {
    await fetch(`${API_BASE}/records`, { method: 'DELETE' });
  } catch (e) {}
  refreshRecordSelectors();
  renderVaultTable();
  renderHomeOverview();
}

function refreshRecordSelectors() {
  const countBadge = document.getElementById('nav-record-count');
  if (countBadge) countBadge.textContent = savedRecords.length;

  const vaultCount = document.getElementById('vault-total-count');
  if (vaultCount) vaultCount.textContent = savedRecords.length;

  const signedCount = savedRecords.filter(r => Boolean(r.signature)).length;
  const pendingCount = savedRecords.length - signedCount;

  const statTotal = document.getElementById('vault-stat-total');
  const statSigned = document.getElementById('vault-stat-signed');
  const statPending = document.getElementById('vault-stat-pending');
  if (statTotal) statTotal.textContent = savedRecords.length;
  if (statSigned) statSigned.textContent = signedCount;
  if (statPending) statPending.textContent = pendingCount;

  const select = document.getElementById('saved-wo-select');
  if (select) {
    select.innerHTML = `<option value="">-- Load Saved Circuit Record (${savedRecords.length}) --</option>` +
      savedRecords.map(r => {
        const c = r.common || r || {};
        return `<option value="${r.id}">${escapeHtml(c.woNumber || r.id)} — ${escapeHtml(c.clientName || 'Unnamed Client')}</option>`;
      }).join('');
  }
}

function renderVaultTable() {
  const tbody = document.getElementById('db-table-body');
  if (!tbody) return;

  const searchQ = (document.getElementById('vault-search-input')?.value || '').toLowerCase().trim();
  const typeFilter = document.getElementById('vault-type-filter')?.value || 'all';
  const statusFilter = document.getElementById('vault-status-filter')?.value || 'all';

  const filtered = savedRecords.filter(r => {
    const c = r.common || r || {};
    const tmpl = r.template || 'handover';
    const isSigned = Boolean(r.signature);

    if (typeFilter !== 'all' && tmpl !== typeFilter) return false;
    if (statusFilter === 'signed' && !isSigned) return false;
    if (statusFilter === 'pending' && isSigned) return false;

    if (searchQ) {
      const hay = `${c.woNumber || ''} ${c.clientName || ''} ${c.siteAddress || ''} ${c.techName || ''}`.toLowerCase();
      if (!hay.includes(searchQ)) return false;
    }
    return true;
  });

  const filteredLabel = document.getElementById('vault-filtered-label');
  if (filteredLabel) {
    filteredLabel.textContent = `Showing ${filtered.length} of ${savedRecords.length} records`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-10 text-center text-slate-200 bg-[#191a1c]">No matching circuit records found. Click "Load 35 Sample Records" or save a circuit in Handover Studio.</td></tr>`;
    return;
  }

  const typeNames = {
    handover: 'Circuit Handover',
    lan: 'LAN & Switch',
    tags: 'Fiber Drop Tag',
    rack: 'CPE / Rack Audit',
    diag: 'Wi-Fi & Ping Triage'
  };

  tbody.innerHTML = filtered.map(r => {
    const c = r.common || r || {};
    const tmpl = r.template || 'handover';
    return `
      <tr class="bg-[#191a1c] even:bg-[#202225] hover:bg-[#2b2e31] transition">
        <td class="py-3.5 px-4 font-bold text-[#ff8b60] whitespace-nowrap">
          ${escapeHtml(c.woNumber || r.id || 'N/A')}
          <span class="block text-[11px] font-normal text-slate-300 mt-0.5">${escapeHtml(c.formDate || '')}</span>
        </td>
        <td class="py-3.5 px-4">
          <div class="font-semibold text-white">${escapeHtml(c.clientName || 'Unnamed Client')}</div>
          <div class="text-[11px] text-slate-300 mt-0.5">${escapeHtml(c.siteAddress || '')}</div>
        </td>
        <td class="py-3.5 px-4 text-slate-200 text-xs">
          ${escapeHtml(c.techName || 'Unassigned')}
        </td>
        <td class="py-3.5 px-4 whitespace-nowrap">
          <span class="inline-block bg-[#0f1011] border border-[#3e4146] text-slate-100 px-2.5 py-1 text-xs font-medium">
            ${typeNames[tmpl] || tmpl}
          </span>
        </td>
        <td class="py-3.5 px-4 whitespace-nowrap">
          ${r.signature
            ? '<span class="inline-flex items-center gap-1.5 bg-emerald-950 text-emerald-300 border border-emerald-500/60 px-2.5 py-1 text-xs font-semibold"><span class="w-1.5 h-1.5 bg-emerald-400"></span>Signed (Conforme)</span>'
            : '<span class="inline-flex items-center gap-1.5 bg-amber-950 text-amber-300 border border-amber-500/60 px-2.5 py-1 text-xs font-semibold"><span class="w-1.5 h-1.5 bg-amber-400"></span>Pending Sign-Off</span>'}
        </td>
        <td class="py-3.5 px-4 text-right space-x-2 whitespace-nowrap">
          <button onclick="loadWorkOrderFromDB('${r.id}')" class="text-xs bg-[#f26b3a] hover:bg-[#e05a2b] text-white px-3.5 py-1.5 font-semibold cursor-pointer transition">Open</button>
          <button onclick="deleteWorkOrder('${r.id}')" class="text-xs bg-rose-950 hover:bg-rose-900 border border-rose-600/70 text-rose-200 px-2.5 py-1.5 cursor-pointer transition" title="Delete Record"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function exportDBToJSON() {
  const blob = new Blob([JSON.stringify(savedRecords, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `nethandover_backup_${getTodayFormatted()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importDBFromJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        savedRecords = imported;
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(savedRecords));
        refreshRecordSelectors();
        renderVaultTable();
        renderHomeOverview();
        alert(`Imported ${imported.length} records.`);
      }
    } catch (err) {
      alert('Invalid JSON file format.');
    }
  };
  reader.readAsText(file);
}

/* ==========================================================================
   ANALYTICS & CHARTS
   ========================================================================== */
function renderAnalyticsScreen() {
  const total = savedRecords.length;
  const signed = savedRecords.filter(r => Boolean(r.signature)).length;
  const pending = total - signed;

  const rxValues = [];
  const labels = [];
  const byTemplate = { handover: 0, lan: 0, tags: 0, rack: 0, diag: 0 };

  savedRecords.forEach(r => {
    if (byTemplate[r.template] !== undefined) byTemplate[r.template]++;
    const c = r.common || r || {};
    const d = r.data || {};
    if (r.template === 'handover' && d.rxPower) {
      const val = parseFloat(d.rxPower);
      if (!isNaN(val)) {
        rxValues.push(val);
        labels.push(c.woNumber || r.id);
      }
    }
  });

  const defaultRx = parseFloat(templateState.handover.rxPower) || -18.4;
  const meanRx = rxValues.length > 0
    ? (rxValues.reduce((a, b) => a + b, 0) / rxValues.length)
    : defaultRx;

  const headroom = (28.0 + meanRx).toFixed(1);
  const signoffRate = total > 0 ? Math.round((signed / total) * 100) : 0;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setText('kpi-total', total);
  setText('kpi-rx', `${meanRx.toFixed(1)} dBm`);
  setText('kpi-signed', signed);
  setText('kpi-pending', pending);
  setText('kpi-signed-mini', `${signed} docs`);
  setText('kpi-pending-mini', `${pending} docs`);
  setText('kpi-signoff-rate', `${signoffRate}%`);
  setText('kpi-signoff-sub', `${signed} of ${total} records signed\nwith client Conforme`);
  setText('kpi-headroom-val', `${headroom >= 0 ? '+' : ''}${headroom} dB`);

  const handoverCount = byTemplate.handover;
  const infraCount = byTemplate.lan + byTemplate.rack;
  const fieldCount = byTemplate.tags + byTemplate.diag;

  setText('kpi-handover-count', handoverCount);
  setText('kpi-lan-count', byTemplate.lan);
  setText('kpi-other-count', byTemplate.tags + byTemplate.rack + byTemplate.diag);
  setText('gauge-center-val', total);
  setText('legend-handover-val', handoverCount);
  setText('legend-infra-val', infraCount);
  setText('legend-field-val', fieldCount);

  const barSigned = document.getElementById('bar-signed-seg');
  const barPending = document.getElementById('bar-pending-seg');
  if (barSigned && barPending) {
    const sPct = total > 0 ? signoffRate : 50;
    const pPct = 100 - sPct;
    barSigned.style.width = `${Math.max(22, sPct)}%`;
    barPending.style.width = `${Math.max(22, pPct)}%`;
    setText('bar-signed-label', `Signed (${sPct}%)`);
    setText('bar-pending-label', `Pending (${pPct}%)`);
  }

  if (rxTrendChart) rxTrendChart.destroy();
  if (templateDistChart) templateDistChart.destroy();
  if (slaSparkChart) slaSparkChart.destroy();

  const ctx1 = document.getElementById('chart-rx-trend');
  if (ctx1 && typeof Chart !== 'undefined') {
    rxTrendChart = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: labels.length > 0 ? labels : [commonState.woNumber],
        datasets: [{
          label: 'Optical RX (dBm)',
          data: rxValues.length > 0 ? rxValues : [defaultRx],
          borderColor: '#f26b3a',
          backgroundColor: 'rgba(242, 107, 58, 0.16)',
          borderWidth: 2.5,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: '#f26b3a',
          pointRadius: 3.5,
          fill: true,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            suggestedMin: -26,
            suggestedMax: -12,
            grid: { color: '#2a2c30' },
            ticks: { color: '#cbd5e1', font: { family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', size: 10 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: '#cbd5e1', font: { family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', size: 10 } }
          }
        }
      }
    });
  }

  const ctx2 = document.getElementById('chart-template-dist');
  if (ctx2 && typeof Chart !== 'undefined') {
    const hasData = (handoverCount + infraCount + fieldCount) > 0;
    templateDistChart = new Chart(ctx2, {
      type: 'doughnut',
      data: {
        labels: ['Circuit Handover', 'LAN & Rack', 'Tags & Wi-Fi'],
        datasets: [{
          data: hasData ? [handoverCount, infraCount, fieldCount] : [1, 1, 1],
          backgroundColor: hasData ? ['#f26b3a', '#10b981', '#ff8b60'] : ['#2d3034', '#2d3034', '#2d3034'],
          borderWidth: 0,
          borderRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        rotation: -90,
        circumference: 180,
        cutout: '76%',
        plugins: { legend: { display: false } }
      }
    });
  }

  const ctx3 = document.getElementById('chart-sla-spark');
  if (ctx3 && typeof Chart !== 'undefined') {
    const marginSeries = rxValues.length > 0
      ? rxValues.map(v => Number((28 + v).toFixed(1)))
      : [Number(headroom)];
    const sparkLabels = labels.length > 0 ? labels : [commonState.woNumber];

    slaSparkChart = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: sparkLabels,
        datasets: [{
          label: 'Headroom (dB)',
          data: marginSeries,
          borderColor: '#ffffff',
          backgroundColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 2.5,
          pointBackgroundColor: '#ffffff',
          pointRadius: 3.5,
          fill: true,
          tension: 0.35
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            suggestedMin: 0,
            suggestedMax: 16,
            grid: { color: 'rgba(255,255,255,0.12)' },
            ticks: { color: 'rgba(255,255,255,0.85)', font: { family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', size: 10 } }
          },
          x: {
            grid: { display: false },
            ticks: { color: 'rgba(255,255,255,0.85)', font: { family: 'Helvetica, "Helvetica Neue", Arial, sans-serif', size: 10 } }
          }
        }
      }
    });
  }
}

function exportSummaryCSV() {
  const rows = [['WorkOrder', 'Date', 'Client', 'Template', 'Engineer', 'Signed']];
  savedRecords.forEach(r => {
    const c = r.common || r || {};
    rows.push([
      c.woNumber || r.id,
      c.formDate || '',
      `"${(c.clientName || '').replace(/"/g, '""')}"`,
      r.template || 'handover',
      `"${(c.techName || '').replace(/"/g, '""')}"`,
      r.signature ? 'YES' : 'NO'
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `network_audit_report_${getTodayFormatted()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   NETWORK FIELD CALCULATORS
   ========================================================================== */
function initCidrSelect() {
  const sel = document.getElementById('calc-cidr');
  if (!sel) return;
  let opts = '';
  for (let i = 8; i <= 32; i++) {
    opts += `<option value="${i}" ${i === 30 ? 'selected' : ''}>/${i}</option>`;
  }
  sel.innerHTML = opts;
}

function applySubnetPreset(ip, cidr) {
  const ipEl = document.getElementById('calc-ip');
  const cidrEl = document.getElementById('calc-cidr');
  if (ipEl) ipEl.value = ip;
  if (cidrEl) cidrEl.value = String(cidr);
  runSubnetCalc();
}

function runSubnetCalc() {
  const ipStr = (document.getElementById('calc-ip')?.value || '').trim();
  const cidr = parseInt(document.getElementById('calc-cidr')?.value || '30', 10);
  const parts = ipStr.split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return;

  const ipInt = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const maskInt = cidr === 0 ? 0 : ((0xffffffff << (32 - cidr)) >>> 0);
  const netInt = (ipInt & maskInt) >>> 0;
  const bcastInt = (netInt | (~maskInt >>> 0)) >>> 0;

  const toIp = (n) => `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`;
  const usableHosts = cidr >= 31 ? (cidr === 32 ? 1 : 2) : Math.pow(2, 32 - cidr) - 2;
  const firstUsable = cidr >= 31 ? toIp(netInt) : toIp(netInt + 1);
  const lastUsable = cidr >= 31 ? toIp(bcastInt) : toIp(bcastInt - 1);

  document.getElementById('res-mask').textContent = toIp(maskInt);
  document.getElementById('res-netid').textContent = toIp(netInt);
  document.getElementById('res-bcast').textContent = toIp(bcastInt);
  document.getElementById('res-range').textContent = `${firstUsable} - ${lastUsable}`;
  document.getElementById('res-hosts').textContent = `${usableHosts.toLocaleString()} Usable IPs`;

  const noteEl = document.getElementById('res-subnet-note');
  if (noteEl) {
    if (cidr === 30 || cidr === 31) noteEl.textContent = 'Point-to-point ISP WAN link (Gateway + CPE)';
    else if (cidr === 29) noteEl.textContent = 'Small enterprise static IP block (6 hosts)';
    else if (cidr === 24) noteEl.textContent = 'Standard Class-C local office subnet';
    else noteEl.textContent = `Custom /${cidr} IPv4 network block`;
  }
}

function stepFiberNumber(delta) {
  const input = document.getElementById('fiber-num-input');
  if (!input) return;
  let val = (parseInt(input.value, 10) || 1) + delta;
  if (val < 1) val = 1;
  if (val > 144) val = 144;
  input.value = val;
  runFiberColorLookup();
}

function runFiberColorLookup() {
  const colors = [
    { name: 'Blue', cls: 'bg-blue-500' },
    { name: 'Orange', cls: 'bg-orange-500' },
    { name: 'Green', cls: 'bg-emerald-500' },
    { name: 'Brown', cls: 'bg-amber-800' },
    { name: 'Slate', cls: 'bg-slate-400' },
    { name: 'White', cls: 'bg-white' },
    { name: 'Red', cls: 'bg-red-500' },
    { name: 'Black', cls: 'bg-zinc-900' },
    { name: 'Yellow', cls: 'bg-yellow-400' },
    { name: 'Violet', cls: 'bg-purple-500' },
    { name: 'Rose', cls: 'bg-pink-400' },
    { name: 'Aqua', cls: 'bg-cyan-400' }
  ];
  let n = parseInt(document.getElementById('fiber-num-input')?.value || '1', 10);
  if (isNaN(n) || n < 1) n = 1;
  if (n > 144) n = 144;

  const tubeIdx = Math.floor((n - 1) / 12) % 12;
  const strandIdx = (n - 1) % 12;
  const tube = colors[tubeIdx];
  const strand = colors[strandIdx];
  const rangeStart = tubeIdx * 12 + 1;
  const rangeEnd = rangeStart + 11;

  document.getElementById('tube-index-label').textContent = `Buffer Tube #${tubeIdx + 1} (Cores ${rangeStart}–${rangeEnd})`;
  document.getElementById('tube-color-name').textContent = `${tube.name} Tube`;
  document.getElementById('tube-swatch').className = `w-5 h-5 rounded-none ${tube.cls} border border-slate-300 shadow-2xs`;

  document.getElementById('strand-index-label').textContent = `Strand Position #${strandIdx + 1} inside Tube`;
  document.getElementById('strand-color-name').textContent = `${strand.name} Strand`;
  document.getElementById('strand-swatch').className = `w-5 h-5 rounded-none ${strand.cls} border border-slate-300 shadow-2xs`;
}

function calcLossBudget() {
  const km = parseFloat(document.getElementById('loss-length')?.value || '0') || 0;
  const splices = parseInt(document.getElementById('loss-splices')?.value || '0', 10) || 0;
  const conns = parseInt(document.getElementById('loss-connectors')?.value || '0', 10) || 0;

  const fiberLoss = km * 0.35;
  const spliceLoss = splices * 0.1;
  const connLoss = conns * 0.3;
  const totalLoss = fiberLoss + spliceLoss + connLoss;
  const remaining = Math.max(0, 28.0 - totalLoss);

  const valEl = document.getElementById('total-loss-val');
  if (valEl) valEl.textContent = `${totalLoss.toFixed(2)} dB`;

  const breakdownEl = document.getElementById('loss-formula-breakdown');
  if (breakdownEl) {
    breakdownEl.textContent = `${fiberLoss.toFixed(2)} dB (fiber) + ${spliceLoss.toFixed(2)} dB (splices) + ${connLoss.toFixed(2)} dB (connectors)`;
  }

  const remEl = document.getElementById('remaining-budget-text');
  if (remEl) {
    remEl.textContent = totalLoss <= 28.0
      ? `${remaining.toFixed(2)} dB margin remaining (Class B+ max: 28.0 dB)`
      : `Exceeds 28.0 dB Class B+ budget by ${(totalLoss - 28.0).toFixed(2)} dB`;
  }

  const badge = document.getElementById('loss-status-badge');
  if (badge) {
    if (totalLoss <= 28.0) {
      badge.textContent = 'PASS (WITHIN 28 dB CLASS B+ BUDGET)';
      badge.className = 'inline-block bg-white text-slate-900 px-3.5 py-1.5 rounded-none font-mono font-bold text-[11px] shadow-2xs';
    } else {
      badge.textContent = 'FAIL (EXCEEDS 28 dB LINK BUDGET)';
      badge.className = 'inline-block bg-rose-600 text-white px-3.5 py-1.5 rounded-none font-mono font-bold text-[11px] shadow-2xs';
    }
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}