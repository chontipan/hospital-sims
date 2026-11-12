(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const GRID_W = 18;
  const GRID_H = 14;
  const TILE_W = 64;
  const TILE_H = 32;

  let audioCtx = null;
  let soundEnabled = true;

  function playSfx(type) {
    if (!soundEnabled) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === 'select') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(740, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'good') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(620, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'alert') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(580, now);
        osc.frequency.setValueAtTime(440, now + 0.12);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'levelup') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.08);
        osc.frequency.setValueAtTime(784, now + 0.16);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      }
    } catch (_) {}
  }

  const camera = { x: 0, y: 0, zoom: 1, dragging: false, dragStartX: 0, dragStartY: 0, moved: false };

  const state = {
    speed: 1,
    scenario: 'lapchole',
    scenarioLabel: '🔍 Laparoscopic Cholecystectomy (LC)',
    minutes: 8 * 60,
    safety: 100,
    cured: 0,
    errorsAvoided: 0,
    errorsHappened: 0,
    teamstepps: { leadership: 80, communication: 80, monitoring: 80, support: 80 },
    selectedStaffId: 'surg1',
    hoverTile: null,
    nextPatientTimer: 3.0,
    tsEventTimer: 10.0,
    activeTsEvent: null,
    patientCounter: 1,
    targetMarkers: [],
    floatingTexts: [],
  };

  // OR Rooms
  const ROOMS = [
    { id: 'preop', name: 'Pre-Op / Sign-In', x1: 0, y1: 0, x2: 5, y2: 4, floor: '#e4f2f7', border: '#a8cedb' },
    { id: 'or1', name: 'ห้องผ่าตัด (OR-1 GenSx)', x1: 6, y1: 0, x2: 11, y2: 4, floor: '#eaf7f1', border: '#9fd6bc' },
    { id: 'blood', name: 'ธนาคารเลือด / Patho / ยา', x1: 12, y1: 0, x2: 17, y2: 4, floor: '#f2effa', border: '#c5b8e3' },
    { id: 'corridor', name: 'โถง Semi-Restricted OR', x1: 0, y1: 5, x2: 17, y2: 7, floor: '#f4f2ec', border: '#d9d1c3' },
    { id: 'sterile', name: 'Scrub & เตรียมเครื่องมือ', x1: 0, y1: 8, x2: 5, y2: 13, floor: '#eef6fb', border: '#adcce3' },
    { id: 'pacu', name: 'ห้องพักฟื้น (PACU)', x1: 6, y1: 8, x2: 11, y2: 13, floor: '#fdf2f6', border: '#e5bacb' },
    { id: 'lounge', name: 'OR Briefing & Lounge', x1: 12, y1: 8, x2: 17, y2: 13, floor: '#fff6e8', border: '#e6c999' },
  ];

  const blockedTiles = new Set();
  const wallEdges = [];

  function buildWalls() {
    for (let y = 0; y <= 4; y++) {
      if (y !== 2) {
        wallEdges.push({ x1: 6, y1: y, x2: 6, y2: y + 1 });
        wallEdges.push({ x1: 12, y1: y, x2: 12, y2: y + 1 });
      }
    }
    for (let x = 0; x < GRID_W; x++) {
      const isDoor = (x >= 2 && x <= 3) || (x >= 8 && x <= 9) || (x >= 14 && x <= 15);
      if (!isDoor) {
        wallEdges.push({ x1: x, y1: 5, x2: x + 1, y2: 5 });
        wallEdges.push({ x1: x, y1: 8, x2: x + 1, y2: 8 });
      }
    }
    for (let y = 8; y <= 13; y++) {
      if (y !== 10) {
        wallEdges.push({ x1: 6, y1: y, x2: 6, y2: y + 1 });
        wallEdges.push({ x1: 12, y1: y, x2: 12, y2: y + 1 });
      }
    }
  }
  buildWalls();

  function hasWallBetween(x1, y1, x2, y2) {
    if (x2 < 0 || y2 < 0 || x2 >= GRID_W || y2 >= GRID_H) return true;
    if (x1 !== x2 && y1 !== y2) {
      return (
        hasWallBetween(x1, y1, x2, y1) ||
        hasWallBetween(x1, y1, x1, y2) ||
        hasWallBetween(x2, y1, x2, y2) ||
        hasWallBetween(x1, y2, x2, y2)
      );
    }
    if (x2 === x1 + 1) return wallEdges.some((w) => w.x1 === x2 && w.x2 === x2 && w.y1 === y1 && w.y2 === y1 + 1);
    if (x2 === x1 - 1) return wallEdges.some((w) => w.x1 === x1 && w.x2 === x1 && w.y1 === y1 && w.y2 === y1 + 1);
    if (y2 === y1 + 1) return wallEdges.some((w) => w.y1 === y2 && w.y2 === y2 && w.x1 === x1 && w.x2 === x1 + 1);
    if (y2 === y1 - 1) return wallEdges.some((w) => w.y1 === y1 && w.y2 === y1 && w.x1 === x1 && w.x2 === x1 + 1);
    return false;
  }

  // Interactive OR Equipment
  const OBJECTS = [
    { id: 'signin_desk', name: 'จุด Sign-In & Site Marking', icon: '📋', gx: 3, gy: 2, standX: 3, standY: 3, patX: 2, patY: 2, color: '#38bdf8', role: 'circulating', actionText: 'ทำ WHO Sign-In & เช็คตำแหน่งผ่าตัด' },
    { id: 'waiting_bed_1', name: 'เตียงรอ Pre-Op', icon: '🛏️', gx: 1, gy: 1, standX: 1, standY: 2, color: '#94a3b8', isWaitSeat: true },
    { id: 'waiting_bed_2', name: 'เตียงรอ Pre-Op', icon: '🛏️', gx: 2, gy: 1, standX: 2, standY: 2, color: '#94a3b8', isWaitSeat: true },
    { id: 'or_table', name: 'เตียงผ่าตัด & Lap Tower', icon: '🔪', gx: 9, gy: 2, standX: 8, standY: 2, patX: 9, patY: 2, color: '#10b981', role: 'surgeon', actionText: 'ผ่าตัด GenSx & Time-Out' },
    { id: 'anesthesia_machine', name: 'เครื่องดมยาสลบ', icon: '💨', gx: 10, gy: 2, standX: 10, standY: 3, patX: 9, patY: 2, color: '#0ea5e9', role: 'anesthesia', actionText: 'ดมยาสลบ & เฝ้าระวัง Hemodynamics' },
    { id: 'blood_bank', name: 'คลังเลือด / Patho / Antibiotic', icon: '🩸', gx: 15, gy: 2, standX: 14, standY: 2, patX: 15, patY: 3, color: '#a78bfa', role: 'or_support', actionText: 'เตรียมเลือด PRC / ยาฆ่าเชื้อ / Patho' },
    { id: 'scrub_table', name: 'โต๊ะ Sterile & นับผ้าก๊อซ', icon: '✂️', gx: 2, gy: 11, standX: 2, standY: 10, patX: 3, patY: 10, color: '#0284c7', role: 'scrub', actionText: 'เตรียมเซ็ตผ่าตัด & Sponge Count' },
    { id: 'pacu_bed', name: 'เตียงพักฟื้น PACU (Sign-Out)', icon: '💓', gx: 9, gy: 11, standX: 8, standY: 11, patX: 9, patY: 11, color: '#f472b6', role: 'circulating', actionText: 'ทำ Sign-Out & ส่งต่อ PACU' },
    { id: 'coffee_machine', name: 'เครื่องชงกาแฟ OR', icon: '☕', gx: 15, gy: 9, standX: 15, standY: 10, color: '#b45309', need: 'energy', amount: 38, duration: 3.0, actionText: 'ดื่มกาแฟเติมพลัง' },
    { id: 'snack_fridge', name: 'ตู้ของว่าง', icon: '🥪', gx: 16, gy: 9, standX: 16, standY: 10, color: '#60a5fa', need: 'focus', amount: 40, duration: 3.2, actionText: 'ทานของว่างเพิ่มสมาธิ' },
    { id: 'sofa', name: 'โซฟาพักทีม OR', icon: '🛋️', gx: 14, gy: 12, standX: 14, standY: 11, color: '#f59e0b', need: 'calm', amount: 42, duration: 3.8, actionText: 'พักคลายเครียดระหว่างเคส' },
  ];

  OBJECTS.forEach((o) => {
    if (!o.isWaitSeat && o.id !== 'or_table' && o.id !== 'pacu_bed') {
      blockedTiles.add(`${o.gx},${o.gy}`);
    }
  });

  function findPath(sx, sy, tx, ty) {
    const startX = Math.max(0, Math.min(GRID_W - 1, Math.round(sx)));
    const startY = Math.max(0, Math.min(GRID_H - 1, Math.round(sy)));
    const endX = Math.max(0, Math.min(GRID_W - 1, Math.round(tx)));
    const endY = Math.max(0, Math.min(GRID_H - 1, Math.round(ty)));
    if (startX === endX && startY === endY) return [];

    const open = [{ x: startX, y: startY, g: 0, f: Math.abs(endX - startX) + Math.abs(endY - startY), parent: null }];
    const closed = new Set();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    let iter = 0;

    while (open.length > 0 && iter < 600) {
      iter++;
      open.sort((a, b) => a.f - b.f);
      const curr = open.shift();
      const key = `${curr.x},${curr.y}`;
      if (curr.x === endX && curr.y === endY) {
        const path = [];
        let node = curr;
        while (node.parent) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }
      closed.add(key);

      for (const [dx, dy] of dirs) {
        const nx = curr.x + dx;
        const ny = curr.y + dy;
        const nKey = `${nx},${ny}`;
        if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
        if (closed.has(nKey)) continue;
        if (blockedTiles.has(nKey) && !(nx === endX && ny === endY)) continue;
        if (hasWallBetween(curr.x, curr.y, nx, ny)) continue;

        const g = curr.g + (dx !== 0 && dy !== 0 ? 1.414 : 1);
        const h = Math.hypot(endX - nx, endY - ny);
        const existing = open.find((n) => n.x === nx && n.y === ny);
        if (!existing) open.push({ x: nx, y: ny, g, f: g + h, parent: curr });
        else if (g < existing.g) { existing.g = g; existing.f = g + h; existing.parent = curr; }
      }
    }
    return [{ x: endX, y: endY }];
  }

  // 5 OR-VIBE Professions for General Surgery
  const staffList = [
    {
      id: 'surg1', name: 'นพ. กวิน (GenSx)', role: 'surgeon', roleTitle: 'ศัลยแพทย์ทั่วไป', emoji: '👨‍⚕️',
      shirt: '#0f766e', coat: '#ccfbf1', hair: '#1e293b', gx: 8, gy: 3, level: 1, xp: 0,
      needs: { energy: 88, focus: 92, calm: 86, social: 82 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อมลงมือผ่าตัด GenSx', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'anes1', name: 'พญ. ณิชา (Anes)', role: 'anesthesia', roleTitle: 'วิสัญญีแพทย์', emoji: '💨',
      shirt: '#0284c7', coat: '#e0f2fe', hair: '#3b2f2f', gx: 10, gy: 3, level: 1, xp: 0,
      needs: { energy: 90, focus: 90, calm: 90, social: 84 },
      freeWill: true, state: 'idle', actionLabel: 'ดูแล Airway & สัญญาณชีพ', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'scrub1', name: 'พว. ฟ้า (Scrub)', role: 'scrub', roleTitle: 'พยาบาลส่งเครื่องมือ', emoji: '✂️',
      shirt: '#2563eb', coat: '#dbeafe', hair: '#4b3621', gx: 3, gy: 10, level: 1, xp: 0,
      needs: { energy: 90, focus: 92, calm: 88, social: 80 },
      freeWill: true, state: 'idle', actionLabel: 'เตรียม Sterile Set & นับก๊อซ', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'circ1', name: 'พว. ต้น (Circulating)', role: 'circulating', roleTitle: 'พยาบาลรอบนอก OR', emoji: '📋',
      shirt: '#db2777', coat: '#fce7f3', hair: '#2c1e1e', gx: 3, gy: 3, level: 1, xp: 0,
      needs: { energy: 88, focus: 88, calm: 90, social: 86 },
      freeWill: true, state: 'idle', actionLabel: 'คุม WHO Checklist & ประสานงาน', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'supp1', name: 'ทนพ. เตชินท์ (Lab/Blood)', role: 'or_support', roleTitle: 'คลังเลือด / Patho / ยา', emoji: '🩸',
      shirt: '#7c3aed', coat: '#f3e8ff', hair: '#1f2937', gx: 14, gy: 3, level: 1, xp: 0,
      needs: { energy: 92, focus: 90, calm: 88, social: 78 },
      freeWill: true, state: 'idle', actionLabel: 'เตรียมเลือด PRC & ชิ้นเนื้อ', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
  ];

  // GenSx Scenarios
  const SCENARIOS = {
    lapchole: {
      label: '🔍 Laparoscopic Cholecystectomy (LC)',
      spawnRate: 11,
      cases: [
        { diagnosis: 'Symptomatic Gallstone → Lap Chole', icon: '🔍', esi: 'yellow', steps: ['circulating', 'scrub', 'anesthesia', 'surgeon', 'circulating'], decay: 0.7 },
        { diagnosis: 'Acute Cholecystitis → Urgent LC', icon: '🩺', esi: 'yellow', steps: ['circulating', 'or_support', 'anesthesia', 'surgeon', 'or_support'], decay: 0.9 },
      ],
    },
    exlap: {
      label: '🚨 Exploratory Laparotomy (PPU / Trauma)',
      spawnRate: 9.5,
      cases: [
        { diagnosis: 'Perforated Peptic Ulcer (PPU) + Shock', icon: '🚨', esi: 'red', steps: ['circulating', 'or_support', 'anesthesia', 'scrub', 'surgeon'], decay: 1.45 },
        { diagnosis: 'Blunt Abdominal Trauma (Hemoperitoneum)', icon: '🩸', esi: 'red', steps: ['circulating', 'anesthesia', 'or_support', 'surgeon', 'scrub'], decay: 1.55 },
      ],
    },
    appendectomy: {
      label: '🩺 Appendectomy & Strangulated Hernia',
      spawnRate: 10,
      cases: [
        { diagnosis: 'Acute Appendicitis (Pre-op ATB)', icon: '🩺', esi: 'yellow', steps: ['circulating', 'or_support', 'anesthesia', 'surgeon', 'or_support'], decay: 0.85 },
        { diagnosis: 'Strangulated Inguinal Hernia', icon: '⚠️', esi: 'red', steps: ['circulating', 'anesthesia', 'scrub', 'surgeon', 'circulating'], decay: 1.3 },
      ],
    },
  };

  // WHO Checklist & GenSx Crisis Soft Skills Events
  const TEAMSTEPPS_EVENTS = [
    {
      title: '⏱️ WHO Time-Out (ก่อนลงมีด)',
      pillar: 'communication',
      q: 'ศัลยแพทย์กำลังจะลงมีดผ่าตัด LC แต่พยาบาล Circulating ทักว่ายังไม่ได้ให้ Prophylactic Antibiotic ควรทำอย่างไร?',
      options: [
        { text: 'หยุดรอให้ยาฆ่าเชื้อ + ทำ Time-Out ครบถ้วนก่อนลงมีด', ok: true, msg: 'ถูกต้อง! ลดความเสี่ยงแผลติดเชื้อ (SSI) ได้ตามมาตรฐาน WHO (+Communication)' },
        { text: 'ลงมีดไปก่อนเลย เดี๋ยวค่อยให้ยาระหว่างผ่าตัด', ok: false, msg: 'ผิดมาตรฐาน WHO Time-Out! เพิ่มความเสี่ยง SSI (-Safety)' },
      ],
    },
    {
      title: '✂️ Sign-Out: Sponge Count ขาด 1 ผืน!',
      pillar: 'support',
      q: 'ขณะกำลังจะเย็บปิดแผล Explore Lap พยาบาล Scrub แจ้งว่า "นับผ้าก๊อซขาด 1 ผืน!" ศัลยแพทย์ควรทำอย่างไร?',
      options: [
        { text: '🤝 รับฟังทันที หยุดปิดแผล สำรวจช่องท้อง + สั่ง X-Ray หาจนครบ', ok: true, msg: 'สุดยอด Mutual Support! ป้องกัน Retained Foreign Body ได้ 100% (+Safety)' },
        { text: 'มั่นใจว่าไม่น่ามีอะไรค้างอยู่ สั่งเย็บปิดแผลต่อ', ok: false, msg: 'อันตรายร้ายแรง! เสี่ยงลืมผ้าก๊อซในช่องท้องผู้ป่วย!' },
      ],
    },
    {
      title: '💨 Intra-op Crisis: BP ตกเหลือ 75/45!',
      pillar: 'monitoring',
      q: 'ระหว่างเลาะถุงน้ำดี วิสัญญีแพทย์ Call-Out แจ้งว่า "BP 75/45 มีเลือดออกมาก!" ทีมควรตอบสนองอย่างไร?',
      options: [
        { text: '👁️ หยุดจี้ชั่วคราว กดห้ามเลือด + สั่งขอเลือด PRC ด่วนแบบ Closed-Loop', ok: true, msg: 'เยี่ยม! Situation Monitoring & Closed-Loop ช่วยกู้วิกฤตทันกาล (+Monitoring)' },
        { text: 'รีบผ่าตัดต่อให้เสร็จเร็วๆ โดยไม่สื่อสารกับวิสัญญี', ok: false, msg: 'เสี่ยง Hemorrhagic Shock รุนแรง!' },
      ],
    },
    {
      title: '👑 Critical View of Safety (CVS)',
      pillar: 'leadership',
      q: 'ในการผ่าตัดส่องกล้องถุงน้ำดี (LC) กายวิภาคไม่ชัดเจน (Unclear Anatomy) ศัลยแพทย์ควรสื่อสารกับทีมอย่างไร?',
      options: [
        { text: 'หยุด 5 วินาที (Intra-op Time-Out) ปรึกษาทีม & พิจารณา Bail-out / Convert', ok: true, msg: 'ภาวะผู้นำยอดเยี่ยม! ป้องกัน Bile Duct Injury ได้ (+Leadership)' },
        { text: 'ตัดท่อที่สงสัยไปเลยเพื่อไม่ให้เสียเวลา OR', ok: false, msg: 'เสี่ยง Common Bile Duct Injury อย่างรุนแรง!' },
      ],
    },
  ];

  const PATIENT_NAMES = ['คุณสมชาย (52 ปี)', 'คุณมานี (46 ปี)', 'คุณปิติ (64 ปี)', 'คุณวิภา (39 ปี)', 'คุณณัฐ (58 ปี)', 'คุณอรุณ (71 ปี)'];
  const patients = [];

  function logEvent(text, type = 'info') {
    const el = document.getElementById('event-log');
    if (!el) return;
    const item = document.createElement('div');
    item.className = `log-entry ${type}`;
    const hh = String(Math.floor(state.minutes / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(state.minutes % 60)).padStart(2, '0');
    item.textContent = `[${hh}:${mm}] ${text}`;
    el.prepend(item);
    while (el.children.length > 25) el.removeChild(el.lastChild);
  }

  function addTeamStepps(pillar, delta) {
    state.teamstepps[pillar] = Math.max(20, Math.min(100, state.teamstepps[pillar] + delta));
  }

  function addStaffXp(staff, amount) {
    staff.xp += amount;
    if (staff.xp >= staff.level * 100) {
      staff.xp -= staff.level * 100;
      staff.level += 1;
      playSfx('levelup');
      state.floatingTexts.push({ gx: staff.gx, gy: staff.gy, text: `⭐ Lv.${staff.level}!`, color: '#f59e0b', life: 2.0 });
    }
  }

  function spawnPatient() {
    if (patients.length >= 6) return;
    const pool = SCENARIOS[state.scenario].cases;
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    const name = PATIENT_NAMES[Math.floor(Math.random() * PATIENT_NAMES.length)];
    const seatIdx = patients.length % 2;
    const waitSeat = seatIdx === 0 ? { x: 1, y: 2 } : { x: 2, y: 2 };
    const p = {
      id: `pat_${state.patientCounter++}`,
      name,
      diagnosis: tpl.diagnosis,
      icon: tpl.icon,
      esi: tpl.esi,
      steps: [...tpl.steps],
      stepIndex: 0,
      stability: 100,
      decay: tpl.decay,
      gx: 0,
      gy: 6,
      path: findPath(0, 6, waitSeat.x, waitSeat.y),
      state: 'walking_to_wait',
      assignedStaffId: null,
      bubble: { text: tpl.icon, timer: 4 },
      shirt: tpl.esi === 'red' ? '#ef4444' : tpl.esi === 'yellow' ? '#f59e0b' : '#10b981',
      walkPhase: 0,
    };
    patients.push(p);
    if (p.esi === 'red') {
      playSfx('alert');
      logEvent(`🚨 [OR ฉุกเฉิน] ${p.name}: ${p.diagnosis}`, 'urgent');
    } else {
      logEvent(`${p.name} เข้า Pre-Op (${p.diagnosis})`, 'info');
    }
    updateQueueUI();
  }

  function triggerTeamSteppsEvent() {
    if (state.activeTsEvent) return;
    const ev = TEAMSTEPPS_EVENTS[Math.floor(Math.random() * TEAMSTEPPS_EVENTS.length)];
    state.activeTsEvent = ev;
    const card = document.getElementById('teamstepps-card');
    document.getElementById('ts-card-title').textContent = ev.title;
    document.getElementById('ts-card-question').textContent = ev.q;
    const opts = document.getElementById('ts-card-options');
    opts.innerHTML = '';
    ev.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'consult-opt-btn';
      btn.textContent = opt.text;
      btn.onclick = () => {
        if (opt.ok) {
          addTeamStepps(ev.pillar, 8);
          state.safety = Math.min(100, state.safety + 4);
          state.errorsAvoided += 1;
          playSfx('good');
          logEvent(opt.msg, 'good');
        } else {
          addTeamStepps(ev.pillar, -10);
          state.safety = Math.max(10, state.safety - 10);
          state.errorsHappened += 1;
          playSfx('alert');
          logEvent(opt.msg, 'urgent');
        }
        state.activeTsEvent = null;
        card.classList.add('hidden');
        updateHUD();
      };
      opts.appendChild(btn);
    });
    card.classList.remove('hidden');
    playSfx('alert');
  }

  function startScenario(key) {
    state.scenario = key;
    state.scenarioLabel = SCENARIOS[key].label;
    document.getElementById('scenario-name-badge').textContent = state.scenarioLabel;
    patients.length = 0;
    state.cured = 0;
    state.safety = 100;
    state.errorsAvoided = 0;
    state.errorsHappened = 0;
    state.teamstepps = { leadership: 80, communication: 80, monitoring: 80, support: 80 };
    state.nextPatientTimer = 1.5;
    document.getElementById('event-log').innerHTML = '';
    logEvent(`เริ่มเคสผ่าตัด GenSx: ${state.scenarioLabel}`, 'good');
    spawnPatient();
    document.getElementById('scenario-modal').classList.add('hidden');
    updateHUD();
    updateQueueUI();
  }

  function openDebrief() {
    const avgTs = Math.round((state.teamstepps.leadership + state.teamstepps.communication + state.teamstepps.monitoring + state.teamstepps.support) / 4);
    const el = document.getElementById('debrief-content');
    el.innerHTML = `
      <div class="debrief-card">
        <h4>🛡️ Surgical Safety (ศัลยศาสตร์ทั่วไป)</h4>
        <p style="font-size:13px;line-height:1.7;margin:0;">
          • Surgical Safety Score: <strong>${Math.round(state.safety)}%</strong><br/>
          • ผ่าตัดสำเร็จปลอดภัย: <strong>${state.cured} เคส</strong><br/>
          • ป้องกัน Never Events (Sponge/Time-Out): <strong style="color:#10b981;">${state.errorsAvoided} ครั้ง</strong><br/>
          • ความเสี่ยง/ข้อผิดพลาดที่เกิด: <strong style="color:#ef4444;">${state.errorsHappened} ครั้ง</strong>
        </p>
      </div>
      <div class="debrief-card">
        <h4>🤝 สมรรถนะ TeamSTEPPS ใน OR (เฉลี่ย ${avgTs}/100)</h4>
        <p style="font-size:13px;line-height:1.7;margin:0;">
          • 👑 Leadership (OR Leader): <strong>${state.teamstepps.leadership}</strong><br/>
          • 📣 Communication (Time-Out/Closed-Loop): <strong>${state.teamstepps.communication}</strong><br/>
          • 👁️ Situation Monitoring (Hemodynamics): <strong>${state.teamstepps.monitoring}</strong><br/>
          • 🤝 Mutual Support (Sponge Count/CUS): <strong>${state.teamstepps.support}</strong>
        </p>
      </div>
    `;
    document.getElementById('debrief-modal').classList.remove('hidden');
  }

  // Iso math
  function gridToScreen(gx, gy) {
    const cx = canvas.width / 2 + camera.x;
    const cy = canvas.height / 2 + camera.y - 30;
    const isoX = (gx - gy) * (TILE_W / 2) * camera.zoom;
    const isoY = (gx + gy - (GRID_W + GRID_H) / 2 + 2) * (TILE_H / 2) * camera.zoom;
    return { x: cx + isoX, y: cy + isoY };
  }

  function screenToGrid(sx, sy) {
    const cx = canvas.width / 2 + camera.x;
    const cy = canvas.height / 2 + camera.y - 30;
    const dx = (sx - cx) / ((TILE_W / 2) * camera.zoom);
    const dy = (sy - cy) / ((TILE_H / 2) * camera.zoom) + ((GRID_W + GRID_H) / 2 - 2);
    return { gx: (dx + dy) / 2, gy: (dy - dx) / 2 };
  }

  function centerCamera() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = Math.min(1.12, Math.max(0.65, Math.min(canvas.width / 1280, canvas.height / 780)));
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (camera.zoom === 1 && camera.x === 0 && camera.y === 0) centerCamera();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function commandWalk(staff, tx, ty, label = 'กำลังเดินไป...') {
    staff.path = findPath(staff.gx, staff.gy, tx, ty);
    staff.state = 'walking';
    staff.actionLabel = label;
    staff.targetObject = null;
    staff.targetPatientId = null;
    state.targetMarkers.push({ gx: Math.round(tx), gy: Math.round(ty), life: 1.0, color: '#38c172' });
  }

  function commandUseObject(staff, obj) {
    const tx = obj.standX ?? obj.gx;
    const ty = obj.standY ?? obj.gy;
    staff.path = findPath(staff.gx, staff.gy, tx, ty);
    staff.state = 'walking_to_object';
    staff.targetObject = obj;
    staff.targetPatientId = null;
    staff.actionLabel = `กำลังเดินไป ${obj.name}`;
    state.targetMarkers.push({ gx: tx, gy: ty, life: 1.0, color: '#2d9cdb' });
  }

  function assignStaffToPatient(staff, patient) {
    const roleNeeded = patient.steps[patient.stepIndex];
    const station = OBJECTS.find((o) => o.role === roleNeeded);
    if (!station) return false;

    staff.targetPatientId = patient.id;
    staff.targetObject = station;
    staff.path = findPath(staff.gx, staff.gy, station.standX, station.standY);
    staff.state = 'walking_to_treat';
    staff.actionLabel = `${station.actionText} (${patient.name})`;

    patient.assignedStaffId = staff.id;
    patient.state = 'moving_to_station';
    patient.path = findPath(patient.gx, patient.gy, station.patX, station.patY);
    patient.bubble = { text: station.icon, timer: 4 };
    return true;
  }

  function triggerTeamHuddle() {
    const spots = [{ x: 8, y: 2 }, { x: 9, y: 3 }, { x: 10, y: 2 }, { x: 7, y: 3 }, { x: 8, y: 4 }];
    staffList.forEach((s, idx) => {
      const spot = spots[idx % spots.length];
      s.path = findPath(s.gx, s.gy, spot.x, spot.y);
      s.state = 'walking_to_huddle';
      s.actionLabel = 'รวมตัวทำ WHO Time-Out';
      s.targetObject = null;
      s.targetPatientId = null;
      s.bubble = { text: '⏱️ Time-Out!', timer: 3.5 };
    });
    addTeamStepps('communication', 4);
    addTeamStepps('leadership', 3);
    playSfx('select');
    logEvent('ทีม OR ทำ WHO Surgical Time-Out ร่วมกัน (+Communication & Leadership)', 'good');
  }

  function runStaffAI(staff) {
    if (!staff.freeWill || staff.state !== 'idle') return;

    if (staff.needs.energy < 28) {
      const coffee = OBJECTS.find((o) => o.need === 'energy');
      if (coffee) { commandUseObject(staff, coffee); return; }
    }
    if (staff.needs.focus < 28) {
      const fridge = OBJECTS.find((o) => o.need === 'focus');
      if (fridge) { commandUseObject(staff, fridge); return; }
    }
    if (staff.needs.calm < 30) {
      const sofa = OBJECTS.find((o) => o.need === 'calm');
      if (sofa) { commandUseObject(staff, sofa); return; }
    }

    const prioOrder = { red: 0, yellow: 1, green: 2 };
    const candidates = patients
      .filter((p) => (p.state === 'waiting' || p.state === 'walking_to_wait') && !p.assignedStaffId && p.steps[p.stepIndex] === staff.role)
      .sort((a, b) => prioOrder[a.esi] - prioOrder[b.esi]);

    if (candidates.length > 0) {
      assignStaffToPatient(staff, candidates[0]);
      return;
    }

    if (Math.random() < 0.015 && staff.needs.social < 74) {
      const peer = staffList.find((o) => o.id !== staff.id && o.state === 'idle');
      if (peer) {
        staff.path = findPath(staff.gx, staff.gy, Math.round(peer.gx), Math.round(peer.gy));
        staff.state = 'walking_to_chat';
        staff.chatPeerId = peer.id;
        staff.actionLabel = `สื่อสารเคสผ่าตัดกับ ${peer.name}`;
      }
    }
  }

  function moveEntityAlongPath(ent, dt, speed = 2.6) {
    if (!ent.path || ent.path.length === 0) return true;
    const next = ent.path[0];
    const dx = next.x - ent.gx;
    const dy = next.y - ent.gy;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;
    ent.walkPhase = (ent.walkPhase || 0) + dt * 11;
    if (dist <= step) {
      ent.gx = next.x;
      ent.gy = next.y;
      ent.path.shift();
      return ent.path.length === 0;
    }
    ent.gx += (dx / dist) * step;
    ent.gy += (dy / dist) * step;
    return false;
  }

  function updateSimulation(dt) {
    if (state.speed === 0) return;
    const simDt = dt * state.speed;

    state.minutes += simDt * 3.2;
    if (state.minutes >= 24 * 60) state.minutes -= 24 * 60;

    state.nextPatientTimer -= simDt;
    if (state.nextPatientTimer <= 0) {
      spawnPatient();
      state.nextPatientTimer = SCENARIOS[state.scenario].spawnRate + Math.random() * 4;
    }

    state.tsEventTimer -= simDt;
    if (state.tsEventTimer <= 0) {
      triggerTeamSteppsEvent();
      state.tsEventTimer = 18 + Math.random() * 10;
    }

    for (const staff of staffList) {
      staff.needs.energy = Math.max(20, staff.needs.energy - simDt * 0.16);
      staff.needs.focus = Math.max(20, staff.needs.focus - simDt * 0.15);
      staff.needs.calm = Math.max(25, staff.needs.calm - simDt * 0.12);
      staff.needs.social = Math.max(25, staff.needs.social - simDt * 0.14);

      const spdMult = 1 + (staff.level - 1) * 0.12;
      if (staff.bubble) {
        staff.bubble.timer -= simDt;
        if (staff.bubble.timer <= 0) staff.bubble = null;
      }

      if (staff.state === 'idle') {
        runStaffAI(staff);
      } else if (staff.state === 'walking') {
        if (moveEntityAlongPath(staff, simDt, 3.0 * spdMult)) {
          staff.state = 'idle';
          staff.actionLabel = 'พร้อมปฏิบัติงาน OR';
        }
      } else if (staff.state === 'walking_to_object') {
        if (moveEntityAlongPath(staff, simDt, 3.0 * spdMult)) {
          const obj = staff.targetObject;
          staff.state = 'using_object';
          staff.workTimer = obj.duration || 3.2;
          staff.actionLabel = obj.actionText;
          staff.bubble = { text: obj.icon, timer: staff.workTimer };
        }
      } else if (staff.state === 'using_object') {
        staff.workTimer -= simDt;
        if (staff.workTimer <= 0) {
          const obj = staff.targetObject;
          if (obj && obj.need) {
            staff.needs[obj.need] = Math.min(100, staff.needs[obj.need] + obj.amount);
            staff.needs.calm = Math.min(100, staff.needs.calm + 10);
            state.floatingTexts.push({ gx: staff.gx, gy: staff.gy, text: `+${obj.amount} ${obj.icon}`, color: '#10b981', life: 1.5 });
          }
          staff.state = 'idle';
          staff.targetObject = null;
          staff.actionLabel = 'พร้อมเข้า OR';
        }
      } else if (staff.state === 'walking_to_treat') {
        if (moveEntityAlongPath(staff, simDt, 3.3 * spdMult)) {
          const pat = patients.find((p) => p.id === staff.targetPatientId);
          if (!pat) {
            staff.state = 'idle';
          } else if (pat.state === 'in_treatment' || pat.path.length === 0) {
            staff.state = 'treating';
            staff.workTimer = Math.max(1.4, 2.4 / spdMult);
            staff.actionLabel = `${staff.targetObject.actionText}: ${pat.name}`;
            staff.bubble = { text: staff.targetObject.icon, timer: staff.workTimer };
            pat.state = 'in_treatment';
            pat.bubble = { text: '⏳', timer: staff.workTimer };
          } else {
            staff.actionLabel = `รอ ${pat.name} เข้าเตียง...`;
          }
        }
      } else if (staff.state === 'treating') {
        staff.workTimer -= simDt;
        if (staff.workTimer <= 0) {
          const pat = patients.find((p) => p.id === staff.targetPatientId);
          if (pat) {
            pat.stepIndex += 1;
            pat.assignedStaffId = null;
            pat.stability = Math.min(100, pat.stability + 15);
            staff.needs.energy = Math.max(5, staff.needs.energy - 4);
            addStaffXp(staff, 35);

            if (pat.stepIndex >= pat.steps.length) {
              pat.state = 'leaving';
              pat.path = findPath(pat.gx, pat.gy, 9, 12);
              pat.bubble = { text: '💚 Sign-Out ส่ง PACU!', timer: 5 };
              state.cured += 1;
              state.safety = Math.min(100, state.safety + 2);
              addTeamStepps('monitoring', 2);
              playSfx('good');
              state.floatingTexts.push({ gx: pat.gx, gy: pat.gy, text: '💚 ผ่าตัดสำเร็จ!', color: '#10b981', life: 2.0 });
              logEvent(`ผ่าตัด ${pat.name} สำเร็จ! Sponge Count ครบถ้วน → ส่ง PACU`, 'good');
            } else {
              const nextRole = pat.steps[pat.stepIndex];
              const roleNames = { surgeon: 'ศัลยแพทย์', anesthesia: 'วิสัญญี', scrub: 'Scrub', circulating: 'Circulating', or_support: 'เลือด/ยา/Patho' };
              pat.state = 'waiting';
              pat.bubble = { text: `ส่งต่อ ${roleNames[nextRole]}`, timer: 4 };
              logEvent(`Closed-Loop: ${staff.name} → ${roleNames[nextRole]} (${pat.name})`, 'info');
            }
          }
          staff.state = 'idle';
          staff.targetPatientId = null;
          staff.targetObject = null;
          staff.actionLabel = 'เสร็จสิ้นขั้นตอน';
          updateQueueUI();
        }
      } else if (staff.state === 'walking_to_chat') {
        if (moveEntityAlongPath(staff, simDt, 2.7 * spdMult)) {
          staff.needs.social = Math.min(100, staff.needs.social + 24);
          staff.bubble = { text: '💬 Closed-Loop!', timer: 3 };
          addTeamStepps('communication', 2);
          addStaffXp(staff, 15);
          const peer = staffList.find((o) => o.id === staff.chatPeerId);
          if (peer) {
            peer.needs.social = Math.min(100, peer.needs.social + 20);
            peer.bubble = { text: '💬 รับทราบ!', timer: 3 };
          }
          state.floatingTexts.push({ gx: staff.gx, gy: staff.gy, text: '📣 +OR Comms', color: '#2d9cdb', life: 1.4 });
          staff.state = 'idle';
          staff.actionLabel = 'สื่อสารกับทีม OR เรียบร้อย';
        }
      } else if (staff.state === 'walking_to_huddle') {
        if (moveEntityAlongPath(staff, simDt, 3.0 * spdMult)) {
          staff.needs.social = Math.min(100, staff.needs.social + 20);
          staff.needs.calm = Math.min(100, staff.needs.calm + 12);
          staff.bubble = { text: '✅ Time-Out ครบ!', timer: 3.5 };
          addStaffXp(staff, 20);
          staff.state = 'idle';
          staff.actionLabel = 'พร้อมลงมือผ่าตัด';
        }
      }
    }

    for (let i = patients.length - 1; i >= 0; i--) {
      const p = patients[i];
      if (p.bubble) {
        p.bubble.timer -= simDt;
        if (p.bubble.timer <= 0) p.bubble = null;
      }
      if (p.state !== 'leaving' && p.state !== 'in_treatment' && !state.activeTsEvent) {
        p.stability -= simDt * p.decay * 0.42;
        if (p.stability <= 0) {
          p.state = 'leaving';
          p.path = findPath(p.gx, p.gy, 9, 12);
          p.bubble = { text: '🚨 ย้าย ICU ด่วน!', timer: 4 };
          state.safety = Math.max(10, state.safety - 10);
          state.errorsHappened += 1;
          playSfx('alert');
          logEvent(`⚠️ ${p.name} สัญญาณชีพไม่คงที่! ต้องย้าย ICU (-Safety)`, 'urgent');
        }
      }

      if (p.state === 'walking_to_wait') {
        if (moveEntityAlongPath(p, simDt, p.esi === 'red' ? 3.1 : 2.3)) p.state = 'waiting';
      } else if (p.state === 'moving_to_station') {
        if (moveEntityAlongPath(p, simDt, p.esi === 'red' ? 3.3 : 2.5)) p.state = 'in_treatment';
      } else if (p.state === 'leaving') {
        if (moveEntityAlongPath(p, simDt, 2.7)) {
          patients.splice(i, 1);
          updateQueueUI();
        }
      }
    }

    for (let i = state.targetMarkers.length - 1; i >= 0; i--) {
      state.targetMarkers[i].life -= dt * 1.4;
      if (state.targetMarkers[i].life <= 0) state.targetMarkers.splice(i, 1);
    }
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      state.floatingTexts[i].life -= dt;
      if (state.floatingTexts[i].life <= 0) state.floatingTexts.splice(i, 1);
    }
  }

  function drawIsoTile(gx, gy, fill, stroke) {
    const p1 = gridToScreen(gx, gy);
    const p2 = gridToScreen(gx + 1, gy);
    const p3 = gridToScreen(gx + 1, gy + 1);
    const p4 = gridToScreen(gx, gy + 1);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawWalls() {
    const wallH = 26 * camera.zoom;
    ctx.lineWidth = 1.5;
    for (const w of wallEdges) {
      const a = gridToScreen(w.x1, w.y1);
      const b = gridToScreen(w.x2, w.y2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, b.y - wallH);
      ctx.lineTo(a.x, a.y - wallH);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.fill();
      ctx.strokeStyle = '#9bb2c2';
      ctx.stroke();
    }
  }

  function drawPlumbob(sx, sy, color) {
    const bob = Math.sin(performance.now() / 240) * 4 * camera.zoom;
    const w = 7 * camera.zoom;
    const h = 13 * camera.zoom;
    const cy = sy - 54 * camera.zoom + bob;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sx, cy - h);
    ctx.lineTo(sx + w, cy);
    ctx.lineTo(sx, cy + h);
    ctx.lineTo(sx - w, cy);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawCharacter(ent, isStaff) {
    const pos = gridToScreen(ent.gx + 0.5, ent.gy + 0.5);
    const z = camera.zoom;
    const walking = ent.path && ent.path.length > 0;
    const bob = walking ? Math.abs(Math.sin(ent.walkPhase || 0)) * 4 * z : 0;

    // Shadow
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 2 * z, 11 * z, 6 * z, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 35, 50, 0.22)';
    ctx.fill();

    if (isStaff && ent.id === state.selectedStaffId) {
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 2 * z, 16 * z, 9 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#38c172';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    const bodyY = pos.y - bob;

    // Legs
    const legSwing = walking ? Math.sin(ent.walkPhase || 0) * 3 * z : 0;
    ctx.fillStyle = isStaff ? '#0f4c5c' : '#94a3b8';
    ctx.fillRect(pos.x - 5 * z, bodyY - 6 * z + legSwing * 0.5, 4 * z, 7 * z);
    ctx.fillRect(pos.x + 1 * z, bodyY - 6 * z - legSwing * 0.5, 4 * z, 7 * z);

    // Surgical Gown / Scrubs or Patient Gown
    ctx.fillStyle = isStaff ? ent.shirt : '#bae6fd';
    ctx.strokeStyle = '#1e3a4c';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(pos.x - 8.5 * z, bodyY - 26 * z, 17 * z, 21 * z, 5 * z);
    ctx.fill();
    ctx.stroke();

    // Sterile gown apron for Surgeon & Scrub Nurse
    if (isStaff && (ent.role === 'surgeon' || ent.role === 'scrub')) {
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(pos.x - 6 * z, bodyY - 24 * z, 12 * z, 16 * z);
    }

    // Head
    ctx.beginPath();
    ctx.arc(pos.x, bodyY - 33 * z, 8.2 * z, 0, Math.PI * 2);
    ctx.fillStyle = '#fde2c8';
    ctx.fill();
    ctx.stroke();

    // Surgical Mask for OR Staff
    if (isStaff) {
      ctx.fillStyle = '#e0f2fe';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.roundRect(pos.x - 5.5 * z, bodyY - 32 * z, 11 * z, 5.5 * z, 2 * z);
      ctx.fill();
      ctx.stroke();
    }

    // Surgical Cap
    ctx.beginPath();
    ctx.arc(pos.x, bodyY - 35.5 * z, 8.6 * z, Math.PI, Math.PI * 2);
    ctx.fillStyle = isStaff ? ent.shirt : '#7dd3fc';
    ctx.fill();

    // Name tag
    ctx.font = `600 ${Math.max(10, Math.round(11 * z))}px Prompt, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isStaff ? '#0f293a' : '#475569';
    ctx.fillText(ent.name.split(' ')[0] + (isStaff ? ' ' + (ent.name.split(' ')[1] || '') : ''), pos.x, pos.y + 16 * z);

    if (!isStaff && ent.state !== 'leaving') {
      const bw = 30 * z;
      const bh = 4 * z;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(pos.x - bw / 2, bodyY - 48 * z, bw, bh);
      ctx.fillStyle = ent.stability > 60 ? '#10b981' : ent.stability > 30 ? '#f59e0b' : '#ef4444';
      ctx.fillRect(pos.x - bw / 2, bodyY - 48 * z, bw * Math.max(0, ent.stability / 100), bh);
    }

    if (isStaff && ent.id === state.selectedStaffId) {
      const avgNeed = (ent.needs.energy + ent.needs.focus + ent.needs.calm) / 3;
      const pColor = avgNeed > 60 ? '#38c172' : avgNeed > 35 ? '#f59e0b' : '#ef4444';
      drawPlumbob(pos.x, bodyY, pColor);
    }

    if (ent.bubble) {
      const bx = pos.x;
      const by = bodyY - (isStaff && ent.id === state.selectedStaffId ? 76 : 58) * z;
      ctx.font = `500 ${Math.max(10, Math.round(11 * z))}px Prompt, sans-serif`;
      const textW = ctx.measureText(ent.bubble.text).width + 14;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.strokeStyle = 'rgba(24, 65, 92, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(bx - textW / 2, by - 13, textW, 22, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#183042';
      ctx.fillText(ent.bubble.text, bx, by + 2);
    }
  }

  function drawObject(obj) {
    const pos = gridToScreen(obj.gx + 0.5, obj.gy + 0.5);
    const z = camera.zoom;
    ctx.save();

    if (obj.id === 'or_table') {
      // Operating Table base + mattress + sterile blue-green surgical drape
      ctx.fillStyle = '#475569';
      ctx.fillRect(pos.x - 8 * z, pos.y - 6 * z, 16 * z, 10 * z);
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(pos.x - 28 * z, pos.y - 18 * z, 56 * z, 20 * z, 5 * z);
      ctx.fill();
      // Sterile surgical drape
      ctx.fillStyle = '#0d9488';
      ctx.strokeStyle = '#99f6e4';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(pos.x - 24 * z, pos.y - 21 * z, 48 * z, 16 * z, 4 * z);
      ctx.fill();
      ctx.stroke();
      // Overhead Surgical Shadowless Lamp + light beam
      const lampY = pos.y - 62 * z;
      const grad = ctx.createRadialGradient(pos.x, pos.y - 12 * z, 4 * z, pos.x, pos.y - 12 * z, 38 * z);
      grad.addColorStop(0, 'rgba(254, 249, 195, 0.55)');
      grad.addColorStop(1, 'rgba(254, 249, 195, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - 12 * z, 36 * z, 18 * z, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2.5 * z;
      ctx.beginPath();
      ctx.moveTo(pos.x + 18 * z, lampY - 16 * z);
      ctx.lineTo(pos.x, lampY);
      ctx.stroke();

      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(pos.x, lampY, 18 * z, 9 * z, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.ellipse(pos.x, lampY + 2 * z, 11 * z, 5 * z, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (obj.id === 'anesthesia_machine') {
      // Anesthesia Workstation + live ECG/SpO2 monitor
      ctx.fillStyle = '#e2e8f0';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(pos.x - 15 * z, pos.y - 28 * z, 30 * z, 28 * z, 4 * z);
      ctx.fill();
      ctx.stroke();
      // Monitor screen
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(pos.x - 12 * z, pos.y - 44 * z, 24 * z, 16 * z);
      // Animated ECG line
      const phase = (performance.now() / 180) % 10;
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(pos.x - 10 * z, pos.y - 36 * z);
      ctx.lineTo(pos.x - 3 * z, pos.y - 36 * z);
      ctx.lineTo(pos.x - 1 * z, pos.y - 42 * z + (phase > 5 ? 2 * z : 0));
      ctx.lineTo(pos.x + 2 * z, pos.y - 31 * z);
      ctx.lineTo(pos.x + 5 * z, pos.y - 36 * z);
      ctx.lineTo(pos.x + 10 * z, pos.y - 36 * z);
      ctx.stroke();
      // Gas cylinders
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(pos.x - 11 * z, pos.y - 22 * z, 6 * z, 16 * z);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(pos.x - 3 * z, pos.y - 22 * z, 6 * z, 16 * z);
    } else if (obj.id === 'scrub_table') {
      // Sterile Mayo Stand + Surgical Instruments
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(pos.x - 2 * z, pos.y - 16 * z, 4 * z, 16 * z);
      ctx.fillStyle = '#0284c7';
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(pos.x - 20 * z, pos.y - 24 * z, 40 * z, 14 * z, 3 * z);
      ctx.fill();
      ctx.stroke();
      // Metallic instruments & gauze
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(pos.x - 14 * z, pos.y - 21 * z, 12 * z, 2 * z);
      ctx.fillRect(pos.x - 14 * z, pos.y - 17 * z, 10 * z, 2 * z);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pos.x + 4 * z, pos.y - 22 * z, 10 * z, 8 * z);
    } else if (obj.id === 'blood_bank') {
      // Blood Bank & Patho Fridge
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(pos.x - 15 * z, pos.y - 38 * z, 30 * z, 38 * z, 4 * z);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#dbeafe';
      ctx.fillRect(pos.x - 11 * z, pos.y - 34 * z, 22 * z, 20 * z);
      // Blood bags inside
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(pos.x - 8 * z, pos.y - 30 * z, 6 * z, 9 * z);
      ctx.fillRect(pos.x + 1 * z, pos.y - 30 * z, 6 * z, 9 * z);
    } else if (obj.id === 'pacu_bed' || obj.isWaitSeat) {
      // Hospital Bed / Stretcher
      ctx.fillStyle = '#cbd5e1';
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(pos.x - 22 * z, pos.y - 16 * z, 44 * z, 16 * z, 4 * z);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(pos.x - 18 * z, pos.y - 14 * z, 10 * z, 10 * z);
      ctx.fillStyle = obj.id === 'pacu_bed' ? '#f472b6' : '#93c5fd';
      ctx.fillRect(pos.x - 6 * z, pos.y - 14 * z, 24 * z, 11 * z);
    } else {
      // Other stations (Coffee, Fridge, Sofa, Sign-In Desk)
      ctx.fillStyle = obj.color;
      ctx.strokeStyle = 'rgba(15, 35, 50, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(pos.x - 16 * z, pos.y - 20 * z, 32 * z, 22 * z, 6 * z);
      ctx.fill();
      ctx.stroke();
      ctx.font = `${Math.round(18 * z)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obj.icon, pos.x, pos.y - 10 * z);
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const room = ROOMS.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) || ROOMS[3];
        drawIsoTile(x, y, room.floor, room.border);
      }
    }

    // Sterile Zone Border inside OR-1 (x: 7..10, y: 1..3)
    {
      const p1 = gridToScreen(7, 1);
      const p2 = gridToScreen(11, 1);
      const p3 = gridToScreen(11, 4);
      const p4 = gridToScreen(7, 4);
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#0d9488';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    if (state.hoverTile) {
      const { gx, gy } = state.hoverTile;
      if (gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H) {
        drawIsoTile(gx, gy, 'rgba(56, 193, 114, 0.25)', '#38c172');
      }
    }

    for (const m of state.targetMarkers) {
      const p = gridToScreen(m.gx + 0.5, m.gy + 0.5);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 14 * camera.zoom * m.life, 7 * camera.zoom * m.life, 0, 0, Math.PI * 2);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.save();
    ctx.font = `600 ${Math.round(12 * camera.zoom)}px Prompt, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(24, 48, 66, 0.48)';
    for (const r of ROOMS) {
      const mid = gridToScreen((r.x1 + r.x2 + 1) / 2, (r.y1 + r.y2 + 1) / 2);
      ctx.fillText(r.name, mid.x, mid.y);
    }
    ctx.restore();

    drawWalls();

    const drawables = [];
    OBJECTS.forEach((o) => drawables.push({ depth: o.gx + o.gy, kind: 'obj', data: o }));
    staffList.forEach((s) => drawables.push({ depth: s.gx + s.gy + 0.05, kind: 'staff', data: s }));
    patients.forEach((p) => drawables.push({ depth: p.gx + p.gy + 0.04, kind: 'patient', data: p }));
    drawables.sort((a, b) => a.depth - b.depth);

    for (const d of drawables) {
      if (d.kind === 'obj') drawObject(d.data);
      else if (d.kind === 'staff') drawCharacter(d.data, true);
      else drawCharacter(d.data, false);
    }

    ctx.save();
    ctx.font = `700 ${Math.round(13 * camera.zoom)}px Prompt, sans-serif`;
    ctx.textAlign = 'center';
    for (const ft of state.floatingTexts) {
      const p = gridToScreen(ft.gx + 0.5, ft.gy + 0.5);
      ctx.globalAlpha = Math.min(1, ft.life);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, p.x, p.y - (70 - ft.life * 20) * camera.zoom);
    }
    ctx.restore();
  }

  function renderRoster() {
    const bar = document.getElementById('staff-roster');
    bar.innerHTML = '';
    for (const s of staffList) {
      const btn = document.createElement('button');
      btn.className = `roster-btn ${s.id === state.selectedStaffId ? 'active' : ''}`;
      btn.innerHTML = `
        <span class="roster-dot" style="background:${s.state === 'idle' ? '#38c172' : '#2d9cdb'}"></span>
        <span class="roster-emoji">${s.emoji}</span>
        <span class="roster-name">${s.name.split(' ')[1] || s.name}</span>
      `;
      btn.onclick = () => {
        state.selectedStaffId = s.id;
        playSfx('select');
        updateHUD();
      };
      bar.appendChild(btn);
    }
  }

  function updateQueueUI() {
    const list = document.getElementById('patient-queue-list');
    if (!list) return;
    if (patients.length === 0) {
      list.innerHTML = '<div style="font-size:12px;color:#64748b;">ยังไม่มีเคสในตารางผ่าตัด...</div>';
      return;
    }
    const roleIcons = { surgeon: '🔪', anesthesia: '💨', scrub: '✂️', circulating: '📋', or_support: '🩸' };
    list.innerHTML = patients
      .map((p) => {
        const stepsHtml = p.steps
          .map((st, idx) => {
            const style = idx < p.stepIndex ? 'opacity:0.4;text-decoration:line-through;' : idx === p.stepIndex ? 'font-weight:700;background:#e0f2fe;border-radius:4px;padding:0 3px;' : 'opacity:0.75;';
            return `<span style="${style}">${roleIcons[st]}</span>`;
          })
          .join(' → ');
        const stabColor = p.stability > 60 ? '#10b981' : p.stability > 30 ? '#f59e0b' : '#ef4444';
        return `
          <div class="queue-item esi-${p.esi}" data-pat="${p.id}" style="cursor:pointer;" title="คลิกเพื่อส่งบุคลากรที่รับผิดชอบไปรับเคสนี้ทันที">
            <div class="queue-item-top">
              <span>${p.icon} ${p.name}</span>
              <span style="color:${stabColor};">💓 ${Math.max(0, Math.round(p.stability))}%</span>
            </div>
            <div class="queue-item-sub">${p.diagnosis}</div>
            <div class="queue-item-sub">${stepsHtml}</div>
          </div>
        `;
      })
      .join('');

    list.querySelectorAll('.queue-item').forEach((el) => {
      el.addEventListener('click', () => {
        const pat = patients.find((p) => p.id === el.dataset.pat);
        if (!pat || pat.assignedStaffId || pat.state === 'leaving') return;
        const neededRole = pat.steps[pat.stepIndex];
        const staff = staffList.find((s) => s.role === neededRole && s.state === 'idle') || staffList.find((s) => s.role === neededRole);
        if (staff) {
          state.selectedStaffId = staff.id;
          assignStaffToPatient(staff, pat);
          playSfx('select');
          updateHUD();
        }
      });
    });
  }

  function setNeedBar(id, val) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = `${Math.round(val)}%`;
    el.style.backgroundColor = val > 60 ? '#38c172' : val > 32 ? '#f59e0b' : '#ef4444';
  }

  function updateHUD() {
    const avgTs = Math.round((state.teamstepps.leadership + state.teamstepps.communication + state.teamstepps.monitoring + state.teamstepps.support) / 4);
    document.getElementById('stat-safety').textContent = `${Math.round(state.safety)}%`;
    document.getElementById('stat-cured').textContent = `${state.cured} เคส`;
    document.getElementById('stat-teamstepps').textContent = `${avgTs}`;
    document.getElementById('stat-patients').textContent = `${patients.length} ราย`;

    document.getElementById('ts-lead').textContent = state.teamstepps.leadership;
    document.getElementById('ts-comm').textContent = state.teamstepps.communication;
    document.getElementById('ts-sit').textContent = state.teamstepps.monitoring;
    document.getElementById('ts-sup').textContent = state.teamstepps.support;

    const hh = String(Math.floor(state.minutes / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(state.minutes % 60)).padStart(2, '0');
    document.getElementById('game-time').textContent = `${hh}:${mm}`;

    const staff = staffList.find((s) => s.id === state.selectedStaffId);
    if (staff) {
      document.getElementById('selected-avatar').textContent = staff.emoji;
      document.getElementById('selected-role').textContent = staff.roleTitle;
      document.getElementById('selected-name').textContent = staff.name;
      document.getElementById('selected-level').textContent = `Lv.${staff.level}`;
      document.getElementById('selected-action').textContent = staff.actionLabel;
      document.getElementById('toggle-freewill').checked = staff.freeWill;

      setNeedBar('need-energy', staff.needs.energy);
      setNeedBar('need-focus', staff.needs.focus);
      setNeedBar('need-calm', staff.needs.calm);
      setNeedBar('need-social', staff.needs.social);

      const cmds = document.getElementById('sim-quick-cmds');
      const station = OBJECTS.find((o) => o.role === staff.role);
      cmds.innerHTML = '';
      if (station) {
        const b = document.createElement('button');
        b.className = 'quick-cmd-btn';
        b.textContent = `${station.icon} ไปจุดปฏิบัติงาน`;
        b.onclick = () => commandUseObject(staff, station);
        cmds.appendChild(b);
      }
      const timeoutBtn = document.createElement('button');
      timeoutBtn.className = 'quick-cmd-btn';
      timeoutBtn.textContent = '⏱️ Call-Out / Time-Out';
      timeoutBtn.onclick = () => {
        staff.bubble = { text: '⏱️ Time-Out พร้อม!', timer: 3 };
        addTeamStepps('communication', 2);
        playSfx('select');
        logEvent(`${staff.name} ทำ Call-Out ยืนยันความพร้อม OR`, 'info');
      };
      cmds.appendChild(timeoutBtn);

      ['coffee_machine', 'sofa'].forEach((oid) => {
        const obj = OBJECTS.find((o) => o.id === oid);
        if (!obj) return;
        const b = document.createElement('button');
        b.className = 'quick-cmd-btn';
        b.textContent = `${obj.icon} ${obj.name}`;
        b.onclick = () => commandUseObject(staff, obj);
        cmds.appendChild(b);
      });
    }
    renderRoster();
  }

  canvas.addEventListener('mousedown', (e) => {
    camera.dragging = true;
    camera.dragStartX = e.clientX;
    camera.dragStartY = e.clientY;
    camera.moved = false;
  });

  window.addEventListener('mousemove', (e) => {
    if (camera.dragging) {
      const dx = e.clientX - camera.dragStartX;
      const dy = e.clientY - camera.dragStartY;
      if (Math.hypot(dx, dy) > 4) camera.moved = true;
      camera.x += dx;
      camera.y += dy;
      camera.dragStartX = e.clientX;
      camera.dragStartY = e.clientY;
    }

    const g = screenToGrid(e.clientX, e.clientY);
    const gx = Math.floor(g.gx);
    const gy = Math.floor(g.gy);
    state.hoverTile = { gx, gy };

    const tooltip = document.getElementById('hover-tooltip');
    const hoveredObj = OBJECTS.find((o) => o.gx === gx && o.gy === gy);
    if (hoveredObj) {
      tooltip.textContent = `${hoveredObj.icon} ${hoveredObj.name} (คลิกเพื่อสั่งใช้งาน)`;
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
      tooltip.classList.remove('hidden');
    } else {
      tooltip.classList.add('hidden');
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!camera.dragging) return;
    camera.dragging = false;
    if (camera.moved || e.target !== canvas) return;

    const g = screenToGrid(e.clientX, e.clientY);
    const gx = Math.floor(g.gx);
    const gy = Math.floor(g.gy);

    const clickedStaff = staffList.find((s) => {
      const p = gridToScreen(s.gx + 0.5, s.gy + 0.5);
      return Math.hypot(e.clientX - p.x, e.clientY - (p.y - 16 * camera.zoom)) < 22 * camera.zoom;
    });
    if (clickedStaff) {
      state.selectedStaffId = clickedStaff.id;
      playSfx('select');
      updateHUD();
      return;
    }

    const selected = staffList.find((s) => s.id === state.selectedStaffId);
    if (!selected) return;

    const clickedObj = OBJECTS.find((o) => o.gx === gx && o.gy === gy);
    if (clickedObj) {
      commandUseObject(selected, clickedObj);
      playSfx('select');
      updateHUD();
      return;
    }

    if (gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H && !blockedTiles.has(`${gx},${gy}`)) {
      commandWalk(selected, gx, gy, 'เดินไปยังจุดที่สั่ง');
      updateHUD();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    camera.zoom = Math.min(1.8, Math.max(0.55, camera.zoom * factor));
  }, { passive: false });

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.speed = Number(btn.dataset.speed);
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('.scenario-card').forEach((card) => {
    card.addEventListener('click', () => startScenario(card.dataset.scenario));
  });

  document.getElementById('btn-scenarios').addEventListener('click', () => {
    document.getElementById('scenario-modal').classList.remove('hidden');
  });
  document.getElementById('btn-close-scenario').addEventListener('click', () => {
    document.getElementById('scenario-modal').classList.add('hidden');
  });
  document.getElementById('btn-debrief').addEventListener('click', openDebrief);
  document.getElementById('btn-close-debrief').addEventListener('click', () => {
    document.getElementById('debrief-modal').classList.add('hidden');
  });
  document.getElementById('btn-howto').addEventListener('click', () => {
    document.getElementById('howto-modal').classList.remove('hidden');
  });
  document.getElementById('btn-close-howto').addEventListener('click', () => {
    document.getElementById('howto-modal').classList.add('hidden');
  });

  document.getElementById('toggle-freewill').addEventListener('change', (e) => {
    const s = staffList.find((st) => st.id === state.selectedStaffId);
    if (s) s.freeWill = e.target.checked;
  });

  document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
    soundEnabled = !soundEnabled;
    e.currentTarget.textContent = soundEnabled ? '🔊' : '🔇';
  });

  document.getElementById('btn-spawn-patient').addEventListener('click', spawnPatient);
  document.getElementById('btn-huddle').addEventListener('click', triggerTeamHuddle);
  document.getElementById('btn-center-cam').addEventListener('click', centerCamera);
  document.getElementById('btn-zoom-in').addEventListener('click', () => { camera.zoom = Math.min(1.8, camera.zoom * 1.15); });
  document.getElementById('btn-zoom-out').addEventListener('click', () => { camera.zoom = Math.max(0.55, camera.zoom * 0.87); });

  let lastTime = performance.now();
  let hudTimer = 0;

  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    updateSimulation(dt);
    render();

    hudTimer += dt;
    if (hudTimer >= 0.25) {
      hudTimer = 0;
      updateHUD();
      updateQueueUI();
    }
    requestAnimationFrame(loop);
  }

  logEvent('ยินดีต้อนรับสู่ OR-VIBE Sims (GenSx)! เลือกเคสผ่าตัดเพื่อเริ่มฝึกทีม', 'good');
  spawnPatient();
  updateHUD();
  requestAnimationFrame(loop);
})();
