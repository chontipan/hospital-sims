(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  // Isometric constants
  const GRID_W = 18;
  const GRID_H = 14;
  const TILE_W = 64;
  const TILE_H = 32;

  // Web Audio Synth (no external audio files required)
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
      } else if (type === 'coin') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'place') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
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
    } catch (_) {
      // Ignore audio errors if blocked by browser policy
    }
  }

  // Camera state
  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    moved: false,
  };

  // Game state
  const state = {
    speed: 1,
    day: 1,
    minutes: 8 * 60,
    money: 12500,
    cured: 0,
    teamwork: 100,
    selectedStaffId: 'doc1',
    hoverTile: null,
    nextPatientTimer: 2.5,
    consultTimer: 16,
    activeConsult: null,
    patientCounter: 1,
    staffCounter: 10,
    objCounter: 100,
    buildItem: null, // currently selected shop item to place
    targetMarkers: [],
    floatingTexts: [],
  };

  // Room definitions
  const ROOMS = [
    { id: 'triage', name: 'จุดคัดกรอง', x1: 0, y1: 0, x2: 5, y2: 4, floor: '#e4f2f7', border: '#a8cedb' },
    { id: 'doctor', name: 'ห้องตรวจแพทย์', x1: 6, y1: 0, x2: 11, y2: 4, floor: '#edf6ee', border: '#add1b2' },
    { id: 'lab', name: 'ห้องแล็บ (MT)', x1: 12, y1: 0, x2: 17, y2: 4, floor: '#f2effa', border: '#c5b8e3' },
    { id: 'corridor', name: 'โถงทางเดินกลาง', x1: 0, y1: 5, x2: 17, y2: 7, floor: '#f6f3ec', border: '#d9d1c3' },
    { id: 'pharmacy', name: 'ห้องจ่ายยา', x1: 0, y1: 8, x2: 5, y2: 13, floor: '#fdf2f6', border: '#e5bacb' },
    { id: 'rehab', name: 'กายภาพบำบัด (PT)', x1: 6, y1: 8, x2: 11, y2: 13, floor: '#eef8f6', border: '#aad9cf' },
    { id: 'lounge', name: 'ห้องพักเจ้าหน้าที่', x1: 12, y1: 8, x2: 17, y2: 13, floor: '#fff6e8', border: '#e6c999' },
  ];

  const blockedTiles = new Set();
  const wallEdges = [];

  function buildWalls() {
    for (let y = 0; y <= 4; y++) {
      if (y !== 2) wallEdges.push({ x1: 6, y1: y, x2: 6, y2: y + 1 });
      if (y !== 2) wallEdges.push({ x1: 12, y1: y, x2: 12, y2: y + 1 });
    }
    for (let x = 0; x < GRID_W; x++) {
      const isDoor = (x >= 2 && x <= 3) || (x >= 8 && x <= 9) || (x >= 14 && x <= 15);
      if (!isDoor) {
        wallEdges.push({ x1: x, y1: 5, x2: x + 1, y2: 5 });
        wallEdges.push({ x1: x, y1: 8, x2: x + 1, y2: 8 });
      }
    }
    for (let y = 8; y <= 13; y++) {
      if (y !== 10) wallEdges.push({ x1: 6, y1: y, x2: 6, y2: y + 1 });
      if (y !== 10) wallEdges.push({ x1: 12, y1: y, x2: 12, y2: y + 1 });
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

  // Interactive hospital objects
  const OBJECTS = [
    { id: 'triage_desk', name: 'โต๊ะคัดกรอง', icon: '🩺', gx: 3, gy: 2, standX: 3, standY: 3, patX: 2, patY: 2, color: '#38bdf8', room: 'triage', role: 'nurse', actionText: 'คัดกรองผู้ป่วย' },
    { id: 'waiting_chair_1', name: 'เก้าอี้รอตรวจ', icon: '🪑', gx: 1, gy: 1, standX: 1, standY: 2, color: '#94a3b8', room: 'triage', isWaitSeat: true },
    { id: 'waiting_chair_2', name: 'เก้าอี้รอตรวจ', icon: '🪑', gx: 2, gy: 1, standX: 2, standY: 2, color: '#94a3b8', room: 'triage', isWaitSeat: true },
    { id: 'exam_bed', name: 'เตียงตรวจแพทย์', icon: '🛏️', gx: 9, gy: 2, standX: 8, standY: 2, patX: 9, patY: 2, color: '#34d399', room: 'doctor', role: 'doctor', actionText: 'ตรวจวินิจฉัยโรค' },
    { id: 'lab_machine', name: 'เครื่องตรวจแล็บ', icon: '🔬', gx: 15, gy: 2, standX: 14, standY: 2, patX: 15, patY: 3, color: '#a78bfa', room: 'lab', role: 'mt', actionText: 'วิเคราะห์ผลแล็บ' },
    { id: 'pharmacy_counter', name: 'เคาน์เตอร์จ่ายยา', icon: '💊', gx: 2, gy: 11, standX: 2, standY: 10, patX: 3, patY: 10, color: '#f472b6', room: 'pharmacy', role: 'pharmacist', actionText: 'จัดและตรวจสอบยา' },
    { id: 'rehab_mat', name: 'อุปกรณ์กายภาพ', icon: '🏋️', gx: 9, gy: 11, standX: 8, standY: 11, patX: 9, patY: 11, color: '#2dd4bf', room: 'rehab', role: 'pt', actionText: 'ฝึกกายภาพบำบัด' },
    { id: 'coffee_machine', name: 'เครื่องชงกาแฟ', icon: '☕', gx: 15, gy: 9, standX: 15, standY: 10, color: '#b45309', room: 'lounge', need: 'energy', amount: 38, duration: 3.5, actionText: 'ดื่มกาแฟเติมพลัง' },
    { id: 'snack_fridge', name: 'ตู้เย็นของว่าง', icon: '🥪', gx: 16, gy: 9, standX: 16, standY: 10, color: '#60a5fa', room: 'lounge', need: 'hunger', amount: 48, duration: 4.0, actionText: 'ทานของว่าง' },
    { id: 'sofa', name: 'โซฟาพักผ่อน', icon: '🛋️', gx: 14, gy: 12, standX: 14, standY: 11, color: '#f59e0b', room: 'lounge', need: 'mood', amount: 42, duration: 4.5, actionText: 'งีบพักบนโซฟา' },
    { id: 'plant_1', name: 'ต้นไม้ฟอกอากาศ', icon: '🪴', gx: 7, gy: 6, standX: 7, standY: 5, color: '#4ade80', room: 'corridor', need: 'mood', amount: 15, duration: 2.0, actionText: 'ชื่นชมต้นไม้' },
  ];

  function refreshBlockedTiles() {
    blockedTiles.clear();
    OBJECTS.forEach((o) => {
      if (!o.isWaitSeat && o.id !== 'rehab_mat' && o.id !== 'exam_bed') {
        blockedTiles.add(`${o.gx},${o.gy}`);
      }
    });
  }
  refreshBlockedTiles();

  // Shop catalog
  const SHOP_CATALOG = [
    { id: 'plant', name: 'ต้นไม้ฟอกอากาศ', icon: '🪴', price: 250, color: '#4ade80', need: 'mood', amount: 18, duration: 2.0, actionText: 'พักสายตาดูต้นไม้' },
    { id: 'coffee', name: 'เครื่องชงกาแฟ', icon: '☕', price: 600, color: '#b45309', need: 'energy', amount: 42, duration: 3.0, actionText: 'ดื่มกาแฟเติมพลัง' },
    { id: 'sofa', name: 'โซฟานุ่มพิเศษ', icon: '🛋️', price: 500, color: '#f59e0b', need: 'mood', amount: 45, duration: 4.0, actionText: 'นั่งพักบนโซฟา' },
    { id: 'tv', name: 'ทีวีห้องรอตรวจ', icon: '📺', price: 450, color: '#64748b', need: 'mood', amount: 25, duration: 3.0, actionText: 'ดูทีวีผ่อนคลาย' },
    { id: 'nutrition', name: 'โต๊ะโภชนาการ', icon: '🥗', price: 900, color: '#84cc16', role: 'dietitian', actionText: 'วางแผนโภชนาการ' },
    { id: 'fridge', name: 'ตู้เย็นของว่าง', icon: '🥪', price: 550, color: '#60a5fa', need: 'hunger', amount: 50, duration: 3.5, actionText: 'ทานของว่าง' },
  ];

  // Hire catalog
  const HIRE_CATALOG = [
    { role: 'nurse', roleTitle: 'พยาบาลวิชาชีพ', emoji: '🩺', price: 1500, shirt: '#0ea5e9', coat: '#e0f2fe', names: ['พว. น้ำฝน', 'พว. ก้องภพ'] },
    { role: 'doctor', roleTitle: 'แพทย์เวชปฏิบัติ', emoji: '👨‍⚕️', price: 2200, shirt: '#10b981', coat: '#ffffff', names: ['นพ. ภาคิน', 'พญ. ลลิตา'] },
    { role: 'pharmacist', roleTitle: 'เภสัชกร', emoji: '💊', price: 1800, shirt: '#ec4899', coat: '#ffffff', names: ['ภก. กวิน', 'ภญ. ใบบัว'] },
    { role: 'pt', roleTitle: 'นักกายภาพบำบัด', emoji: '🦴', price: 1600, shirt: '#14b8a6', coat: '#ccfbf1', names: ['กภ. พิมพ์', 'กภ. ณดล'] },
    { role: 'mt', roleTitle: 'นักเทคนิคการแพทย์', emoji: '🔬', price: 1700, shirt: '#8b5cf6', coat: '#f5f3ff', names: ['ทนพ. ชนา', 'ทนพ. วิน'] },
    { role: 'dietitian', roleTitle: 'นักโภชนาการ', emoji: '🥗', price: 1600, shirt: '#84cc16', coat: '#f7fee7', names: ['นภ. มะลิ', 'นภ. อชิ'] },
  ];

  // A* Pathfinding
  function findPath(sx, sy, tx, ty) {
    const startX = Math.max(0, Math.min(GRID_W - 1, Math.round(sx)));
    const startY = Math.max(0, Math.min(GRID_H - 1, Math.round(sy)));
    const endX = Math.max(0, Math.min(GRID_W - 1, Math.round(tx)));
    const endY = Math.max(0, Math.min(GRID_H - 1, Math.round(ty)));

    if (startX === endX && startY === endY) return [];

    const open = [{ x: startX, y: startY, g: 0, f: Math.abs(endX - startX) + Math.abs(endY - startY), parent: null }];
    const closed = new Set();
    const dirs = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];

    let iterations = 0;
    while (open.length > 0 && iterations < 600) {
      iterations++;
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

        const stepCost = dx !== 0 && dy !== 0 ? 1.414 : 1;
        const g = curr.g + stepCost;
        const h = Math.hypot(endX - nx, endY - ny);
        const existing = open.find((n) => n.x === nx && n.y === ny);
        if (!existing) {
          open.push({ x: nx, y: ny, g, f: g + h, parent: curr });
        } else if (g < existing.g) {
          existing.g = g;
          existing.f = g + h;
          existing.parent = curr;
        }
      }
    }
    return [{ x: endX, y: endY }];
  }

  // Staff definitions
  const staffList = [
    {
      id: 'nurse1', name: 'พว. ต้นกล้า', role: 'nurse', roleTitle: 'พยาบาลวิชาชีพ', emoji: '🩺',
      shirt: '#0ea5e9', coat: '#e0f2fe', hair: '#3b2f2f', gx: 3, gy: 3,
      level: 1, xp: 0,
      needs: { energy: 88, hunger: 82, mood: 90, social: 85 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อมคัดกรองผู้ป่วย',
      path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'doc1', name: 'พญ. มินตรา', role: 'doctor', roleTitle: 'แพทย์เวชปฏิบัติ', emoji: '👩‍⚕️',
      shirt: '#10b981', coat: '#ffffff', hair: '#2c1e1e', gx: 8, gy: 3,
      level: 1, xp: 0,
      needs: { energy: 85, hunger: 78, mood: 88, social: 80 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อมตรวจวินิจฉัย',
      path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'mt1', name: 'ทนพ. เตชินท์', role: 'mt', roleTitle: 'นักเทคนิคการแพทย์', emoji: '🔬',
      shirt: '#8b5cf6', coat: '#f5f3ff', hair: '#1f2937', gx: 14, gy: 3,
      level: 1, xp: 0,
      needs: { energy: 92, hunger: 86, mood: 85, social: 75 },
      freeWill: true, state: 'idle', actionLabel: 'ประจำห้องแล็บ',
      path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'pt1', name: 'กภ. ภูมิ', role: 'pt', roleTitle: 'นักกายภาพบำบัด', emoji: '🦴',
      shirt: '#14b8a6', coat: '#ccfbf1', hair: '#4b3621', gx: 8, gy: 10,
      level: 1, xp: 0,
      needs: { energy: 90, hunger: 80, mood: 92, social: 88 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อมฝึกกายภาพ',
      path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
    {
      id: 'pharm1', name: 'ภก. ข้าวฟ่าง', role: 'pharmacist', roleTitle: 'เภสัชกร', emoji: '💊',
      shirt: '#ec4899', coat: '#ffffff', hair: '#5c3a21', gx: 3, gy: 10,
      level: 1, xp: 0,
      needs: { energy: 87, hunger: 84, mood: 89, social: 82 },
      freeWill: true, state: 'idle', actionLabel: 'พร้อมตรวจสอบและจ่ายยา',
      path: [], bubble: null, workTimer: 0, targetPatientId: null, walkPhase: 0,
    },
  ];

  // Case templates
  const CASE_TEMPLATES = [
    { diagnosis: 'ปวดหลังเรื้อรัง / กล้ามเนื้ออักเสบ', icon: '🦴', steps: ['nurse', 'doctor', 'pt', 'pharmacist'], reward: 520 },
    { diagnosis: 'ไข้สูง / สงสัยติดเชื้อ', icon: '🤒', steps: ['nurse', 'doctor', 'mt', 'pharmacist'], reward: 480 },
    { diagnosis: 'ข้อเข่าเสื่อม & ตรวจเบาหวาน', icon: '🩺', steps: ['nurse', 'doctor', 'mt', 'pt', 'pharmacist'], reward: 680 },
    { diagnosis: 'เวียนศีรษะ / ความดันโลหิตสูง', icon: '💓', steps: ['nurse', 'doctor', 'pharmacist'], reward: 390 },
  ];

  const EMERGENCY_TEMPLATES = [
    { diagnosis: '🚑 ฉุกเฉิน: แน่นหน้าอกเฉียบพลัน!', icon: '🚑', steps: ['nurse', 'doctor', 'mt', 'pharmacist'], reward: 1250, timeLimit: 42 },
    { diagnosis: '🚑 ฉุกเฉิน: อุบัติเหตุข้อเท้าพลิก!', icon: '🩹', steps: ['nurse', 'doctor', 'pt', 'pharmacist'], reward: 1100, timeLimit: 45 },
  ];

  const CONSULT_SCENARIOS = [
    {
      q: '💊 เภสัชกรพบว่าคนไข้แพ้ยา Penicillin แต่ใบสั่งยามี Amoxicillin ควรทำอย่างไร?',
      options: [
        { text: '🤝 ประสานแพทย์ทันทีเพื่อเปลี่ยนกลุ่มยา', correct: true, msg: 'ยอดเยี่ยม! ป้องกันการแพ้ยารุนแรงได้ (+฿350)' },
        { text: 'ปล่อยผ่านไปก่อน เดี๋ยวค่อยดูอาการ', correct: false, msg: 'อันตราย! คนไข้เสี่ยงแพ้ยา ทีมเวิร์คลดลง' },
      ],
    },
    {
      q: '🦴 นักกายภาพพบคนไข้เวียนศีรษะมากระหว่างฝึกเดิน ควรทำอย่างไร?',
      options: [
        { text: 'หยุดฝึก นั่งพัก และเรียกพยาบาลวัดความดัน', correct: true, msg: 'ปลอดภัยไว้ก่อน! ทีมดูแลร่วมกันได้ทันท่วงที (+฿320)' },
        { text: 'ให้ฝืนเดินต่อให้ครบเวลา', correct: false, msg: 'เสี่ยงหกล้มในโรงพยาบาล!' },
      ],
    },
    {
      q: '🔬 ผลแล็บน้ำตาลในเลือดสูงผิดปกติมาก (420 mg/dL) นักเทคนิคการแพทย์ควรทำอย่างไร?',
      options: [
        { text: '⚡ โทรแจ้งค่าวิกฤต (Critical Value) ให้แพทย์-พยาบาลทันที', correct: true, msg: 'รวดเร็วมาก! ช่วยรักษาผู้ป่วยได้ทันเวลา (+฿400)' },
        { text: 'รอส่งใบผลแล็บตามรอบปกติตอนเย็น', correct: false, msg: 'ล่าช้าเกินไปสำหรับค่าวิกฤต!' },
      ],
    },
  ];

  const PATIENT_NAMES = ['คุณสมชาย', 'คุณมานี', 'คุณปิติ', 'คุณวิภา', 'คุณณัฐ', 'คุณอรุณ', 'คุณพลอย', 'คุณธนา'];
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

  function addStaffXp(staff, amount) {
    staff.xp += amount;
    const needed = staff.level * 100;
    if (staff.xp >= needed) {
      staff.xp -= needed;
      staff.level += 1;
      playSfx('levelup');
      state.floatingTexts.push({ gx: staff.gx, gy: staff.gy, text: `⭐ Lv.${staff.level}!`, color: '#f59e0b', life: 2.0 });
      logEvent(`${staff.name} เลื่อนขั้นเป็น Lv.${staff.level} (ทำงานเร็วขึ้น!)`, 'good');
    }
  }

  function spawnPatient(isEmergency = false) {
    if (patients.length >= 7) return;
    const pool = isEmergency ? EMERGENCY_TEMPLATES : CASE_TEMPLATES;
    const tpl = pool[Math.floor(Math.random() * pool.length)];
    const steps = [...tpl.steps];
    // If we have a nutrition station AND a dietitian, 35% chance to include dietitian!
    if (!isEmergency && OBJECTS.some((o) => o.role === 'dietitian') && staffList.some((s) => s.role === 'dietitian') && Math.random() < 0.45) {
      steps.splice(steps.length - 1, 0, 'dietitian');
    }
    const name = PATIENT_NAMES[Math.floor(Math.random() * PATIENT_NAMES.length)];
    const seatIdx = patients.length % 2;
    const waitSeat = seatIdx === 0 ? { x: 1, y: 2 } : { x: 2, y: 2 };
    const p = {
      id: `pat_${state.patientCounter++}`,
      name,
      diagnosis: tpl.diagnosis,
      icon: tpl.icon,
      steps,
      stepIndex: 0,
      reward: tpl.reward,
      isEmergency,
      emergencyTimer: isEmergency ? tpl.timeLimit : null,
      gx: 0,
      gy: 6,
      path: findPath(0, 6, waitSeat.x, waitSeat.y),
      state: 'walking_to_wait',
      assignedStaffId: null,
      bubble: { text: tpl.icon, timer: 4 },
      shirt: isEmergency ? '#ef4444' : ['#fb7185', '#fbbf24', '#60a5fa', '#a78bfa', '#34d399'][Math.floor(Math.random() * 5)],
      walkPhase: 0,
    };
    patients.push(p);
    if (isEmergency) {
      playSfx('alert');
      logEvent(`🚨 เคสฉุกเฉิน! ${p.name} (${p.diagnosis})`, 'urgent');
    } else {
      logEvent(`${p.name} เข้ามาตรวจ (${p.diagnosis})`, 'info');
    }
    updateQueueUI();
  }

  function triggerConsult() {
    if (state.activeConsult) return;
    const sc = CONSULT_SCENARIOS[Math.floor(Math.random() * CONSULT_SCENARIOS.length)];
    state.activeConsult = sc;
    const card = document.getElementById('consult-card');
    document.getElementById('consult-question').textContent = sc.q;
    const opts = document.getElementById('consult-options');
    opts.innerHTML = '';
    sc.options.forEach((opt) => {
      const btn = document.createElement('button');
      btn.className = 'consult-opt-btn';
      btn.textContent = opt.text;
      btn.onclick = () => {
        if (opt.correct) {
          state.money += 350;
          state.teamwork = Math.min(100, state.teamwork + 6);
          playSfx('coin');
          logEvent(opt.msg, 'good');
        } else {
          state.teamwork = Math.max(20, state.teamwork - 8);
          playSfx('alert');
          logEvent(opt.msg, 'warn');
        }
        state.activeConsult = null;
        card.classList.add('hidden');
        updateHUD();
      };
      opts.appendChild(btn);
    });
    card.classList.remove('hidden');
    playSfx('alert');
  }

  // Coordinate conversions
  function gridToScreen(gx, gy) {
    const cx = canvas.width / 2 + camera.x;
    const cy = canvas.height / 2 + camera.y - 40;
    const isoX = (gx - gy) * (TILE_W / 2) * camera.zoom;
    const isoY = (gx + gy - (GRID_W + GRID_H) / 2 + 2) * (TILE_H / 2) * camera.zoom;
    return { x: cx + isoX, y: cy + isoY };
  }

  function screenToGrid(sx, sy) {
    const cx = canvas.width / 2 + camera.x;
    const cy = canvas.height / 2 + camera.y - 40;
    const dx = (sx - cx) / ((TILE_W / 2) * camera.zoom);
    const dy = (sy - cy) / ((TILE_H / 2) * camera.zoom) + ((GRID_W + GRID_H) / 2 - 2);
    return { gx: (dx + dy) / 2, gy: (dy - dx) / 2 };
  }

  function centerCamera() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = Math.min(1.15, Math.max(0.65, Math.min(canvas.width / 1280, canvas.height / 760)));
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (camera.zoom === 1 && camera.x === 0 && camera.y === 0) centerCamera();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Commands
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
    const spots = [
      { x: 13, y: 9 }, { x: 14, y: 10 }, { x: 13, y: 11 }, { x: 15, y: 11 }, { x: 14, y: 9 }, { x: 15, y: 10 },
    ];
    staffList.forEach((s, idx) => {
      const spot = spots[idx % spots.length];
      s.path = findPath(s.gx, s.gy, spot.x, spot.y);
      s.state = 'walking_to_huddle';
      s.actionLabel = 'เดินไปประชุมสหวิชาชีพ';
      s.targetObject = null;
      s.targetPatientId = null;
      s.bubble = { text: '🤝', timer: 3.5 };
    });
    state.teamwork = Math.min(100, state.teamwork + 5);
    playSfx('select');
    logEvent('ทีมสหวิชาชีพนัดประชุมปรึกษาเคส (IPE Huddle)', 'good');
  }

  // AI Autonomy
  function runStaffAI(staff) {
    if (!staff.freeWill || staff.state !== 'idle') return;

    if (staff.needs.energy < 30) {
      const coffee = OBJECTS.find((o) => o.need === 'energy');
      if (coffee) { commandUseObject(staff, coffee); return; }
    }
    if (staff.needs.hunger < 30) {
      const fridge = OBJECTS.find((o) => o.need === 'hunger');
      if (fridge) { commandUseObject(staff, fridge); return; }
    }
    if (staff.needs.mood < 32) {
      const sofa = OBJECTS.find((o) => o.need === 'mood');
      if (sofa) { commandUseObject(staff, sofa); return; }
    }

    // Prioritize emergency patients!
    const waitingPat =
      patients.find((p) => p.isEmergency && (p.state === 'waiting' || p.state === 'walking_to_wait') && !p.assignedStaffId && p.steps[p.stepIndex] === staff.role) ||
      patients.find((p) => (p.state === 'waiting' || p.state === 'walking_to_wait') && !p.assignedStaffId && p.steps[p.stepIndex] === staff.role);

    if (waitingPat) {
      assignStaffToPatient(staff, waitingPat);
      return;
    }

    if (Math.random() < 0.015) {
      if (staff.needs.social < 72) {
        const peer = staffList.find((o) => o.id !== staff.id && o.state === 'idle');
        if (peer) {
          staff.path = findPath(staff.gx, staff.gy, Math.round(peer.gx), Math.round(peer.gy));
          staff.state = 'walking_to_chat';
          staff.chatPeerId = peer.id;
          staff.actionLabel = `เดินไปคุยปรึกษากับ ${peer.name}`;
          return;
        }
      }
      const room = ROOMS.find((r) =>
        (staff.role === 'nurse' && r.id === 'triage') ||
        (staff.role === 'doctor' && r.id === 'doctor') ||
        (staff.role === 'mt' && r.id === 'lab') ||
        (staff.role === 'pt' && r.id === 'rehab') ||
        (staff.role === 'pharmacist' && r.id === 'pharmacy') ||
        (staff.role === 'dietitian' && r.id === 'corridor')
      );
      if (room) {
        const rx = room.x1 + 1 + Math.floor(Math.random() * Math.max(1, room.x2 - room.x1 - 1));
        const ry = room.y1 + 1 + Math.floor(Math.random() * Math.max(1, room.y2 - room.y1 - 1));
        if (!blockedTiles.has(`${rx},${ry}`)) commandWalk(staff, rx, ry, 'เดินสำรวจในแผนก');
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
    } else {
      ent.gx += (dx / dist) * step;
      ent.gy += (dy / dist) * step;
      return false;
    }
  }

  function updateSimulation(dt) {
    if (state.speed === 0) return;
    const simDt = dt * state.speed;

    state.minutes += simDt * 3.5;
    if (state.minutes >= 24 * 60) {
      state.minutes -= 24 * 60;
      state.day += 1;
    }

    state.nextPatientTimer -= simDt;
    if (state.nextPatientTimer <= 0) {
      spawnPatient(Math.random() < 0.16);
      state.nextPatientTimer = 9 + Math.random() * 7;
    }

    state.consultTimer -= simDt;
    if (state.consultTimer <= 0) {
      triggerConsult();
      state.consultTimer = 26 + Math.random() * 14;
    }

    for (const staff of staffList) {
      staff.needs.energy = Math.max(5, staff.needs.energy - simDt * 0.42);
      staff.needs.hunger = Math.max(5, staff.needs.hunger - simDt * 0.35);
      staff.needs.mood = Math.max(10, staff.needs.mood - simDt * 0.22);
      staff.needs.social = Math.max(10, staff.needs.social - simDt * 0.28);

      const spdMult = 1 + (staff.level - 1) * 0.12;

      if (staff.bubble) {
        staff.bubble.timer -= simDt;
        if (staff.bubble.timer <= 0) staff.bubble = null;
      }

      if (staff.state === 'idle') {
        runStaffAI(staff);
      } else if (staff.state === 'walking') {
        if (moveEntityAlongPath(staff, simDt, 2.9 * spdMult)) {
          staff.state = 'idle';
          staff.actionLabel = 'ยืนพัก / พร้อมทำงาน';
        }
      } else if (staff.state === 'walking_to_object') {
        if (moveEntityAlongPath(staff, simDt, 2.9 * spdMult)) {
          const obj = staff.targetObject;
          staff.state = 'using_object';
          staff.workTimer = obj.duration || 3.5;
          staff.actionLabel = obj.actionText;
          staff.bubble = { text: obj.icon, timer: staff.workTimer };
        }
      } else if (staff.state === 'using_object') {
        staff.workTimer -= simDt;
        if (staff.workTimer <= 0) {
          const obj = staff.targetObject;
          if (obj && obj.need) {
            staff.needs[obj.need] = Math.min(100, staff.needs[obj.need] + obj.amount);
            staff.needs.mood = Math.min(100, staff.needs.mood + 10);
            state.floatingTexts.push({ gx: staff.gx, gy: staff.gy, text: `+${obj.amount} ${obj.icon}`, color: '#10b981', life: 1.5 });
          }
          staff.state = 'idle';
          staff.targetObject = null;
          staff.actionLabel = 'พร้อมทำงานต่อ';
        }
      } else if (staff.state === 'walking_to_treat') {
        const arrived = moveEntityAlongPath(staff, simDt, 3.2 * spdMult);
        if (arrived) {
          const pat = patients.find((p) => p.id === staff.targetPatientId);
          if (!pat) {
            staff.state = 'idle';
          } else if (pat.state === 'in_treatment' || pat.path.length === 0) {
            staff.state = 'treating';
            staff.workTimer = Math.max(1.8, 3.6 / spdMult);
            staff.actionLabel = `กำลัง${staff.targetObject.actionText}: ${pat.name}`;
            staff.bubble = { text: staff.targetObject.icon, timer: staff.workTimer };
            pat.state = 'in_treatment';
            pat.bubble = { text: '⏳', timer: staff.workTimer };
          } else {
            staff.actionLabel = `รอ ${pat.name} เดินมาถึง...`;
          }
        }
      } else if (staff.state === 'treating') {
        staff.workTimer -= simDt;
        if (staff.workTimer <= 0) {
          const pat = patients.find((p) => p.id === staff.targetPatientId);
          if (pat) {
            pat.stepIndex += 1;
            pat.assignedStaffId = null;
            staff.needs.energy = Math.max(5, staff.needs.energy - 4);
            staff.needs.social = Math.min(100, staff.needs.social + 4);
            addStaffXp(staff, 35);

            if (pat.stepIndex >= pat.steps.length) {
              pat.state = 'leaving';
              pat.path = findPath(pat.gx, pat.gy, 0, 6);
              pat.bubble = { text: '💚 ขอบคุณครับ/ค่ะ!', timer: 5 };
              const bonus = (staff.level - 1) * 40;
              const total = pat.reward + bonus;
              state.money += total;
              state.cured += 1;
              playSfx('coin');
              state.floatingTexts.push({ gx: pat.gx, gy: pat.gy, text: `+฿${total} 💚`, color: '#10b981', life: 2.0 });
              logEvent(`รักษา ${pat.name} สำเร็จ! ทีมสหวิชาชีพได้รับ +฿${total}`, 'good');
            } else {
              const nextRole = pat.steps[pat.stepIndex];
              const roleNames = { nurse: 'พยาบาล', doctor: 'แพทย์', mt: 'แล็บ', pt: 'กายภาพ', pharmacist: 'เภสัชกร', dietitian: 'โภชนาการ' };
              pat.state = 'waiting';
              pat.bubble = { text: `รอ${roleNames[nextRole]}`, timer: 4 };
              logEvent(`${staff.name} ส่งต่อ ${pat.name} ไปยัง ${roleNames[nextRole]}`, 'info');
            }
          }
          staff.state = 'idle';
          staff.targetPatientId = null;
          staff.targetObject = null;
          staff.actionLabel = 'เสร็จสิ้นภารกิจ';
          updateQueueUI();
        }
      } else if (staff.state === 'walking_to_chat') {
        if (moveEntityAlongPath(staff, simDt, 2.6 * spdMult)) {
          staff.needs.social = Math.min(100, staff.needs.social + 22);
          staff.needs.mood = Math.min(100, staff.needs.mood + 10);
          staff.bubble = { text: '💬 ปรึกษาเคส!', timer: 3 };
          addStaffXp(staff, 15);
          const peer = staffList.find((o) => o.id === staff.chatPeerId);
          if (peer) {
            peer.needs.social = Math.min(100, peer.needs.social + 18);
            peer.bubble = { text: '💬 เห็นด้วยเลย!', timer: 3 };
          }
          state.floatingTexts.push({ gx: staff.gx, gy: staff.gy, text: '🤝 +ทีมเวิร์ค', color: '#2d9cdb', life: 1.5 });
          staff.state = 'idle';
          staff.actionLabel = 'ปรึกษากับเพื่อนร่วมทีมแล้ว';
        }
      } else if (staff.state === 'walking_to_huddle') {
        if (moveEntityAlongPath(staff, simDt, 3.0 * spdMult)) {
          staff.needs.social = Math.min(100, staff.needs.social + 20);
          staff.needs.mood = Math.min(100, staff.needs.mood + 12);
          staff.bubble = { text: '💡 วางแผนดูแลร่วมกัน!', timer: 3.5 };
          addStaffXp(staff, 20);
          staff.state = 'idle';
          staff.actionLabel = 'ประชุมสหวิชาชีพเสร็จสิ้น';
        }
      }
    }

    for (let i = patients.length - 1; i >= 0; i--) {
      const p = patients[i];
      if (p.bubble) {
        p.bubble.timer -= simDt;
        if (p.bubble.timer <= 0) p.bubble = null;
      }
      if (p.isEmergency && p.state !== 'leaving') {
        p.emergencyTimer -= simDt;
        if (p.emergencyTimer <= 0) {
          p.state = 'leaving';
          p.path = findPath(p.gx, p.gy, 0, 6);
          p.bubble = { text: '😢 ส่งต่อโรงพยาบาลอื่น', timer: 4 };
          state.teamwork = Math.max(10, state.teamwork - 10);
          logEvent(`หมดเวลาเคสฉุกเฉิน ${p.name}!`, 'urgent');
        }
      }

      if (p.state === 'walking_to_wait') {
        if (moveEntityAlongPath(p, simDt, p.isEmergency ? 3.2 : 2.3)) p.state = 'waiting';
      } else if (p.state === 'moving_to_station') {
        if (moveEntityAlongPath(p, simDt, p.isEmergency ? 3.4 : 2.5)) p.state = 'in_treatment';
      } else if (p.state === 'leaving') {
        if (moveEntityAlongPath(p, simDt, 2.6)) {
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

    if (!isStaff && ent.isEmergency) {
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 2 * z, 15 * z, 8 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
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
    ctx.fillText(ent.name, pos.x, pos.y + 16 * z);

    if (isStaff && ent.id === state.selectedStaffId) {
      const avgNeed = (ent.needs.energy + ent.needs.hunger + ent.needs.mood) / 3;
      const pColor = avgNeed > 60 ? '#38c172' : avgNeed > 35 ? '#f59e0b' : '#ef4444';
      drawPlumbob(pos.x, bodyY, pColor);
    }

    if (ent.bubble) {
      const bx = pos.x;
      const by = bodyY - (isStaff && ent.id === state.selectedStaffId ? 76 : 56) * z;
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

  function drawObject(obj, ghost = false) {
    const pos = gridToScreen(obj.gx + 0.5, obj.gy + 0.5);
    const z = camera.zoom;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.6;
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
        const canPlace = !blockedTiles.has(`${gx},${gy}`);
        if (state.buildItem) {
          drawIsoTile(gx, gy, canPlace ? 'rgba(45, 156, 219, 0.35)' : 'rgba(239, 68, 68, 0.35)', canPlace ? '#2d9cdb' : '#ef4444');
          if (canPlace) drawObject({ ...state.buildItem, gx, gy }, true);
        } else {
          drawIsoTile(gx, gy, 'rgba(56, 193, 114, 0.25)', '#38c172');
        }
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

  // UI Sync & Drawers
  function renderShopDrawer() {
    const grid = document.getElementById('shop-items');
    grid.innerHTML = '';
    SHOP_CATALOG.forEach((item) => {
      const btn = document.createElement('button');
      btn.className = `drawer-item ${state.buildItem && state.buildItem.id === item.id ? 'selected' : ''}`;
      btn.innerHTML = `
        <span class="drawer-item-icon">${item.icon}</span>
        <div>
          <div class="drawer-item-title">${item.name}</div>
          <div class="drawer-item-sub">฿${item.price}</div>
        </div>
      `;
      btn.onclick = () => {
        state.buildItem = state.buildItem && state.buildItem.id === item.id ? null : item;
        renderShopDrawer();
      };
      grid.appendChild(btn);
    });
  }

  function renderHireDrawer() {
    const grid = document.getElementById('hire-items');
    grid.innerHTML = '';
    HIRE_CATALOG.forEach((h) => {
      const btn = document.createElement('button');
      btn.className = 'drawer-item';
      btn.innerHTML = `
        <span class="drawer-item-icon">${h.emoji}</span>
        <div>
          <div class="drawer-item-title">${h.roleTitle}</div>
          <div class="drawer-item-sub">จ้าง ฿${h.price}</div>
        </div>
      `;
      btn.onclick = () => {
        if (state.money < h.price) {
          playSfx('alert');
          logEvent(`งบประมาณไม่พอจ้าง ${h.roleTitle} (ต้องการ ฿${h.price})`, 'warn');
          return;
        }
        state.money -= h.price;
        const name = h.names[Math.floor(Math.random() * h.names.length)];
        const newStaff = {
          id: `staff_${state.staffCounter++}`,
          name,
          role: h.role,
          roleTitle: h.roleTitle,
          emoji: h.emoji,
          shirt: h.shirt,
          coat: h.coat,
          hair: '#3a2b25',
          gx: 2 + Math.floor(Math.random() * 4),
          gy: 6,
          level: 1,
          xp: 0,
          needs: { energy: 95, hunger: 90, mood: 95, social: 90 },
          freeWill: true,
          state: 'idle',
          actionLabel: 'เพิ่งเริ่มงาน! พร้อมช่วยทีม',
          path: [],
          bubble: { text: '👋 สวัสดีครับ/ค่ะ!', timer: 4 },
          workTimer: 0,
          targetPatientId: null,
          walkPhase: 0,
        };
        staffList.push(newStaff);
        state.selectedStaffId = newStaff.id;
        playSfx('levelup');
        logEvent(`ต้อนรับสมาชิกใหม่: ${name} (${h.roleTitle})`, 'good');
        document.getElementById('hire-drawer').classList.add('hidden');
        document.getElementById('btn-toggle-hire').classList.remove('active');
        updateHUD();
      };
      grid.appendChild(btn);
    });
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
      list.innerHTML = '<div style="font-size:12px;color:#64748b;">ยังไม่มีผู้ป่วยรอคิว...</div>';
      return;
    }
    const roleIcons = { nurse: '🩺', doctor: '👩‍⚕️', mt: '🔬', pt: '🦴', pharmacist: '💊', dietitian: '🥗' };
    list.innerHTML = patients
      .map((p) => {
        const stepsHtml = p.steps
          .map((st, idx) => {
            const style = idx < p.stepIndex ? 'opacity:0.4;text-decoration:line-through;' : idx === p.stepIndex ? 'font-weight:700;background:#e0f2fe;border-radius:4px;padding:0 3px;' : 'opacity:0.75;';
            return `<span style="${style}">${roleIcons[st] || '🏥'}</span>`;
          })
          .join(' → ');
        const emgTag = p.isEmergency ? `<span style="color:#ef4444;font-weight:700;">⏱${Math.max(0, Math.ceil(p.emergencyTimer))}s</span>` : `<span style="color:#10b981;">฿${p.reward}</span>`;
        return `
          <div class="queue-item ${p.isEmergency ? 'emergency' : ''}">
            <div class="queue-item-top">
              <span>${p.icon} ${p.name}</span>
              ${emgTag}
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
    document.getElementById('stat-money').textContent = `฿${state.money.toLocaleString()}`;
    document.getElementById('stat-cured').textContent = `${state.cured} เคส`;
    document.getElementById('stat-teamwork').textContent = `${state.teamwork}%`;
    document.getElementById('stat-patients').textContent = `${patients.length} คน`;

    const hh = String(Math.floor(state.minutes / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(state.minutes % 60)).padStart(2, '0');
    document.getElementById('game-day').textContent = `วันที่ ${state.day}`;
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
      setNeedBar('need-hunger', staff.needs.hunger);
      setNeedBar('need-mood', staff.needs.mood);
      setNeedBar('need-social', staff.needs.social);

      const cmds = document.getElementById('sim-quick-cmds');
      const station = OBJECTS.find((o) => o.role === staff.role);
      cmds.innerHTML = '';
      if (station) {
        const b = document.createElement('button');
        b.className = 'quick-cmd-btn';
        b.textContent = `${station.icon} ไปประจำจุด`;
        b.onclick = () => commandUseObject(staff, station);
        cmds.appendChild(b);
      }
      ['coffee_machine', 'snack_fridge', 'sofa'].forEach((oid) => {
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
    if (state.buildItem) {
      tooltip.textContent = `วาง ${state.buildItem.icon} ${state.buildItem.name} (฿${state.buildItem.price})`;
      tooltip.style.left = `${e.clientX + 14}px`;
      tooltip.style.top = `${e.clientY + 14}px`;
      tooltip.classList.remove('hidden');
      return;
    }

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

    // Build mode placement
    if (state.buildItem) {
      if (gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H && !blockedTiles.has(`${gx},${gy}`)) {
        if (state.money < state.buildItem.price) {
          playSfx('alert');
          logEvent(`งบไม่พอซื้อ ${state.buildItem.name}`, 'warn');
          return;
        }
        state.money -= state.buildItem.price;
        const placed = {
          ...state.buildItem,
          id: `obj_${state.objCounter++}`,
          gx,
          gy,
          standX: Math.max(0, gx),
          standY: gy + 1 < GRID_H ? gy + 1 : Math.max(0, gy - 1),
          patX: Math.max(0, gx - 1),
          patY: gy,
        };
        OBJECTS.push(placed);
        refreshBlockedTiles();
        playSfx('place');
        state.floatingTexts.push({ gx, gy, text: `-฿${state.buildItem.price} ${state.buildItem.icon}`, color: '#2d9cdb', life: 1.6 });
        logEvent(`วาง ${state.buildItem.name} เรียบร้อย`, 'good');
        updateHUD();
      }
      return;
    }

    // Select staff
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

    // Click object
    const clickedObj = OBJECTS.find((o) => o.gx === gx && o.gy === gy);
    if (clickedObj) {
      commandUseObject(selected, clickedObj);
      playSfx('select');
      updateHUD();
      return;
    }

    // Walk to tile
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

  document.getElementById('toggle-freewill').addEventListener('change', (e) => {
    const s = staffList.find((st) => st.id === state.selectedStaffId);
    if (s) s.freeWill = e.target.checked;
  });

  document.getElementById('btn-toggle-shop').addEventListener('click', () => {
    const d = document.getElementById('shop-drawer');
    const hd = document.getElementById('hire-drawer');
    hd.classList.add('hidden');
    document.getElementById('btn-toggle-hire').classList.remove('active');
    d.classList.toggle('hidden');
    document.getElementById('btn-toggle-shop').classList.toggle('active', !d.classList.contains('hidden'));
    if (d.classList.contains('hidden')) state.buildItem = null;
    renderShopDrawer();
  });

  document.getElementById('btn-close-shop').addEventListener('click', () => {
    document.getElementById('shop-drawer').classList.add('hidden');
    document.getElementById('btn-toggle-shop').classList.remove('active');
    state.buildItem = null;
  });

  document.getElementById('btn-toggle-hire').addEventListener('click', () => {
    const hd = document.getElementById('hire-drawer');
    const sd = document.getElementById('shop-drawer');
    sd.classList.add('hidden');
    document.getElementById('btn-toggle-shop').classList.remove('active');
    state.buildItem = null;
    hd.classList.toggle('hidden');
    document.getElementById('btn-toggle-hire').classList.toggle('active', !hd.classList.contains('hidden'));
    renderHireDrawer();
  });

  document.getElementById('btn-close-hire').addEventListener('click', () => {
    document.getElementById('hire-drawer').classList.add('hidden');
    document.getElementById('btn-toggle-hire').classList.remove('active');
  });

  document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
    soundEnabled = !soundEnabled;
    e.currentTarget.textContent = soundEnabled ? '🔊' : '🔇';
  });

  document.getElementById('btn-spawn-patient').addEventListener('click', () => spawnPatient(false));
  document.getElementById('btn-spawn-emergency').addEventListener('click', () => spawnPatient(true));
  document.getElementById('btn-huddle').addEventListener('click', triggerTeamHuddle);
  document.getElementById('btn-center-cam').addEventListener('click', centerCamera);
  document.getElementById('btn-zoom-in').addEventListener('click', () => { camera.zoom = Math.min(1.8, camera.zoom * 1.15); });
  document.getElementById('btn-zoom-out').addEventListener('click', () => { camera.zoom = Math.max(0.55, camera.zoom * 0.87); });

  // Main loop
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

  logEvent('ยินดีต้อนรับสู่ Hospital Sims! ลองซื้อของตกแต่ง หรือจ้างทีมเพิ่มได้เลย', 'good');
  spawnPatient(false);
  updateHUD();
  requestAnimationFrame(loop);
})();
