'use strict';
let allConvs = [];
let sortMode = 'oldest';
let debugOn = false;
const gStats = { artifacts:0, tools:0 };

// ── FILE HANDLING ─────────────────────────────────────────
function handleDrop(e) { e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) processFile(f); }
function loadFile(e) { const f=e.target.files[0]; if(f) processFile(f); }

function processFile(file) {
  document.getElementById('uploadZone').style.display = 'none';
  document.getElementById('loading').classList.add('visible');
  const r = new FileReader();
  r.onload = ev => {
    try { parseData(window.DiacriticFix.fixExport(JSON.parse(ev.target.result))); }
       
    catch(err) {
      alert('Chyba při čtení JSON!\n' + err.message);
      document.getElementById('uploadZone').style.display='block';
      document.getElementById('loading').classList.remove('visible');
    }
  };
  r.readAsText(file, 'UTF-8');
}

// ── PARSE DATA ────────────────────────────────────────────
function parseData(data) {
  let convs = [];
  if (Array.isArray(data)) convs = data;
  else if (data.conversations) convs = data.conversations;
  else if (data.data?.conversations) convs = data.data.conversations;
  else { for(const k of Object.keys(data)) { if(Array.isArray(data[k])&&data[k].length) { convs=data[k]; break; } } }

  gStats.artifacts = 0; gStats.tools = 0;
  const debugLines = [];

  allConvs = convs.map((conv, idx) => {
    const rawMsgs = conv.chat_messages || conv.messages || [];
    const title = conv.name || conv.title || `Konverzace ${idx+1}`;
    const date = conv.created_at ? new Date(conv.created_at) : null;
    const summary = conv.summary || '';
    const accountUuid = conv.account ? (conv.account.uuid || '') : '';

    // Parsuj zprávy
    const messages = rawMsgs.map(msg => {
      const blocks = parseMsg(msg);
      const artCount = blocks.filter(b=>b.type==='artifact'||b.type==='code'||b.type==='display').length;
      const toolCount = blocks.filter(b=>b.type==='tool_use'||b.type==='tool_result').length;
      gStats.artifacts += artCount;
      gStats.tools += toolCount;
      return { ...msg, _blocks: blocks, _artCount: artCount, _toolCount: toolCount };
    });

    // Přílohy
    const attachments = [];
    rawMsgs.forEach(msg => {
      [...(msg.attachments||[]), ...(msg.files||[])].forEach(f => attachments.push({...f,_sender:msg.sender}));
    });

    const totalArt = messages.reduce((s,m)=>s+m._artCount,0);
    const totalTool = messages.reduce((s,m)=>s+m._toolCount,0);
    if(totalArt>0||totalTool>0) debugLines.push(`<strong>#${idx+1} "${title}"</strong> – 💻${totalArt} artifact/kód, 🔧${totalTool} tool calls`);

    return { title, messages, date, attachments, summary, accountUuid };
  });

  // Seřadit
  allConvs.sort((a,b)=>{ if(!a.date&&!b.date) return 0; if(!a.date) return 1; if(!b.date) return -1; return a.date-b.date; });

  document.getElementById('debugBox').innerHTML =
    `<strong>🔧 V4 FULL PARSER DEBUG:</strong><br>
    Konverzací: ${allConvs.length} | Zpráv: ${allConvs.reduce((s,c)=>s+c.messages.length,0)} | Artifactů: ${gStats.artifacts} | Tool calls: ${gStats.tools}<br><br>
    <strong>Konverzace s kódem/tools:</strong><br>${debugLines.join('<br>')||'Žádné nenalezeny'}`;

  document.getElementById('loading').classList.remove('visible');
  renderStats();
  renderConvs();
  document.getElementById('statsBar').classList.add('visible');
  document.getElementById('controls').classList.add('visible');
  document.getElementById('convsContainer').classList.add('visible');
}

// ── PARSOVÁNÍ JEDNÉ ZPRÁVY ────────────────────────────────
function parseMsg(msg) {
  const blocks = [];

  // content je ARRAY (primární formát Claude.ai exportu)
  if (Array.isArray(msg.content)) {
    for (const c of msg.content) {
      parseContentItem(c, blocks);
    }
  }

  // Fallback: msg.text (jednoduchý textový formát)
  if (blocks.length === 0 && msg.text) {
    const decoded = decodeUni(msg.text);
    parseIntoBlocks(decoded, blocks);
  }

  // Fallback: content string
  if (blocks.length === 0 && typeof msg.content === 'string') {
    parseIntoBlocks(decodeUni(msg.content), blocks);
  }

  return blocks.length > 0 ? blocks : [{ type:'text', content:'' }];
}

