(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  const GRID_W = 18;
  const GRID_H = 14;
  const TILE_W = 64;
  const TILE_H = 32;

  // Web Audio Synth SFX
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
      } else if (type === 'coin' || type === 'good') {
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
    scenario: 'stemi',
    scenarioLabel: '💓 กู้ชีพหัวใจขาดเลือด (STEMI)',
    minutes: 8 * 60,
    safety: 100,
    cured: 0,
    errorsAvoided: 0,
    errorsHappened: 0,
    teamstepps: { leadership: 80, communication: 80, monitoring: 80, support: 80 },
    selectedStaffId: 'doc1',
    hoverTile: null,
    nextPatientTimer: 3.0,
    tsEventTimer: 11.0,
    activeTsEvent: null,
    patientCounter: 1,
    targetMarkers: [],
    floatingTexts: [],
  };

  // ER Rooms
  const ROOMS = [
    { id: 'triage', name: 'คัดกรอง (ESI Triage)', x1: 0, y1: 0, x2: 5, y2: 4, floor: '#e4f2f7', border: '#a8cedb' },
    { id: 'resus', name: 'ห้องกู้ชีพ (Resus Bay)', x1: 6, y1: 0, x2: 11, y2: 4, floor: '#fef2f2', border: '#f3b7b7' },
    { id: 'lab', name: 'ห้องแล็บด่วน (STAT Lab)', x1: 12, y1: 0, x2: 17, y2: 4, floor: '#f2effa', border: '#c5b8e3' },
    { id: 'corridor', name: 'โถงทางเดิน ER', x1: 0, y1: 5, x2: 17, y2: 7, floor: '#f6f3ec', border: '#d9d1c3' },
    { id: 'pharmacy', name: 'ห้องยาฉุกเฉิน (ER Pharm)', x1: 0, y1: 8, x2: 5, y2: 13, floor: '#fdf2f6', border: '#e5bacb' },
    { id: 'radiology', name: 'ห้องเอกซเรย์ / CT Scan', x1: 6, y1: 8, x2: 11, y2: 13, floor: '#eef8f6', border: '#aad9cf' },
    { id: 'station', name: 'จุดพักทีม (Team Station)', x1: 12, y1: 8, x2: 17, y2: 13, floor: '#fff6e8', border: '#e6c999' },
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

  // Interactive ER Equipment
  const OBJECTS = [
    { id: 'triage_desk', name: 'จุดคัดกรอง ESI', icon: '🩺', gx: 3, gy: 2, standX: 3, standY: 3, patX: 2, patY: 2, color: '#38bdf8', role: 'nurse', actionText: 'คัดกรอง & วัดสัญญาณชีพ' },
    { id: 'waiting_chair_1', name: 'เตียงรอคัดกรอง', icon: '🪑', gx: 1, gy: 1, standX: 1, standY: 2, color: '#94a3b8', isWaitSeat: true },
    { id: 'waiting_chair_2', name: 'เตียงรอคัดกรอง', icon: '🪑', gx: 2, gy: 1, standX: 2, standY: 2, color: '#94a3b8', isWaitSeat: true },
    { id: 'resus_bed', name: 'เตียงกู้ชีพ & ECG', icon: '🫀', gx: 9, gy: 2, standX: 8, standY: 2, patX: 9, patY: 2, color: '#f87171', role: 'doctor', actionText: 'ประเมิน ABC & สั่งการรักษา' },
    { id: 'lab_machine', name: 'เครื่องตรวจ STAT Lab', icon: '🔬', gx: 15, gy: 2, standX: 14, standY: 2, patX: 15, patY: 3, color: '#a78bfa', role: 'mt', actionText: 'ตรวจเลือด / Troponin ด่วน' },
    { id: 'pharmacy_counter', name: 'คลังยาฉุกเฉิน', icon: '💊', gx: 2, gy: 11, standX: 2, standY: 10, patX: 3, patY: 10, color: '#f472b6', role: 'pharmacist', actionText: 'Check-Back ยา & ประวัติแพ้ยา' },
    { id: 'xray_machine', name: 'เครื่อง X-Ray / CT Scan', icon: '🩻', gx: 9, gy: 11, standX: 8, standY: 11, patX: 9, patY: 11, color: '#2dd4bf', role: 'radtech', actionText: 'ถ่ายภาพรังสี / CT ด่วน' },
    { id: 'coffee_machine', name: 'เครื่องชงกาแฟ', icon: '☕', gx: 15, gy: 9, standX: 15, standY: 10, color: '#b45309', need: 'energy', amount: 38, duration: 3.0, actionText: 'ดื่มกาแฟเติมพลัง' },
    { id: 'snack_fridge', name: 'ตู้ของว่าง', icon: '🥪', gx: 16, gy: 9, standX: 16, standY: 10, color: '#60a5fa', need: 'focus', amount: 40, duration: 3.2, actionText: 'ทานของว่างเพิ่มสมาธิ' },
    { id: 'sofa', name: 'โซฟาพักทีม', icon: '🛋️', gx: 14, gy: 12, standX: 14, standY: 11, color: '#f59e0b', need: 'calm', amount: 42, duration: 3.8, actionText: 'พักลดความตึงเครียด' },
  ];

  OBJECTS.forEach((o) => {
    if (!o.isWaitSeat && o.id !== 'resus_bed' && o.id !== 'xray_machine') {
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

  // 5 ER-VIPE Professions
  const staffList = [
    {
      id: 'nurse1', name: 'พว. ต้นกล้า', role: 'nurse', roleTitle: 'พยาบาล ER', emoji: '🩺',
      shirt: '#0ea5e9', coat: '#e0f2fe', hair: '#3b2f2f', gx: 3, gy: 3, level: 1, xp: 0,
      needs: { energy: 90, focus: 88, calm: 90, social: 85 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อมคัดกรอง ESI', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'doc1', name: 'พญ. มินตรา', role: 'doctor', roleTitle: 'แพทย์เวชศาสตร์ฉุกเฉิน', emoji: '👩‍⚕️',
      shirt: '#ef4444', coat: '#ffffff', hair: '#2c1e1e', gx: 8, gy: 3, level: 1, xp: 0,
      needs: { energy: 88, focus: 90, calm: 86, social: 82 },
      freeWill: true, state: 'idle', actionLabel: 'ประจำห้องกู้ชีพ', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'pharm1', name: 'ภก. ข้าวฟ่าง', role: 'pharmacist', roleTitle: 'เภสัชกร ER', emoji: '💊',
      shirt: '#ec4899', coat: '#ffffff', hair: '#5c3a21', gx: 3, gy: 10, level: 1, xp: 0,
      needs: { energy: 90, focus: 92, calm: 88, social: 80 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อม Check-Back ยา', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'rad1', name: 'นรท. ภูมิ', role: 'radtech', roleTitle: 'นักรังสีเทคนิค', emoji: '🩻',
      shirt: '#14b8a6', coat: '#ccfbf1', hair: '#4b3621', gx: 8, gy: 10, level: 1, xp: 0,
      needs: { energy: 92, focus: 86, calm: 90, social: 84 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อม X-Ray / CT Scan', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'mt1', name: 'ทนพ. เตชินท์', role: 'mt', roleTitle: 'นักเทคนิคการแพทย์', emoji: '🔬',
      shirt: '#8b5cf6', coat: '#f5f3ff', hair: '#1f2937', gx: 14, gy: 3, level: 1, xp: 0,
      needs: { energy: 92, focus: 90, calm: 86, social: 78 },
      freeWill: true, state: 'idle', actionLabel: 'ประจำ STAT Lab', path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
  ];

  // Scenario Case Pools
  const SCENARIOS = {
    stemi: {
      label: '💓 กู้ชีพหัวใจขาดเลือด (STEMI)',
      spawnRate: 11,
      cases: [
        { diagnosis: 'STEMI แน่นหน้าอกร้าวไปแขนซ้าย', icon: '🫀', esi: 'red', steps: ['nurse', 'doctor', 'mt', 'pharmacist'], decay: 1.5 },
        { diagnosis: 'เจ็บหน้าอกสงสัยกล้ามเนื้อหัวใจขาดเลือด', icon: '💓', esi: 'red', steps: ['nurse', 'doctor', 'radtech', 'mt', 'pharmacist'], decay: 1.3 },
        { diagnosis: 'ใจสั่น ความดันต่ำ (Arrhythmia)', icon: '⚡', esi: 'yellow', steps: ['nurse', 'doctor', 'pharmacist'], decay: 0.9 },
      ],
    },
    overcrowded: {
      label: '🏥 ห้องฉุกเฉินคับคั่ง (Overcrowded ER)',
      spawnRate: 6.5,
      cases: [
        { diagnosis: 'หอบเหนื่อยเฉียบพลัน SpO2 88%', icon: '🫁', esi: 'red', steps: ['nurse', 'doctor', 'radtech', 'pharmacist'], decay: 1.5 },
        { diagnosis: 'ไข้สูง หนาวสั่น สงสัยติดเชื้อในกระแสเลือด', icon: '🤒', esi: 'yellow', steps: ['nurse', 'doctor', 'mt', 'pharmacist'], decay: 1.0 },
        { diagnosis: 'ปวดท้องเฉียบพลัน', icon: '🤢', esi: 'yellow', steps: ['nurse', 'doctor', 'mt', 'radtech'], decay: 0.9 },
        { diagnosis: 'แผลถลอก / มีไข้เล็กน้อย', icon: '🩹', esi: 'green', steps: ['nurse', 'doctor', 'pharmacist'], decay: 0.45 },
      ],
    },
    trauma: {
      label: '🦴 อุบัติเหตุผู้สูงอายุ (Geriatric Trauma)',
      spawnRate: 10,
      cases: [
        { diagnosis: 'ผู้สูงอายุหกล้ม ศีรษะกระแทก (กินยา Warfarin)', icon: '🧠', esi: 'red', steps: ['nurse', 'doctor', 'radtech', 'mt', 'pharmacist'], decay: 1.4 },
        { diagnosis: 'สงสัยกระดูกสะโพกหักจากการล้ม', icon: '🦴', esi: 'yellow', steps: ['nurse', 'doctor', 'radtech', 'pharmacist'], decay: 0.95 },
        { diagnosis: 'หน้ามืด วูบ หมดสติชั่วคราว', icon: '💫', esi: 'yellow', steps: ['nurse', 'doctor', 'mt', 'pharmacist'], decay: 1.0 },
      ],
    },
  };

  // TeamSTEPPS Soft Skills Events
  const TEAMSTEPPS_EVENTS = [
    {
      title: '📣 Communication: SBAR ส่งต่อเคส',
      pillar: 'communication',
      q: 'พยาบาลคัดกรองพบผู้ป่วยแน่นหน้าอก เหงื่อแตก ความดัน 85/55 mmHg ควรสื่อสารกับแพทย์อย่างไร?',
      options: [
        { text: 'ใช้ SBAR: รายงานอาการ + สัญญาณชีพ + ประวัติโรคหัวใจทันที', ok: true, msg: 'เยี่ยม! การสื่อสารแบบ SBAR ชัดเจน ทีมกู้ชีพพร้อมทันที (+Communication)' },
        { text: 'วางแฟ้มไว้ที่โต๊ะ แล้วรอแพทย์เดินมาเปิดอ่านเอง', ok: false, msg: 'ล่าช้า! อาจเกิด Preventable Error ในผู้ป่วยวิกฤต (-Safety)' },
      ],
    },
    {
      title: '🤝 Mutual Support: กฎ Two-Challenge / CUS',
      pillar: 'support',
      q: 'เภสัชกรพบว่าคำสั่งยาละลายลิ่มเลือดมีขนาดสูงเกินเกณฑ์สำหรับผู้ป่วยสูงอายุ ควรทำอย่างไร?',
      options: [
        { text: 'ใช้คำพูด CUS ("กังวลเรื่องความปลอดภัยขนาดยา") ทักท้วงแพทย์ทันที', ok: true, msg: 'สุดยอด! ป้องกัน Human Error เรื่องยาได้สำเร็จ (+Mutual Support & Safety)' },
        { text: 'จัดยาตามใบสั่งไปก่อน เพราะเกรงใจแพทย์', ok: false, msg: 'อันตราย! ความเกรงใจทำให้เกิด Medication Error ได้!' },
      ],
    },
    {
      title: '👁️ Situation Monitoring: เฝ้าระวัง ER',
      pillar: 'monitoring',
      q: 'ห้องฉุกเฉินเริ่มแน่นมีเคสสีแดง 2 รายพร้อมกัน นักรังสีเทคนิคและแล็บควรปรับตัวอย่างไร?',
      options: [
        { text: 'Call-Out แจ้งทีมว่าพร้อมรับเคสวิกฤตแบบ STAT (ด่วนพิเศษ) ก่อนเคสสีเขียว', ok: true, msg: 'ดีมาก! Cross-Monitoring ช่วยจัดลำดับทรัพยากรทันกาล (+Monitoring)' },
        { text: 'ทำตามลำดับคิวก่อน-หลังเหมือนเดิม ไม่ต้องแจ้งใคร', ok: false, msg: 'เคสสีแดงอาจรอผล X-Ray/Lab นานเกิน Golden Period!' },
      ],
    },
    {
      title: '👑 Leadership: มอบหมายบทบาท (Closed-Loop)',
      pillar: 'leadership',
      q: 'ระหว่างกู้ชีพผู้ป่วยหัวใจขาดเลือด มีเสียงสั่งการหลายคนพร้อมกัน แพทย์หัวหน้าทีมควรทำอย่างไร?',
      options: [
        { text: 'กำหนดบทบาทชัดเจน + ใช้ Closed-Loop (สั่งชื่อคนรับ + ทวนคำสั่ง)', ok: true, msg: 'ภาวะผู้นำยอดเยี่ยม! ทุกคนรู้หน้าที่ ลดความสับสน (+Leadership)' },
        { text: 'ตะโกนสั่งรวมๆ ใครว่างก็รีบมาช่วยกันทำ', ok: false, msg: 'เกิดความซ้ำซ้อนและตกหล่นในการกู้ชีพ!' },
      ],
    },
  ];

  const PATIENT_NAMES = ['คุณสมชาย (68 ปี)', 'คุณมานี (54 ปี)', 'คุณปิติ (72 ปี)', 'คุณวิภา (45 ปี)', 'คุณณัฐ (61 ปี)', 'คุณอรุณ (79 ปี)'];
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
    if (patients.length >= 7) return;
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
      logEvent(`🚨 [ESI แดง] ${p.name}: ${p.diagnosis}`, 'urgent');
    } else {
      logEvent(`${p.name} เข้า ER (${p.diagnosis})`, 'info');
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
          state.safety = Math.max(10, state.safety - 8);
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
    logEvent(`เริ่มสถานการณ์: ${state.scenarioLabel}`, 'good');
    spawnPatient();
    if (key === 'overcrowded') spawnPatient();
    document.getElementById('scenario-modal').classList.add('hidden');
    updateHUD();
    updateQueueUI();
  }

  function openDebrief() {
    const avgTs = Math.round((state.teamstepps.leadership + state.teamstepps.communication + state.teamstepps.monitoring + state.teamstepps.support) / 4);
    const el = document.getElementById('debrief-content');
    el.innerHTML = `
      <div class="debrief-card">
        <h4>🛡️ ผลลัพธ์ความปลอดภัยผู้ป่วย</h4>
        <p style="font-size:13px;line-height:1.7;margin:0;">
          • Patient Safety Score: <strong>${Math.round(state.safety)}%</strong><br/>
          • ช่วยชีวิต/รักษาสำเร็จ: <strong>${state.cured} เคส</strong><br/>
          • ป้องกัน Human Error ได้: <strong style="color:#10b981;">${state.errorsAvoided} ครั้ง</strong><br/>
          • ความผิดพลาดที่เกิดขึ้น: <strong style="color:#ef4444;">${state.errorsHappened} ครั้ง</strong>
        </p>
      </div>
      <div class="debrief-card">
        <h4>🤝 สมรรถนะ TeamSTEPPS (เฉลี่ย ${avgTs}/100)</h4>
        <p style="font-size:13px;line-height:1.7;margin:0;">
          • 👑 Leadership: <strong>${state.teamstepps.leadership}</strong><br/>
          • 📣 Communication (SBAR): <strong>${state.teamstepps.communication}</strong><br/>
          • 👁️ Situation Monitoring: <strong>${state.teamstepps.monitoring}</strong><br/>
          • 🤝 Mutual Support (CUS): <strong>${state.teamstepps.support}</strong>
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

  // Staff actions
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
    staff.actionLabel = `เตรียม${station.actionText} (${patient.name})`;

    patient.assignedStaffId = staff.id;
    patient.state = 'moving_to_station';
    patient.path = findPath(patient.gx, patient.gy, station.patX, station.patY);
    patient.bubble = { text: station.icon, timer: 4 };
    return true;
  }

  function triggerTeamHuddle() {
    const spots = [{ x: 13, y: 9 }, { x: 14, y: 10 }, { x: 13, y: 11 }, { x: 15, y: 11 }, { x: 14, y: 9 }];
    staffList.forEach((s, idx) => {
      const spot = spots[idx % spots.length];
      s.path = findPath(s.gx, s.gy, spot.x, spot.y);
      s.state = 'walking_to_huddle';
      s.actionLabel = 'เดินไป Team Brief / Huddle';
      s.targetObject = null;
      s.targetPatientId = null;
      s.bubble = { text: '🤝 SBAR', timer: 3.5 };
    });
    addTeamStepps('communication', 4);
    addTeamStepps('leadership', 3);
    playSfx('select');
    logEvent('ทีม ER ประชุม Brief & SBAR ร่วมกัน (+Communication & Leadership)', 'good');
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

    // Prioritize ESI Red > Yellow > Green!
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
        staff.actionLabel = `เดินไปสื่อสาร SBAR กับ ${peer.name}`;
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
      staff.needs.energy = Math.max(5, staff.needs.energy - simDt * 0.38);
      staff.needs.focus = Math.max(5, staff.needs.focus - simDt * 0.34);
      staff.needs.calm = Math.max(10, staff.needs.calm - simDt * 0.25);
      staff.needs.social = Math.max(10, staff.needs.social - simDt * 0.28);

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
          staff.actionLabel = 'พร้อมรับคำสั่ง';
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
          staff.actionLabel = 'พร้อมปฏิบัติงาน';
        }
      } else if (staff.state === 'walking_to_treat') {
        if (moveEntityAlongPath(staff, simDt, 3.3 * spdMult)) {
          const pat = patients.find((p) => p.id === staff.targetPatientId);
          if (!pat) {
            staff.state = 'idle';
          } else if (pat.state === 'in_treatment' || pat.path.length === 0) {
            staff.state = 'treating';
            staff.workTimer = Math.max(1.8, 3.4 / spdMult);
            staff.actionLabel = `${staff.targetObject.actionText}: ${pat.name}`;
            staff.bubble = { text: staff.targetObject.icon, timer: staff.workTimer };
            pat.state = 'in_treatment';
            pat.bubble = { text: '⏳', timer: staff.workTimer };
          } else {
            staff.actionLabel = `รอ ${pat.name} เข้าจุด...`;
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
              pat.path = findPath(pat.gx, pat.gy, 0, 6);
              pat.bubble = { text: '💚 ปลอดภัยแล้ว!', timer: 5 };
              state.cured += 1;
              state.safety = Math.min(100, state.safety + 2);
              addTeamStepps('monitoring', 2);
              playSfx('good');
              state.floatingTexts.push({ gx: pat.gx, gy: pat.gy, text: '💚 ปลอดภัย!', color: '#10b981', life: 2.0 });
              logEvent(`ช่วยชีวิต/รักษา ${pat.name} สำเร็จทันเวลา!`, 'good');
            } else {
              const nextRole = pat.steps[pat.stepIndex];
              const roleNames = { nurse: 'พยาบาล', doctor: 'แพทย์', mt: 'แล็บ', radtech: 'รังสีเทคนิค', pharmacist: 'เภสัชกร' };
              pat.state = 'waiting';
              pat.bubble = { text: `ส่งต่อ ${roleNames[nextRole]}`, timer: 4 };
              logEvent(`Call-Out: ${staff.name} ส่งต่อ ${pat.name} → ${roleNames[nextRole]}`, 'info');
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
          staff.bubble = { text: '💬 SBAR!', timer: 3 };
          addTeamStepps('communication', 2);
          addStaffXp(staff, 15);
          const peer = staffList.find((o) => o.id === staff.chatPeerId);
          if (peer) {
            peer.needs.social = Math.min(100, peer.needs.social + 20);
            peer.bubble = { text: '💬 รับทราบ!', timer: 3 };
          }
          state.floatingTexts.push({ gx: staff.gx, gy: staff.gy, text: '📣 +SBAR', color: '#2d9cdb', life: 1.4 });
          staff.state = 'idle';
          staff.actionLabel = 'สื่อสารกับทีมเรียบร้อย';
        }
      } else if (staff.state === 'walking_to_huddle') {
        if (moveEntityAlongPath(staff, simDt, 3.0 * spdMult)) {
          staff.needs.social = Math.min(100, staff.needs.social + 20);
          staff.needs.calm = Math.min(100, staff.needs.calm + 12);
          staff.bubble = { text: '💡 วางแผนร่วมกัน!', timer: 3.5 };
          addStaffXp(staff, 20);
          staff.state = 'idle';
          staff.actionLabel = 'Brief ทีมเสร็จสิ้น';
        }
      }
    }

    for (let i = patients.length - 1; i >= 0; i--) {
      const p = patients[i];
      if (p.bubble) {
        p.bubble.timer -= simDt;
        if (p.bubble.timer <= 0) p.bubble = null;
      }
      if (p.state !== 'leaving' && p.state !== 'in_treatment') {
        p.stability -= simDt * p.decay;
        if (p.stability <= 0) {
          p.state = 'leaving';
          p.path = findPath(p.gx, p.gy, 0, 6);
          p.bubble = { text: '🚨 ส่งต่อ ICU ด่วน!', timer: 4 };
          state.safety = Math.max(10, state.safety - 10);
          state.errorsHappened += 1;
          playSfx('alert');
          logEvent(`⚠️ สัญญาณชีพ ${p.name} ทรุดลง! ต้องรีบส่งต่อ ICU (-Safety)`, 'urgent');
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

  // Rendering
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

    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 2 * z, 11 * z, 6 * z, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 35, 50, 0.2)';
    ctx.fill();

    if (isStaff && ent.id === state.selectedStaffId) {
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 2 * z, 16 * z, 9 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#38c172';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    const bodyY = pos.y - bob;
    ctx.fillStyle = isStaff ? ent.coat : ent.shirt;
    ctx.strokeStyle = '#1e3a4c';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(pos.x - 8 * z, bodyY - 26 * z, 16 * z, 22 * z, 6 * z);
    ctx.fill();
    ctx.stroke();

    if (isStaff) {
      ctx.fillStyle = ent.shirt;
      ctx.fillRect(pos.x - 3 * z, bodyY - 24 * z, 6 * z, 12 * z);
    }

    ctx.beginPath();
    ctx.arc(pos.x, bodyY - 33 * z, 8.5 * z, 0, Math.PI * 2);
    ctx.fillStyle = '#fde2c8';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(pos.x, bodyY - 35 * z, 8.5 * z, Math.PI, Math.PI * 2);
    ctx.fillStyle = ent.hair || '#3a2b25';
    ctx.fill();

    ctx.font = `600 ${Math.max(10, Math.round(11 * z))}px Prompt, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isStaff ? '#0f293a' : '#475569';
    ctx.fillText(ent.name.split(' ')[0], pos.x, pos.y + 16 * z);

    // Patient Vital Stability Bar
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
    ctx.fillStyle = 'rgba(24, 48, 66, 0.45)';
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

  // UI Sync
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
      list.innerHTML = '<div style="font-size:12px;color:#64748b;">ยังไม่มีผู้ป่วยรอคิวใน ER...</div>';
      return;
    }
    const roleIcons = { nurse: '🩺', doctor: '👩‍⚕️', mt: '🔬', radtech: '🩻', pharmacist: '💊' };
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
          <div class="queue-item esi-${p.esi}">
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
    document.getElementById('stat-patients').textContent = `${patients.length} คน`;

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
      const sbarBtn = document.createElement('button');
      sbarBtn.className = 'quick-cmd-btn';
      sbarBtn.textContent = '📣 Call-Out / SBAR';
      sbarBtn.onclick = () => {
        staff.bubble = { text: '📣 SBAR พร้อม!', timer: 3 };
        addTeamStepps('communication', 2);
        playSfx('select');
        logEvent(`${staff.name} ทำ Call-Out สื่อสารสถานะกับทีม`, 'info');
      };
      cmds.appendChild(sbarBtn);

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

  // Input handling
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

  // Button listeners
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

  logEvent('ยินดีต้อนรับสู่ ER-VIPE Sims! เลือกสถานการณ์เพื่อเริ่มฝึกทีม', 'good');
  spawnPatient();
  updateHUD();
  requestAnimationFrame(loop);
})();
