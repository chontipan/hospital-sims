(() => {
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  // Isometric constants
  const GRID_W = 18;
  const GRID_H = 14;
  const TILE_W = 64;
  const TILE_H = 32;

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
    minutes: 8 * 60, // 08:00
    money: 12500,
    cured: 0,
    teamwork: 100,
    selectedStaffId: 'doc1',
    hoverTile: null,
    hoverEntity: null,
    hoverObject: null,
    nextPatientTimer: 2.5,
    patientCounter: 1,
    targetMarkers: [], // { gx, gy, life, color }
    floatingTexts: [], // { gx, gy, text, color, life }
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

  // Build walkable grid (0 = walkable, 1 = wall/blocked)
  // Walls are placed on room dividers except doorways
  const blockedTiles = new Set();
  const wallEdges = []; // { x1, y1, x2, y2 } in grid coords for visual walls

  function buildWalls() {
    // Vertical wall between triage (x=5) and doctor (x=6), y=0..4 (door at y=2)
    for (let y = 0; y <= 4; y++) {
      if (y !== 2) wallEdges.push({ x1: 6, y1: y, x2: 6, y2: y + 1 });
    }
    // Vertical wall between doctor (x=11) and lab (x=12), y=0..4 (door at y=2)
    for (let y = 0; y <= 4; y++) {
      if (y !== 2) wallEdges.push({ x1: 12, y1: y, x2: 12, y2: y + 1 });
    }
    // Horizontal wall top rooms y=5, doors at x=2..3, x=8..9, x=14..15
    for (let x = 0; x < GRID_W; x++) {
      const isDoor = (x >= 2 && x <= 3) || (x >= 8 && x <= 9) || (x >= 14 && x <= 15);
      if (!isDoor) wallEdges.push({ x1: x, y1: 5, x2: x + 1, y2: 5 });
    }
    // Horizontal wall bottom rooms y=8, doors at x=2..3, x=8..9, x=14..15
    for (let x = 0; x < GRID_W; x++) {
      const isDoor = (x >= 2 && x <= 3) || (x >= 8 && x <= 9) || (x >= 14 && x <= 15);
      if (!isDoor) wallEdges.push({ x1: x, y1: 8, x2: x + 1, y2: 8 });
    }
    // Vertical wall pharmacy/rehab x=6, y=8..13 (door at y=10)
    for (let y = 8; y <= 13; y++) {
      if (y !== 10) wallEdges.push({ x1: 6, y1: y, x2: 6, y2: y + 1 });
    }
    // Vertical wall rehab/lounge x=12, y=8..13 (door at y=10)
    for (let y = 8; y <= 13; y++) {
      if (y !== 10) wallEdges.push({ x1: 12, y1: y, x2: 12, y2: y + 1 });
    }
  }
  buildWalls();

  function hasWallBetween(x1, y1, x2, y2) {
    if (x2 < 0 || y2 < 0 || x2 >= GRID_W || y2 >= GRID_H) return true;
    // Orthogonal check
    if (x1 !== x2 && y1 !== y2) {
      // Prevent diagonal corner cutting through walls
      return (
        hasWallBetween(x1, y1, x2, y1) ||
        hasWallBetween(x1, y1, x1, y2) ||
        hasWallBetween(x2, y1, x2, y2) ||
        hasWallBetween(x1, y2, x2, y2)
      );
    }
    if (x2 === x1 + 1) {
      return wallEdges.some((w) => w.x1 === x2 && w.x2 === x2 && w.y1 === y1 && w.y2 === y1 + 1);
    }
    if (x2 === x1 - 1) {
      return wallEdges.some((w) => w.x1 === x1 && w.x2 === x1 && w.y1 === y1 && w.y2 === y1 + 1);
    }
    if (y2 === y1 + 1) {
      return wallEdges.some((w) => w.y1 === y2 && w.y2 === y2 && w.x1 === x1 && w.x2 === x1 + 1);
    }
    if (y2 === y1 - 1) {
      return wallEdges.some((w) => w.y1 === y1 && w.y2 === y1 && w.x1 === x1 && w.x2 === x1 + 1);
    }
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
  ];

  // Mark furniture tiles as blocked for pathing (except stand/patient tiles)
  OBJECTS.forEach((o) => {
    if (!o.isWaitSeat && o.id !== 'rehab_mat' && o.id !== 'exam_bed') {
      blockedTiles.add(`${o.gx},${o.gy}`);
    }
  });

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

  // Staff definitions (The 5 Multidisciplinary Professions)
  const staffList = [
    {
      id: 'nurse1',
      name: 'พว. ต้นกล้า',
      role: 'nurse',
      roleTitle: 'พยาบาลวิชาชีพ',
      emoji: '🩺',
      shirt: '#0ea5e9',
      coat: '#e0f2fe',
      hair: '#3b2f2f',
      gx: 3, gy: 3,
      needs: { energy: 88, hunger: 82, mood: 90, social: 85 },
      freeWill: true,
      state: 'idle',
      actionLabel: 'พร้อมคัดกรองผู้ป่วย',
      path: [],
      queue: [],
      bubble: null,
      workTimer: 0,
      targetPatientId: null,
      walkPhase: 0,
    },
    {
      id: 'doc1',
      name: 'พญ. มินตรา',
      role: 'doctor',
      roleTitle: 'แพทย์เวชปฏิบัติ',
      emoji: '👩‍⚕️',
      shirt: '#10b981',
      coat: '#ffffff',
      hair: '#2c1e1e',
      gx: 8, gy: 3,
      needs: { energy: 85, hunger: 78, mood: 88, social: 80 },
      freeWill: true,
      state: 'idle',
      actionLabel: 'พร้อมตรวจวินิจฉัย',
      path: [],
      queue: [],
      bubble: null,
      workTimer: 0,
      targetPatientId: null,
      walkPhase: 0,
    },
    {
      id: 'mt1',
      name: 'ทนพ. เตชินท์',
      role: 'mt',
      roleTitle: 'นักเทคนิคการแพทย์',
      emoji: '🔬',
      shirt: '#8b5cf6',
      coat: '#f5f3ff',
      hair: '#1f2937',
      gx: 14, gy: 3,
      needs: { energy: 92, hunger: 86, mood: 85, social: 75 },
      freeWill: true,
      state: 'idle',
      actionLabel: 'ประจำห้องแล็บ',
      path: [],
      queue: [],
      bubble: null,
      workTimer: 0,
      targetPatientId: null,
      walkPhase: 0,
    },
    {
      id: 'pt1',
      name: 'กภ. ภูมิ',
      role: 'pt',
      roleTitle: 'นักกายภาพบำบัด',
      emoji: '🦴',
      shirt: '#14b8a6',
      coat: '#ccfbf1',
      hair: '#4b3621',
      gx: 8, gy: 10,
      needs: { energy: 90, hunger: 80, mood: 92, social: 88 },
      freeWill: true,
      state: 'idle',
      actionLabel: 'พร้อมฝึกกายภาพ',
      path: [],
      queue: [],
      bubble: null,
      workTimer: 0,
      targetPatientId: null,
      walkPhase: 0,
    },
    {
      id: 'pharm1',
      name: 'ภก. ข้าวฟ่าง',
      role: 'pharmacist',
      roleTitle: 'เภสัชกร',
      emoji: '💊',
      shirt: '#ec4899',
      coat: '#ffffff',
      hair: '#5c3a21',
      gx: 3, gy: 10,
      needs: { energy: 87, hunger: 84, mood: 89, social: 82 },
      freeWill: true,
      state: 'idle',
      actionLabel: 'พร้อมตรวจสอบและจ่ายยา',
      path: [],
      queue: [],
      bubble: null,
      workTimer: 0,
      targetPatientId: null,
      walkPhase: 0,
    },
  ];

  // Case templates requiring multidisciplinary care
  const CASE_TEMPLATES = [
    {
      diagnosis: 'ปวดหลังเรื้อรัง / กล้ามเนื้ออักเสบ',
      icon: '🦴',
      steps: ['nurse', 'doctor', 'pt', 'pharmacist'],
      reward: 520,
    },
    {
      diagnosis: 'ไข้สูง / สงสัยติดเชื้อ',
      icon: '🤒',
      steps: ['nurse', 'doctor', 'mt', 'pharmacist'],
      reward: 480,
    },
    {
      diagnosis: 'ข้อเข่าเสื่อม & ตรวจเบาหวาน',
      icon: '🩺',
      steps: ['nurse', 'doctor', 'mt', 'pt', 'pharmacist'],
      reward: 680,
    },
    {
      diagnosis: 'เวียนศีรษะ / ความดันโลหิตสูง',
      icon: '💓',
      steps: ['nurse', 'doctor', 'pharmacist'],
      reward: 390,
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
    while (el.children.length > 25) {
      el.removeChild(el.lastChild);
    }
  }

  function spawnPatient() {
    if (patients.length >= 6) return;
    const tpl = CASE_TEMPLATES[Math.floor(Math.random() * CASE_TEMPLATES.length)];
    const name = PATIENT_NAMES[Math.floor(Math.random() * PATIENT_NAMES.length)];
    const seatIdx = patients.length % 2;
    const waitSeat = seatIdx === 0 ? { x: 1, y: 2 } : { x: 2, y: 2 };
    const p = {
      id: `pat_${state.patientCounter++}`,
      name,
      diagnosis: tpl.diagnosis,
      icon: tpl.icon,
      steps: [...tpl.steps],
      stepIndex: 0,
      reward: tpl.reward,
      gx: 0,
      gy: 6,
      path: findPath(0, 6, waitSeat.x, waitSeat.y),
      state: 'walking_to_wait', // walking_to_wait, waiting, moving_to_station, in_treatment, leaving
      assignedStaffId: null,
      bubble: { text: tpl.icon, timer: 4 },
      shirt: ['#fb7185', '#fbbf24', '#60a5fa', '#a78bfa', '#34d399'][Math.floor(Math.random() * 5)],
      walkPhase: 0,
    };
    patients.push(p);
    logEvent(`${p.name} เข้ามาตรวจ (${p.diagnosis})`, 'info');
    updateQueueUI();
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
    const gx = (dx + dy) / 2;
    const gy = (dy - dx) / 2;
    return { gx, gy };
  }

  function centerCamera() {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = Math.min(1.15, Math.max(0.65, Math.min(canvas.width / 1280, canvas.height / 760)));
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (camera.zoom === 1 && camera.x === 0 && camera.y === 0) {
      centerCamera();
    }
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Command helpers
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

  // Trigger a multidisciplinary huddle
  function triggerTeamHuddle() {
    const centerSpots = [
      { x: 13, y: 9 },
      { x: 14, y: 10 },
      { x: 13, y: 11 },
      { x: 15, y: 11 },
      { x: 14, y: 9 },
    ];
    staffList.forEach((s, idx) => {
      const spot = centerSpots[idx % centerSpots.length];
      s.path = findPath(s.gx, s.gy, spot.x, spot.y);
      s.state = 'walking_to_huddle';
      s.actionLabel = 'เดินไปประชุมสหวิชาชีพ';
      s.targetObject = null;
      s.targetPatientId = null;
      s.bubble = { text: '🤝', timer: 3.5 };
    });
    state.teamwork = Math.min(100, state.teamwork + 5);
    logEvent('ทีมสหวิชาชีพนัดประชุมปรึกษาเคส (IPE Huddle)', 'good');
  }

  // AI Autonomy loop
  function runStaffAI(staff) {
    if (!staff.freeWill || staff.state !== 'idle') return;

    // 1. Check urgent needs first
    if (staff.needs.energy < 30) {
      const coffee = OBJECTS.find((o) => o.id === 'coffee_machine');
      commandUseObject(staff, coffee);
      return;
    }
    if (staff.needs.hunger < 30) {
      const fridge = OBJECTS.find((o) => o.id === 'snack_fridge');
      commandUseObject(staff, fridge);
      return;
    }
    if (staff.needs.mood < 32) {
      const sofa = OBJECTS.find((o) => o.id === 'sofa');
      commandUseObject(staff, sofa);
      return;
    }

    // 2. Check if any waiting patient needs this staff's profession
    const waitingPat = patients.find(
      (p) =>
        (p.state === 'waiting' || p.state === 'walking_to_wait') &&
        !p.assignedStaffId &&
        p.steps[p.stepIndex] === staff.role
    );
    if (waitingPat) {
      assignStaffToPatient(staff, waitingPat);
      return;
    }

    // 3. Occasional social chat or wandering like The Sims
    if (Math.random() < 0.015) {
      if (staff.needs.social < 70) {
        const peer = staffList.find((o) => o.id !== staff.id && o.state === 'idle');
        if (peer) {
          staff.path = findPath(staff.gx, staff.gy, Math.round(peer.gx), Math.round(peer.gy));
          staff.state = 'walking_to_chat';
          staff.chatPeerId = peer.id;
          staff.actionLabel = `เดินไปคุยปรึกษากับ ${peer.name}`;
          return;
        }
      }
      // Wander near own room
      const room = ROOMS.find((r) =>
        (staff.role === 'nurse' && r.id === 'triage') ||
        (staff.role === 'doctor' && r.id === 'doctor') ||
        (staff.role === 'mt' && r.id === 'lab') ||
        (staff.role === 'pt' && r.id === 'rehab') ||
        (staff.role === 'pharmacist' && r.id === 'pharmacy')
      );
      if (room) {
        const rx = room.x1 + 1 + Math.floor(Math.random() * Math.max(1, room.x2 - room.x1 - 1));
        const ry = room.y1 + 1 + Math.floor(Math.random() * Math.max(1, room.y2 - room.y1 - 1));
        if (!blockedTiles.has(`${rx},${ry}`)) {
          commandWalk(staff, rx, ry, 'เดินสำรวจในแผนก');
        }
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

    // Clock
    state.minutes += simDt * 3.5;
    if (state.minutes >= 24 * 60) {
      state.minutes -= 24 * 60;
      state.day += 1;
    }

    // Spawn patients periodically
    state.nextPatientTimer -= simDt;
    if (state.nextPatientTimer <= 0) {
      spawnPatient();
      state.nextPatientTimer = 10 + Math.random() * 8;
    }

    // Update staff
    for (const staff of staffList) {
      // Decay needs gently
      staff.needs.energy = Math.max(5, staff.needs.energy - simDt * 0.45);
      staff.needs.hunger = Math.max(5, staff.needs.hunger - simDt * 0.38);
      staff.needs.mood = Math.max(10, staff.needs.mood - simDt * 0.25);
      staff.needs.social = Math.max(10, staff.needs.social - simDt * 0.3);

      if (staff.bubble) {
        staff.bubble.timer -= simDt;
        if (staff.bubble.timer <= 0) staff.bubble = null;
      }

      if (staff.state === 'idle') {
        runStaffAI(staff);
      } else if (staff.state === 'walking') {
        if (moveEntityAlongPath(staff, simDt, 2.9)) {
          staff.state = 'idle';
          staff.actionLabel = 'ยืนพัก / พร้อมทำงาน';
        }
      } else if (staff.state === 'walking_to_object') {
        if (moveEntityAlongPath(staff, simDt, 2.9)) {
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
        const arrived = moveEntityAlongPath(staff, simDt, 3.1);
        if (arrived) {
          const pat = patients.find((p) => p.id === staff.targetPatientId);
          if (!pat) {
            staff.state = 'idle';
          } else if (pat.state === 'in_treatment' || pat.path.length === 0) {
            staff.state = 'treating';
            staff.workTimer = 3.8;
            staff.actionLabel = `กำลัง${staff.targetObject.actionText}: ${pat.name}`;
            staff.bubble = { text: staff.targetObject.icon, timer: 3.8 };
            pat.state = 'in_treatment';
            pat.bubble = { text: '⏳', timer: 3.8 };
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

            if (pat.stepIndex >= pat.steps.length) {
              // Patient cured!
              pat.state = 'leaving';
              pat.path = findPath(pat.gx, pat.gy, 0, 6);
              pat.bubble = { text: '💚 ขอบคุณครับ/ค่ะ!', timer: 5 };
              state.money += pat.reward;
              state.cured += 1;
              state.floatingTexts.push({ gx: pat.gx, gy: pat.gy, text: `+฿${pat.reward} 💚`, color: '#10b981', life: 2.0 });
              logEvent(`รักษา ${pat.name} สำเร็จ! ทีมสหวิชาชีพได้รับ +฿${pat.reward}`, 'good');
            } else {
              // Move back to waiting area or wait for next profession
              const nextRole = pat.steps[pat.stepIndex];
              const roleNames = { nurse: 'พยาบาล', doctor: 'แพทย์', mt: 'แล็บ', pt: 'กายภาพ', pharmacist: 'เภสัชกร' };
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
        if (moveEntityAlongPath(staff, simDt, 2.6)) {
          staff.needs.social = Math.min(100, staff.needs.social + 22);
          staff.needs.mood = Math.min(100, staff.needs.mood + 10);
          staff.bubble = { text: '💬 ปรึกษาเคส!', timer: 3 };
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
        if (moveEntityAlongPath(staff, simDt, 3.0)) {
          staff.needs.social = Math.min(100, staff.needs.social + 20);
          staff.needs.mood = Math.min(100, staff.needs.mood + 12);
          staff.bubble = { text: '💡 วางแผนดูแลร่วมกัน!', timer: 3.5 };
          staff.state = 'idle';
          staff.actionLabel = 'ประชุมสหวิชาชีพเสร็จสิ้น';
        }
      }
    }

    // Update patients
    for (let i = patients.length - 1; i >= 0; i--) {
      const p = patients[i];
      if (p.bubble) {
        p.bubble.timer -= simDt;
        if (p.bubble.timer <= 0) p.bubble = null;
      }
      if (p.state === 'walking_to_wait') {
        if (moveEntityAlongPath(p, simDt, 2.3)) {
          p.state = 'waiting';
        }
      } else if (p.state === 'moving_to_station') {
        if (moveEntityAlongPath(p, simDt, 2.5)) {
          p.state = 'in_treatment';
        }
      } else if (p.state === 'leaving') {
        if (moveEntityAlongPath(p, simDt, 2.6)) {
          patients.splice(i, 1);
          updateQueueUI();
        }
      }
    }

    // Update markers & floating texts
    for (let i = state.targetMarkers.length - 1; i >= 0; i--) {
      state.targetMarkers[i].life -= dt * 1.4;
      if (state.targetMarkers[i].life <= 0) state.targetMarkers.splice(i, 1);
    }
    for (let i = state.floatingTexts.length - 1; i >= 0; i--) {
      state.floatingTexts[i].life -= dt;
      if (state.floatingTexts[i].life <= 0) state.floatingTexts.splice(i, 1);
    }
  }

  // Drawing helpers
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
    ctx.fillStyle = 'rgba(15, 35, 50, 0.2)';
    ctx.fill();

    // Selection ring
    if (isStaff && ent.id === state.selectedStaffId) {
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 2 * z, 16 * z, 9 * z, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#38c172';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    // Body / Coat
    const bodyY = pos.y - bob;
    ctx.fillStyle = isStaff ? ent.coat : ent.shirt;
    ctx.strokeStyle = '#1e3a4c';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(pos.x - 8 * z, bodyY - 26 * z, 16 * z, 22 * z, 6 * z);
    ctx.fill();
    ctx.stroke();

    // Inner shirt / scrubs accent
    if (isStaff) {
      ctx.fillStyle = ent.shirt;
      ctx.fillRect(pos.x - 3 * z, bodyY - 24 * z, 6 * z, 12 * z);
    }

    // Head
    ctx.beginPath();
    ctx.arc(pos.x, bodyY - 33 * z, 8.5 * z, 0, Math.PI * 2);
    ctx.fillStyle = '#fde2c8';
    ctx.fill();
    ctx.stroke();

    // Hair
    ctx.beginPath();
    ctx.arc(pos.x, bodyY - 35 * z, 8.5 * z, Math.PI, Math.PI * 2);
    ctx.fillStyle = ent.hair || '#3a2b25';
    ctx.fill();

    // Name tag
    ctx.font = `600 ${Math.max(10, Math.round(11 * z))}px Prompt, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isStaff ? '#0f293a' : '#475569';
    ctx.fillText(ent.name, pos.x, pos.y + 16 * z);

    // Plumbob for selected staff
    if (isStaff && ent.id === state.selectedStaffId) {
      const avgNeed = (ent.needs.energy + ent.needs.hunger + ent.needs.mood) / 3;
      const pColor = avgNeed > 60 ? '#38c172' : avgNeed > 35 ? '#f59e0b' : '#ef4444';
      drawPlumbob(pos.x, bodyY, pColor);
    }

    // Thought / speech bubble
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

  function drawObject(obj) {
    const pos = gridToScreen(obj.gx + 0.5, obj.gy + 0.5);
    const z = camera.zoom;

    // Base block
    ctx.save();
    ctx.fillStyle = obj.color;
    ctx.strokeStyle = 'rgba(15, 35, 50, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(pos.x - 16 * z, pos.y - 20 * z, 32 * z, 22 * z, 6 * z);
    ctx.fill();
    ctx.stroke();

    // Icon
    ctx.font = `${Math.round(18 * z)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obj.icon, pos.x, pos.y - 10 * z);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw floor tiles per room
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const room = ROOMS.find((r) => x >= r.x1 && x <= r.x2 && y >= r.y1 && y <= r.y2) || ROOMS[3];
        drawIsoTile(x, y, room.floor, room.border);
      }
    }

    // Hover tile highlight
    if (state.hoverTile) {
      const { gx, gy } = state.hoverTile;
      if (gx >= 0 && gy >= 0 && gx < GRID_W && gy < GRID_H) {
        drawIsoTile(gx, gy, 'rgba(56, 193, 114, 0.25)', '#38c172');
      }
    }

    // Target walk markers
    for (const m of state.targetMarkers) {
      const p = gridToScreen(m.gx + 0.5, m.gy + 0.5);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 14 * camera.zoom * m.life, 7 * camera.zoom * m.life, 0, 0, Math.PI * 2);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Room labels
    ctx.save();
    ctx.font = `600 ${Math.round(12 * camera.zoom)}px Prompt, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(24, 48, 66, 0.45)';
    for (const r of ROOMS) {
      const mid = gridToScreen((r.x1 + r.x2 + 1) / 2, (r.y1 + r.y2 + 1) / 2);
      ctx.fillText(r.name, mid.x, mid.y);
    }
    ctx.restore();

    // Walls
    drawWalls();

    // Depth-sorted renderables (Objects + Staff + Patients)
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

    // Floating texts
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
    const roleIcons = { nurse: '🩺', doctor: '👩‍⚕️', mt: '🔬', pt: '🦴', pharmacist: '💊' };
    list.innerHTML = patients
      .map((p) => {
        const stepsHtml = p.steps
          .map((st, idx) => {
            const done = idx < p.stepIndex ? 'opacity:0.4;text-decoration:line-through;' : idx === p.stepIndex ? 'font-weight:700;background:#e0f2fe;border-radius:4px;padding:0 3px;' : 'opacity:0.75;';
            return `<span style="${done}">${roleIcons[st]}</span>`;
          })
          .join(' → ');
        return `
          <div class="queue-item">
            <div class="queue-item-top">
              <span>${p.icon} ${p.name}</span>
              <span style="color:#10b981;">฿${p.reward}</span>
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
      document.getElementById('selected-action').textContent = staff.actionLabel;
      document.getElementById('toggle-freewill').checked = staff.freeWill;

      setNeedBar('need-energy', staff.needs.energy);
      setNeedBar('need-hunger', staff.needs.hunger);
      setNeedBar('need-mood', staff.needs.mood);
      setNeedBar('need-social', staff.needs.social);

      // Quick command buttons for selected staff
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
        const b = document.createElement('button');
        b.className = 'quick-cmd-btn';
        b.textContent = `${obj.icon} ${obj.name}`;
        b.onclick = () => commandUseObject(staff, obj);
        cmds.appendChild(b);
      });
    }
    renderRoster();
  }

  // Input handling (Click to select, Click to walk/interact, Drag to pan, Wheel to zoom)
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

    // Tooltip check
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

    // 1. Did user click a staff member?
    const clickedStaff = staffList.find((s) => {
      const p = gridToScreen(s.gx + 0.5, s.gy + 0.5);
      return Math.hypot(e.clientX - p.x, e.clientY - (p.y - 16 * camera.zoom)) < 22 * camera.zoom;
    });
    if (clickedStaff) {
      state.selectedStaffId = clickedStaff.id;
      updateHUD();
      return;
    }

    const selected = staffList.find((s) => s.id === state.selectedStaffId);
    if (!selected) return;

    // 2. Did user click an interactive object?
    const clickedObj = OBJECTS.find((o) => o.gx === gx && o.gy === gy);
    if (clickedObj) {
      commandUseObject(selected, clickedObj);
      updateHUD();
      return;
    }

    // 3. Otherwise walk to floor tile
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

  document.getElementById('btn-spawn-patient').addEventListener('click', spawnPatient);
  document.getElementById('btn-huddle').addEventListener('click', triggerTeamHuddle);
  document.getElementById('btn-center-cam').addEventListener('click', centerCamera);
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    camera.zoom = Math.min(1.8, camera.zoom * 1.15);
  });
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    camera.zoom = Math.max(0.55, camera.zoom * 0.87);
  });

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
    }
    requestAnimationFrame(loop);
  }

  // Initial setup
  logEvent('ยินดีต้อนรับสู่ Hospital Sims: ทีมสหวิชาชีพโรงพยาบาล!', 'good');
  spawnPatient();
  updateHUD();
  requestAnimationFrame(loop);
})();