// ── PARSOVÁNÍ JEDNOHO CONTENT ITEMU ──────────────────────
function parseContentItem(c, blocks) {
  if (!c) return;
  const type = c.type || '';

  // TEXT content
  if (type === 'text') {
    const txt = decodeUni(c.text || '');
    if (txt.trim()) parseIntoBlocks(txt, blocks);
    return;
  }

  // TOOL_USE – admirál Claude volá nástroj (bash, create_file, str_replace atd.)
  if (type === 'tool_use') {
    const name = c.name || 'tool';
    let inputStr = '';
    if (c.input) {
      // Zobraz všechny klíče inputu přehledně
      const parts = [];
      for (const [k,v] of Object.entries(c.input)) {
        if (typeof v === 'string' && v.length > 0) {
          parts.push(`── ${k}:\n${v}`);
        } else if (v !== null && v !== undefined) {
          parts.push(`── ${k}: ${JSON.stringify(v)}`);
        }
      }
      inputStr = parts.join('\n\n');
    }
    const tsInfo = [];
    if (c.start_timestamp) tsInfo.push(`⏱ Start: ${new Date(c.start_timestamp).toLocaleString('cs-CZ')}`);
    if (c.stop_timestamp) tsInfo.push(`⏹ Stop: ${new Date(c.stop_timestamp).toLocaleString('cs-CZ')}`);
    const tsStr = tsInfo.length ? tsInfo.join(' | ') : '';
    blocks.push({ type:'tool_use', name, content: inputStr || JSON.stringify(c.input||{}, null, 2), timestamp: tsStr });
    return;
  }

  // TOOL_RESULT – výsledek nástroje
  if (type === 'tool_result') {
    let resultText = '';
    if (typeof c.content === 'string') {
      resultText = c.content;
    } else if (Array.isArray(c.content)) {
      resultText = c.content.map(x => {
        if (x.type==='text') return x.text||'';
        if (x.type==='document') return `[Dokument: ${x.name||''}]`;
        return JSON.stringify(x);
      }).join('\n');
    } else if (c.message) {
      resultText = c.message;
    }
    if (resultText.trim()) {
      blocks.push({ type:'tool_result', isError: c.is_error||false, content: decodeUni(resultText) });
    }
    return;
  }

  // DOCUMENT – přiložený soubor/dokument
  if (type === 'document') {
    const inner = c.content || {};
    let txt = '';
    if (inner.text) txt = inner.text;
    else if (inner.extracted_content) txt = inner.extracted_content;
    const name = inner.name || c.name || 'dokument';
    blocks.push({ type:'document', name, content: decodeUni(txt) });
    return;
  }

  // IMAGE – obrázek (jen info)
  if (type === 'image') {
    blocks.push({ type:'text', content:`[🖼️ Obrázek${c.source?.url ? ': '+c.source.url : ''}]` });
    return;
  }

  // DISPLAY_CONTENT – kód posaný přes display_content (ne backticks)
  if (c.display_content) {
    const dc = c.display_content;
    if (dc.code !== undefined && dc.code !== null) {
      blocks.push({ type:'code', lang: dc.language || dc.type || 'text', filename: dc.filename || '', content: String(dc.code) });
    } else if (dc.text) {
      parseIntoBlocks(decodeUni(dc.text), blocks);
    } else if (dc.json_block !== undefined) {
      blocks.push({ type:'code', lang:'json', content: typeof dc.json_block==='string' ? dc.json_block : JSON.stringify(dc.json_block,null,2) });
    } else if (dc.link) {
      const lk = dc.link;
      blocks.push({ type:'citation', title: lk.title||'', url: lk.url||'', source: lk.source||'', subtitles: lk.subtitles||'', iconUrl: lk.icon_url||'', resourceType: lk.resource_type||''});
    } else if (dc.table) {
      blocks.push({ type:'code', lang:'table', content: typeof dc.table==='string' ? dc.table : JSON.stringify(dc.table,null,2) });
    }
    return;
  }

  // CITATIONS – citace z web search
  if (c.citations && Array.isArray(c.citations) && c.citations.length > 0) {
    for (const cit of c.citations) {
      if (cit.details) {
        blocks.push({ type:'citation', url: cit.details.url||'', title: cit.details.url||'', source:'', subtitles:'', iconUrl:'', resourceType: cit.details.type||''});
      }
    }
    return;
  }
}

// ── PARSOVÁNÍ TEXTU DO BLOKŮ (backticks + antArtifact) ───
function parseIntoBlocks(text, blocks) {
  if (!text || !text.trim()) return;

  // Patterns v pořadí priority
  const patterns = [
    // antArtifact tagy
    { re: /<antArtifact\s+([^>]*)>([\s\S]*?)<\/antArtifact>/,
      fn: (m, attrs, content) => {
        const title = (attrs.match(/title="([^"]*)"/) || [])[1] || 'Artifact';
        const atype = (attrs.match(/type="([^"]*)"/) || [])[1] || '';
        const id =    (attrs.match(/identifier="([^"]*)"/) || [])[1] || '';
        return { type:'artifact', title, artifactType:atype, id, content:content.trim() };
      }
    },
    // antThinking – přeskočit
    { re: /<antThinking>[\s\S]*?<\/antThinking>/, fn: () => null },
    // display_content – kód v backticks s jazykem
    { re: /```([a-zA-Z0-9._\-+]*)\n([\s\S]*?)```/,
      fn: (m, lang, content) => ({ type:'code', lang: lang.trim()||'text', content:content.trim() })
    },
    // backticks bez jazyka
    { re: /```([\s\S]*?)```/,
      fn: (m, content) => ({ type:'code', lang:'text', content:content.trim() })
    },
  ];

  let remaining = text;
  let safety = 0;

  while (remaining.length > 0 && safety++ < 1000) {
    let earliest = Infinity, bestPat = null, bestMatch = null;

    for (const p of patterns) {
      const m = remaining.match(p.re);
      if (m && m.index < earliest) {
        earliest = m.index; bestPat = p; bestMatch = m;
      }
    }

    if (!bestPat) {
      if (remaining.trim()) blocks.push({ type:'text', content:remaining });
      break;
    }

    if (earliest > 0) {
      const before = remaining.substring(0, earliest);
      if (before.trim()) blocks.push({ type:'text', content:before });
    }

    const block = bestPat.fn(...bestMatch);
    if (block) blocks.push(block);

    remaining = remaining.substring(earliest + bestMatch[0].length);
  }
}

// ── DECODE UNICODE ────────────────────────────────────────
function decodeUni(str) {
  if (!str) return '';
  try {
    return str
      // Unicode escape: \u010d → č
      .replace(/\\u([0-9a-fA-F]{4})/g, (_,c) => String.fromCharCode(parseInt(c,16)))
      // Escape sekvence jako text: \n \r \t
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '')
      .replace(/\\t/g, '\t');
  } catch(e) { return str; }
}

// ── STATS ─────────────────────────────────────────────────
function renderStats() {
  const total = allConvs.length;
  const totalMsgs = allConvs.reduce((s,c)=>s+c.messages.length,0);
  const wd = allConvs.filter(c=>c.date);
  document.getElementById('sTotal').textContent = total.toLocaleString('cs-CZ');
  document.getElementById('sMessages').textContent = totalMsgs.toLocaleString('cs-CZ');
  document.getElementById('sArtifacts').textContent = gStats.artifacts.toLocaleString('cs-CZ');
  document.getElementById('sTools').textContent = gStats.tools.toLocaleString('cs-CZ');
  document.getElementById('sFirst').textContent = wd[0] ? fmtDate(wd[0].date) : '–';
  document.getElementById('sLast').textContent = wd[wd.length-1] ? fmtDate(wd[wd.length-1].date) : '–';
}

// ── RENDER CONVS ──────────────────────────────────────────
function renderConvs(filter='') {
  const list = document.getElementById('convList');
  const noR = document.getElementById('noResults');
  const lf = filter.toLowerCase();

  let filtered = allConvs.filter(c => {
    if (!lf) return true;
    if (c.title.toLowerCase().includes(lf)) return true;
    return c.messages.some(m => m._blocks && m._blocks.some(b=>b.content&&b.content.toLowerCase().includes(lf)));
  });

  if (sortMode==='newest') filtered=[...filtered].reverse();
  document.getElementById('rCount').textContent = filtered.length+' / '+allConvs.length+' konverzací';

  if (filtered.length===0) { list.innerHTML=''; noR.style.display='block'; return; }
  noR.style.display='none';

  list.innerHTML = filtered.map((conv,idx)=>{
    const isFirst = sortMode==='oldest'&&idx===0&&!filter;
    const totArt = conv.messages.reduce((s,m)=>s+m._artCount,0);
    const totTool = conv.messages.reduce((s,m)=>s+m._toolCount,0);

    return `
      <div class="conv-card ${isFirst?'first-ever':''}" id="cc-${idx}">
        <div class="conv-header" onclick="toggleConv(${idx})">
          <div class="conv-num">#${String(idx+1).padStart(4,'0')}</div>
          <div class="conv-title">${esc(conv.title||'– bez názvu –')}</div>
          ${isFirst?'<div class="badge badge-first">🏆 PRVNÍ MISE</div>':''}
          ${conv.attachments.length>0?`<div class="badge badge-attach">📎 ${conv.attachments.length}</div>`:''}
          ${totArt>0?`<div class="badge badge-code">💻 ${totArt}</div>`:''}
          ${totTool>0?`<div class="badge badge-tool">🔧 ${totTool}</div>`:''}
          <div class="conv-date">${conv.date?fmtDT(conv.date):'–'}</div>
          <div class="conv-msgs">${conv.messages.length} zpráv</div>
          <div class="conv-expand">▼</div>
        </div>
        <div class="conv-body" id="cb-${idx}">
          ${renderAttachBar(conv.attachments)}
          ${conv.summary ? `<div class="conv-summary">📋 <strong>SHRNUTÍ:</strong> ${esc(conv.summary)}</div>` : ''}
          <div class="messages-list">
            ${conv.messages.length>0
              ? conv.messages.map(m=>renderMsg(m)).join('')
              : '<div style="padding:18px;color:var(--text2);text-align:center;font-size:.82rem">Prázdná konverzace</div>'
            }
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── RENDER ATTACH BAR ─────────────────────────────────────
// DETEKCE JAZYKA Z PRIPONY
function detectLang(filename) {
  if (!filename) return 'text';
  const ext = filename.split('.').pop().toLowerCase();
  const map = {
    'js':'javascript','jsx':'javascript','ts':'typescript','tsx':'typescript',
    'py':'python','html':'html','htm':'html','css':'css','json':'json',
    'xml':'xml','sql':'sql','php':'php','java':'java','cs':'csharp',
    'cpp':'cpp','c':'c','h':'c','sh':'bash','bash':'bash','bat':'batch',
    'ps1':'powershell','md':'markdown','yml':'yaml','yaml':'yaml',
    'txt':'text','log':'text','ini':'ini','cfg':'ini','env':'bash',
    'vue':'vue','svelte':'svelte','rs':'rust','go':'go','rb':'ruby',
    'kt':'kotlin','swift':'swift','dart':'dart','r':'r'
  };
  return map[ext] || 'text';
}

function renderAttachBar(atts) {
  if (!atts||!atts.length) return '';
  const items = atts.map(a => renderAttachBlock(a)).join('');
  return '<div class="attach-bar-v5"><span class="attach-label-v5">\u{1F4CE} P\u0158\u00CDLOHY KONVERZACE</span>' + items + '</div>';
}

function renderAttachBlock(a) {
  const name = a.file_name || a.name || a.filename || 'soubor';
  const sz = a.file_size ? fmtSize(a.file_size) : '';
  const who = a._sender === 'human' ? '\u{1F464} V\u00CDCE ADMIR\u00C1L JI\u0158\u00CDK' : '\u{1F596} ADMIR\u00C1L CLAUDE';
  const lang = detectLang(name);
  const ftype = a.file_type || '';

  if (a.extracted_content) {
    const id = 'att_' + rndId();
    return '<div class="block-attach-code">' +
      '<div class="block-attach-header">' +
        '<div class="attach-meta">' +
          '<span class="attach-who">' + who + '</span>' +
          '<span class="attach-fname">\u{1F4CE} ' + esc(name) + '</span>' +
          (sz ? '<span class="attach-size">' + sz + '</span>' : '') +
          (ftype ? '<span class="attach-ftype">' + esc(ftype) + '</span>' : '') +
          '<span class="attach-lang">' + lang.toUpperCase() + '</span>' +
        '</div>' +
        '<button class="copy-btn" onclick="copyEl(\'' + id + '\')">\u{1F4CB} Kop\u00EDrovat</button>' +
      '</div>' +
      '<div class="block-attach-body"><pre id="' + id + '">' + esc(a.extracted_content) + '</pre></div>' +
    '</div>';
  } else {
    const av = a._sender === 'human' ? '\u{1F464}' : '\u{1F596}';
    return '<div class="attach-pill-v5">' + av + ' \u{1F4CE} <span>' + esc(name) + '</span>' + (sz ? '<span class="attach-size">' + sz + '</span>' : '') + '</div>';
  }
}

// ── RENDER ZPRÁVA ─────────────────────────────────────────
function renderMsg(msg) {
  const isHuman = msg.sender==='human'||msg.sender==='user';
  const cls = isHuman?'human':'assistant';
  const avatar = isHuman?'👤':'🖖';
  const role = isHuman?'VÍCE ADMIRÁL JIŘÍKU':'ADMIRÁL CLAUDE';
  const ts = msg.created_at?fmtDT(new Date(msg.created_at)):'';

  const blocksHtml = (msg._blocks||[]).map(renderBlock).join('');

  // Inline prilohy zpravy jako code bloky
  const allFiles = [...(msg.attachments||[]),...(msg.files||[])];
  const filesHtml = allFiles.length>0
    ? allFiles.map(f => renderAttachBlock({...f, _sender: msg.sender})).join('')
    : '';

  return `
    <div class="message ${cls}">
      <div class="msg-avatar">${avatar}</div>
      <div class="msg-content">
        <div class="msg-header">
          <div class="msg-role">${role}</div>
          ${ts?`<div class="msg-time">${ts}</div>`:''}
        </div>
        ${blocksHtml}
        ${filesHtml}
      </div>
    </div>`;
}

// ── RENDER BLOK ───────────────────────────────────────────
function renderBlock(b) {
  if (!b) return '';

  if (b.type==='text') {
    if (!b.content||!b.content.trim()) return '';
    return `<div class="block-text">${escHtml(b.content)}</div>`;
  }

  if (b.type==='code') {
    const id='c'+rndId();
    return `
      <div class="block-code">
        <div class="block-code-header">
          <div><span class="code-lang">💻 ${esc(b.lang||'text')}</span>${b.filename?` <span class="code-fname">${esc(b.filename)}</span>`:''}</div>
          <button class="copy-btn" onclick="copyEl('${id}')">📋 Kopírovat</button>
        </div>
        <div class="block-code-body"><pre id="${id}">${esc(b.content)}</pre></div>
      </div>`;
  }

  if (b.type==='artifact') {
    const id='a'+rndId();
    const tl = b.artifactType?b.artifactType.replace('application/','').replace('text/',''):'';
    return `
      <div class="block-artifact">
        <div class="block-artifact-header">
          <div><span class="art-title">📄 ${esc(b.title||'Artifact')}</span>${tl?` <span class="art-type">· ${esc(tl)}</span>`:''}</div>
          <button class="art-copy" onclick="copyEl('${id}')">📋 Kopírovat</button>
        </div>
        <div class="block-artifact-body"><pre id="${id}">${esc(b.content)}</pre></div>
      </div>`;
  }

  if (b.type==='tool_use') {
    const id='t'+rndId();
    return `
      <div class="block-tool">
        <div class="block-tool-header">
          <span class="tool-name">🔧 TOOL: ${esc(b.name)}</span>${b.timestamp ? `<span style="font-family:'Fira Code',monospace;font-size:.6rem;color:rgba(255,47,255,.6)">${esc(b.timestamp)}</span>` : ''}
          <button class="tool-copy" onclick="copyEl('${id}')">📋 Kopírovat</button>
        </div>
        <div class="block-tool-body"><pre id="${id}">${esc(b.content)}</pre></div>
      </div>`;
  }

  if (b.type==='tool_result') {
    const id='r'+rndId();
    return `
      <div class="block-result">
        <div class="block-result-header">
          <span class="result-label">${b.isError?'❌ TOOL ERROR':'✅ VÝSLEDEK NÁSTROJE'}</span>
        </div>
        <div class="block-result-body"><pre id="${id}">${esc(b.content)}</pre></div>
      </div>`;
  }

  if (b.type==='document') {
    return `
      <div class="extracted-content">
        📄 <strong>${esc(b.name)}</strong><br>
        ${b.content?escHtml(b.content):'(bez obsahu)'}
      </div>`;
  }

  if (b.type==='citation') {
    const hasTitle = b.title && b.title !== b.url;
    return `
      <div class="block-citation">
        <div class="citation-header">🔗 CITACE / ZDROJ</div>
        ${hasTitle ? `<div class="citation-title">${esc(b.title)}</div>` : ''}
        ${b.url ? `<div class="citation-url"><a href="${esc(b.url)}" target="_blank">${esc(b.url)}</a></div>` : ''}
        ${b.source ? `<div class="citation-source">📰 ${esc(b.source)}</div>` : ''}
        ${b.subtitles ? `<div class="citation-source">${esc(b.subtitles)}</div>` : ''}
        ${b.resourceType ? `<div class="citation-source">Typ: ${esc(b.resourceType)}</div>` : ''}
      </div>`;
  }

  if (b.type==='display') {
    const id='d'+rndId();
    return `
      <div class="block-display">
        <div class="block-display-header">
          <span class="disp-type">🟡 ${esc(b.lang||b.displayType||'display')}</span>
          <button class="disp-copy" onclick="copyEl('${id}')">📋 Kopírovat</button>
        </div>
        <div class="block-display-body"><pre id="${id}">${esc(b.content)}</pre></div>
      </div>`;
  }

  return '';
}

// ── HELPERS ───────────────────────────────────────────────
function rndId() { return Math.random().toString(36).substr(2,9); }
function copyEl(id) {
  const el=document.getElementById(id);
  if(!el) return;
  navigator.clipboard.writeText(el.textContent).then(()=>{
    const btn=el.closest('[class^="block-"]')?.querySelector('button');
    if(btn){const o=btn.textContent;btn.textContent='✅ Zkopírováno!';setTimeout(()=>btn.textContent=o,2000);}
  }).catch(()=>{});
}
function fmtDate(d){return d.toLocaleDateString('cs-CZ',{day:'2-digit',month:'2-digit',year:'numeric'});}
function fmtDT(d){return d.toLocaleDateString('cs-CZ',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}
function fmtSize(b){if(!b)return'';if(b<1024)return b+' B';if(b<1048576)return(b/1024).toFixed(1)+' KB';return(b/1048576).toFixed(1)+' MB';}
function esc(s){
  if(!s) return '';
  // Dekóduj unicode escape sekvence (\u010d → č atd.)
  let r = String(s).replace(/\\u([0-9a-fA-F]{4})/g, (_,c) => String.fromCharCode(parseInt(c,16)));
  // HTML escape
  r = r.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return r;
}

// escHtml – pro plain text bloky: navíc převede \n na <br>
function escHtml(s){
  if(!s) return '';
  let r = String(s).replace(/\\u([0-9a-fA-F]{4})/g, (_,c) => String.fromCharCode(parseInt(c,16)));
  r = r.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // Skutečné newlines i \n jako text → <br>
  r = r.replace(/\r\n|\r|\n/g,'<br>');
  r = r.replace(/\\n/g,'<br>');
  return r;
}
function toggleConv(i){const c=document.getElementById('cc-'+i);if(c)c.classList.toggle('expanded');}
function filterConvs(){renderConvs(document.getElementById('searchInput').value);}
function sortBy(t){
  sortMode=t;
  document.getElementById('btnOld').classList.toggle('active',t==='oldest');
  document.getElementById('btnNew').classList.toggle('active',t==='newest');
  renderConvs(document.getElementById('searchInput').value);
}
function toggleDebug(){debugOn=!debugOn;document.getElementById('debugPanel').classList.toggle('visible',debugOn);}
  // File input event listener - registrovan po nacteni scriptu
  document.getElementById('fileInput').addEventListener('change', function(e) {
    const f = e.target.files[0];
    if (f) processFile(f);
  });