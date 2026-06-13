const dateStrip = document.getElementById("dateStrip");
const dateTopBar = document.getElementById("dateTopBar");
const scheduleContent = document.getElementById("schedule-content");
const toast = document.getElementById("toast");
const appShell = document.getElementById("main-content");
const aiDetailPage = document.getElementById("aiDetailPage");
const menuAnchor = document.getElementById("menuAnchor");
const menuButton = document.getElementById("menuButton");
const menuPopup = document.getElementById("menuPopup");
const menuBackdrop = document.getElementById("menuBackdrop");
const menuViewStage = menuPopup?.querySelector(".menu-view-stage");
const mainMenuPanel = document.getElementById("mainMenuPanel");
const themeMenuPanel = document.getElementById("themeMenuPanel");
const themeBackButton = document.getElementById("themeBackButton");
const qrModal = document.getElementById("qrModal");
const qrModalImage = document.getElementById("qrModalImage");
const qrCopyButton = document.getElementById("qrCopyButton");

let scheduleDays = [];
let selectedDateKey = "";
let toastTimer;
let isScheduleTransitioning = false;
let entrancePlayed = false;
let clickBlockUntil = 0;
const imageCache = new Map();
let activeImageKind = "";
const preloadImageKinds = ["contact", "draw", "homework"];
const imageMetaStorageKey = "qtcDailyImageCache:v1";
const imageMetaCacheTtl = 30 * 24 * 60 * 60 * 1000;
let contactImageReady = null;
const scheduleMarkupCache = new Map();
const schedulePageCache = new Map();
const themeChoiceStorageKey = "tc-theme";
const defaultThemeKey = "deep-blue";
const supportedThemeKeys = new Set(["deep-blue", "tech-cyan", "green", "soft-light"]);
let activeAiDetailMatch = null;
let activeAiDetailDay = null;
let menuResetTimer;
const dateOffsets = [-4, -3, -2, -1, 0, 1];
const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const gestureIntentDistance = 8;
const horizontalGestureRatio = 1.25;
const dateSwitchDistance = 45;
const swipeMaxPull = 92;
const swipeVelocityCommit = 0.55;
const pageTransitionMs = 340;

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateInfo(date) {
  return {
    dateKey: localDateKey(date),
    dateLabel: `${date.getMonth() + 1}月${date.getDate()}日`,
    dayNumber: String(date.getDate()),
    dayOfWeek: weekNames[date.getDay()],
  };
}

function nearbyDates() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return dateOffsets.map((offset) => {
    const item = new Date(today);
    item.setDate(today.getDate() + offset);
    return dateInfo(item);
  });
}

// 静态 AI 详情页使用本地 mock 数据，不调用真实 AI 接口，方便先把页面结构和主题效果稳定下来。
const aiResultLabelMap = Object.freeze({
  win: "胜",
  draw: "平",
  loss: "负",
});

const aiResultToneMap = Object.freeze({
  win: "result-win",
  draw: "result-draw",
  loss: "result-loss",
});

const aiModelBlueprints = Object.freeze([
  { modelName: "ChatGPT", result: "win", fullScore: "2-1", halfScore: "1-0" },
  { modelName: "Claude", result: "draw", fullScore: "1-1", halfScore: "0-0" },
  { modelName: "Gemini", result: "win", fullScore: "2-0", halfScore: "1-0" },
  { modelName: "Grok", result: "loss", fullScore: "1-2", halfScore: "0-1" },
  { modelName: "DeepSeek", result: "win", fullScore: "3-1", halfScore: "1-1" },
  { modelName: "豆包", result: "draw", fullScore: "2-2", halfScore: "1-1" },
]);

function kickoffIsoFor(dateKey, timeText) {
  const [hour = "00", minute = "00"] = String(timeText || "00:00").split(":");
  return `${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+08:00`;
}

function mockMatch(day, matchNo, league, time, home, away) {
  return {
    matchNo,
    league,
    dateKey: day.dateKey,
    time,
    kickoff: kickoffIsoFor(day.dateKey, time),
    kickoffDisplay: `${day.dateKey} ${time}`,
    home,
    away,
  };
}

function mockScheduleDays() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const dayA = dateInfo(today);
  const dayB = dateInfo(tomorrow);
  const dayAPrefix = weekNames[today.getDay()];
  const dayBPrefix = weekNames[tomorrow.getDay()];

  return [
    {
      ...dayA,
      matches: [
        mockMatch(dayA, `${dayAPrefix}006`, "世界杯", "06:00", "巴西", "摩洛哥"),
        mockMatch(dayA, `${dayAPrefix}008`, "友谊赛", "09:30", "卡塔尔", "瑞士"),
        mockMatch(dayA, `${dayAPrefix}009`, "国际赛", "12:00", "海地", "苏格兰"),
      ],
    },
    {
      ...dayB,
      matches: [
        mockMatch(dayB, `${dayBPrefix}003`, "世界杯", "03:00", "墨西哥", "南非"),
      ],
    },
  ];
}

function hasAnyScheduleMatch(days) {
  return Array.isArray(days) && days.some((day) => Array.isArray(day.matches) && day.matches.length > 0);
}

function aiReportsForMatch(match) {
  if (Array.isArray(match?.aiReports) && match.aiReports.length) return match.aiReports;

  const home = match?.home || "主队";
  const away = match?.away || "客队";
  const league = match?.league || "赛事";

  return aiModelBlueprints.map((item, index) => {
    const resultLabel = aiResultLabelMap[item.result] || "平";
    const direction =
      item.result === "win"
        ? `${home}不败倾向更强`
        : item.result === "loss"
          ? `${away}反击效率更值得防范`
          : "双方节奏接近，平局权重上升";

    return {
      ...item,
      summary: `${item.modelName} 倾向${resultLabel}，重点参考${league}赛程强度、攻守转换速度和临场阵容完整度。`,
      reportSections: [
        {
          title: "A 核心判断",
          body: `${direction}。模型把主队控球稳定性、客队防线回收质量和比赛节奏作为核心判断依据。`,
        },
        {
          title: "B 比分逻辑",
          body: `全场比分参考 ${item.fullScore}。若前 30 分钟出现快速进球，比赛会更接近开放式对攻；若节奏偏慢，小比分概率提高。`,
        },
        {
          title: "C 半场逻辑",
          body: `半场比分参考 ${item.halfScore}。上半场更看重双方试探阶段的压迫强度和定位球机会。`,
        },
        {
          title: "D 关键数据依据",
          body: `综合最近赛程密度、进攻三区触球、失误后的回防速度，以及主客身份带来的节奏差异。第 ${index + 1} 套模型权重偏向稳定性。`,
        },
        {
          title: "E 风险提示",
          body: "赛前首发、天气、临场战术和红黄牌都会显著改变走势，任何单一模型结论都不应单独使用。",
        },
        {
          title: "F 赛前更新建议",
          body: "开赛前 30 分钟重点复核首发名单、赔率波动和伤停更新，再决定是否调整比分和胜平负方向。",
        },
      ],
    };
  });
}

function playEntrance() {
  if (entrancePlayed) return;
  entrancePlayed = true;

  const cards = Array.from(scheduleContent.querySelectorAll(".match-card"));
  if (!cards.length) return;

  cards.forEach((card) => {
    card.classList.remove("reveal-delay-1", "reveal-delay-2", "reveal-delay-3", "reveal-delay-4", "reveal-delay-5");
    card.classList.add("anim-entrance");
  });

  cards.forEach((card, i) => {
    gsapAnimate(
      700,
      gsapEasing.power2Out,
      (t) => {
        card.style.opacity = String(t);
        card.style.transform = `translate3d(0, ${30 * (1 - t)}px, 0)`;
      },
      () => {
        card.classList.remove("anim-entrance");
        card.style.opacity = "";
        card.style.transform = "";
      },
      i * 100,
    );
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showToast(message = "数据已更新") {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
}

function readImageMetaStore() {
  try {
    return JSON.parse(localStorage.getItem(imageMetaStorageKey) || "{}");
  } catch (error) {
    return {};
  }
}

function writeImageMetaStore(store) {
  try {
    localStorage.setItem(imageMetaStorageKey, JSON.stringify(store));
  } catch (error) {}
}

function cachedImageMeta(kind) {
  const store = readImageMetaStore();
  const item = store[kind];
  if (!item?.url || !item.expiresAt || Date.now() > item.expiresAt) {
    if (item) {
      delete store[kind];
      writeImageMetaStore(store);
    }
    return null;
  }
  return item;
}

function saveImageMetaCache(kind, image) {
  if (!image?.found || !image.url) return;
  const store = readImageMetaStore();
  store[kind] = {
    found: true,
    kind,
    name: image.name || "",
    url: image.url,
    expiresAt: Date.now() + imageMetaCacheTtl,
  };
  writeImageMetaStore(store);
}

function applyCachedContactImage() {
  const cached = cachedImageMeta("contact");
  if (!cached?.url) return null;
  imageCache.set("contact", cached);
  return cached;
}

async function latestImage(kind) {
  const response = await fetch(`/api/image/latest?kind=${encodeURIComponent(kind)}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function preloadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (image.decode) {
        image.decode().then(() => resolve(url)).catch(() => resolve(url));
      } else {
        resolve(url);
      }
    };
    image.onerror = reject;
    image.src = url;
  });
}

async function refreshImageCache(kind) {
  const image = await latestImage(kind);
  if (!image.found) {
    imageCache.set(kind, image);
    return image;
  }

  await preloadImage(image.url);
  imageCache.set(kind, image);
  saveImageMetaCache(kind, image);

  if (qrModal.classList.contains("open") && activeImageKind === kind) {
    qrModalImage.src = image.url;
  }

  return image;
}

function ensureContactImageReady() {
  applyCachedContactImage();
  if (!contactImageReady) {
    contactImageReady = refreshImageCache("contact").catch(() => null);
  }
  return contactImageReady;
}

function scheduleImagePreload() {
  ensureContactImageReady();

  const preload = () => {
    preloadImageKinds.filter((kind) => kind !== "contact").forEach((kind, index) => {
      window.setTimeout(() => {
        refreshImageCache(kind).catch(() => {});
      }, index * 350);
    });
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(preload, { timeout: 2500 });
  } else {
    window.setTimeout(preload, 800);
  }
}

function chooseDefaultDate(days) {
  return localDateKey();
}

function dateItems() {
  return nearbyDates();
}

function dateIndex(dateKey) {
  return dateItems().findIndex((item) => item.dateKey === dateKey);
}

function validDateKey(dateKey) {
  return dateIndex(dateKey) !== -1;
}

function dayForDate(dateKey) {
  return scheduleDays.find((item) => item.dateKey === dateKey);
}

function centerDateChip(dateKey, { behavior = "smooth" } = {}) {
  const chip = dateStrip.querySelector(`.date-chip[data-date="${CSS.escape(dateKey)}"]`);
  if (!chip) return;

  const targetLeft = Math.max(0, chip.offsetLeft - (dateStrip.clientWidth - chip.offsetWidth) / 2);
  if (behavior === "auto") {
    dateStrip.scrollLeft = targetLeft;
  } else {
    smoothCenterTo(dateStrip, targetLeft, 400);
  }
}

function setDateChipActive(dateKey) {
  dateStrip.querySelectorAll(".date-chip").forEach((chip) => {
    const isActive = chip.dataset.date === dateKey;
    chip.classList.toggle("active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function preloadScheduleDate(dateKey) {
  if (!validDateKey(dateKey) || scheduleMarkupCache.has(dateKey)) return;
  scheduleMarkupCache.set(dateKey, scheduleMarkupForDate(dateKey));
}

function preloadAdjacentSchedules(dateKey) {
  const index = dateIndex(dateKey);
  if (index < 0) return;
  const dates = dateItems();
  [index - 1, index + 1].forEach((nextIndex) => {
    const item = dates[nextIndex];
    if (item) preloadScheduleDate(item.dateKey);
  });
}

function showTodaySchedule() {
  dateTopBar.style.display = "";
  selectDate(localDateKey(), { animate: false, center: true, scrollTop: true, force: true });
}

function buildDateStrip({ alignActive = true } = {}) {
  const dates = dateItems();
  if (!dates.some((day) => day.dateKey === selectedDateKey)) {
    selectedDateKey = chooseDefaultDate(scheduleDays);
  }

  dateStrip.innerHTML = `
    <span class="date-edge-spacer" aria-hidden="true"></span>
    ${dates
    .map((day) => {
      const isActive = day.dateKey === selectedDateKey;
      const isToday = day.dateKey === localDateKey();
      const className = ["date-chip", isActive ? "active" : "", isToday ? "today" : ""].filter(Boolean).join(" ");
      return `
        <button class="${className}" type="button" data-date="${escapeHtml(day.dateKey)}" aria-pressed="${isActive ? "true" : "false"}">
          <span class="day">${escapeHtml(day.dayNumber)}</span>
          <span class="sub">${escapeHtml(day.dayOfWeek)}</span>
        </button>
      `;
    })
    .join("")}
    <span class="date-edge-spacer" aria-hidden="true"></span>
  `;

  bindDateChipClicks();

  if (alignActive) {
    requestAnimationFrame(() => centerDateChip(selectedDateKey, { behavior: "auto" }));
  }
}

function renderMatchNo(raw) {
  if (!raw) return '<span class="match-no">未编号</span>';
  const m = String(raw).match(/^(周[一二三四五六日])(\d+)$/);
  if (!m) return `<span class="match-no">${escapeHtml(String(raw))}</span>`;
  return `<span class="match-no">${escapeHtml(m[1])}${escapeHtml(m[2])}</span>`;
}

function scoreHtml(match) {
  const displayScore = match.fullScore || match.currentScore || "";
  const rawHalf = match.halfScore || match.apiHalfTimeScore || match.manualHalfTimeScore || "";
  const hp = String(rawHalf).match(/(\d+)\D+(\d+)/);
  const halfScore = hp ? `${hp[1]}∶${hp[2]}` : rawHalf;
  const parts = String(displayScore).match(/(\d+)\D+(\d+)/);

  if (!displayScore || !parts) {
    return '<span class="score vs">VS</span>';
  }

  return `
    <div class="score-line">
      <span class="score">${escapeHtml(match.homeScore || parts[1])}</span>
      <span class="score-mid">
        <span class="score-divider">∶</span>
        ${halfScore ? `<span class="half-score"><span class="half-num">${escapeHtml(halfScore)}</span></span>` : ""}
      </span>
      <span class="score">${escapeHtml(match.awayScore || parts[2])}</span>
    </div>
  `;
}

function statusClass(status) {
  if (status === "已结束") return "finished";
  if (status === "上半场" || status === "半场结束" || status === "下半场" || status === "加时/点球中") return "live";
  if (status === "延期" || status === "取消" || status === "异常") return "warning";
  return "upcoming";
}

function matchStatusHtml(match) {
  const status = match.matchStatus || "";
  const hasFullScore = !!(match.fullScore && match.fullScore.trim());
  if (status === "已结束" || hasFullScore) return '<span class="match-status finished">已结束</span>';
  if (status === "上半场" || status === "下半场" || status === "半场结束" || status === "加时/点球中") return '<span class="match-status live">进行中</span>';
  if (status === "延期" || status === "取消" || status === "异常") return `<span class="match-status warning">${escapeHtml(status)}</span>`;
  return "";
}

function compactKickoffDateTime(match, day) {
  const kickoffDisplay = String(match.kickoffDisplay || "").trim();
  if (kickoffDisplay) {
    const normalized = kickoffDisplay.replace("：", ":");
    const fullDate = normalized.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/);
    if (fullDate) {
      const [, , month, date, hour, minute] = fullDate;
      return `${Number(month)}-${Number(date)} ${String(Number(hour)).padStart(2, "0")}:${minute}`;
    }

    const shortDate = normalized.match(/^(\d{1,2})(?:-|月)(\d{1,2})(?:日)?\s+(\d{1,2}):(\d{2})/);
    if (shortDate) {
      const [, month, date, hour, minute] = shortDate;
      return `${Number(month)}-${Number(date)} ${String(Number(hour)).padStart(2, "0")}:${minute}`;
    }

    return normalized;
  }

  if (match.kickoff) {
    const kickoff = new Date(match.kickoff);
    if (!Number.isNaN(kickoff.getTime())) {
      const month = kickoff.getMonth() + 1;
      const date = kickoff.getDate();
      const hour = String(kickoff.getHours()).padStart(2, "0");
      const minute = String(kickoff.getMinutes()).padStart(2, "0");
      return `${month}-${date} ${hour}:${minute}`;
    }
  }

  return `${day.dateLabel.replace("月", "-").replace("日", "")} ${match.time}`;
}

const teamNameAliases = Object.freeze({
  中国: ["China", "China PR"],
  中国香港: ["Hong Kong", "Hong Kong China"],
  中国澳门: ["Macau", "Macao"],
  中华台北: ["Chinese Taipei", "Taiwan"],
  日本: ["Japan"],
  韩国: ["South Korea", "Korea Republic"],
  朝鲜: ["North Korea", "Korea DPR"],
  澳大利亚: ["Australia"],
  新西兰: ["New Zealand"],
  新加坡: ["Singapore"],
  泰国: ["Thailand"],
  越南: ["Vietnam"],
  马来西亚: ["Malaysia"],
  印尼: ["Indonesia"],
  印度尼西亚: ["Indonesia"],
  菲律宾: ["Philippines"],
  缅甸: ["Myanmar"],
  柬埔寨: ["Cambodia"],
  老挝: ["Laos"],
  印度: ["India"],
  巴基斯坦: ["Pakistan"],
  孟加拉国: ["Bangladesh"],
  伊朗: ["Iran"],
  伊拉克: ["Iraq"],
  沙特: ["Saudi Arabia"],
  沙特阿拉伯: ["Saudi Arabia"],
  卡塔尔: ["Qatar"],
  阿联酋: ["United Arab Emirates", "UAE"],
  阿曼: ["Oman"],
  科威特: ["Kuwait"],
  巴林: ["Bahrain"],
  约旦: ["Jordan"],
  叙利亚: ["Syria"],
  黎巴嫩: ["Lebanon"],
  巴勒斯坦: ["Palestine"],
  以色列: ["Israel"],
  也门: ["Yemen"],
  乌兹别克: ["Uzbekistan"],
  乌兹别克斯坦: ["Uzbekistan"],
  哈萨克: ["Kazakhstan"],
  哈萨克斯坦: ["Kazakhstan"],
  吉尔吉斯: ["Kyrgyzstan"],
  吉尔吉斯斯坦: ["Kyrgyzstan"],
  塔吉克: ["Tajikistan"],
  塔吉克斯坦: ["Tajikistan"],
  土库曼: ["Turkmenistan"],
  土库曼斯坦: ["Turkmenistan"],
  英格兰: ["England"],
  苏格兰: ["Scotland"],
  威尔士: ["Wales"],
  北爱尔兰: ["Northern Ireland"],
  爱尔兰: ["Ireland", "Republic of Ireland"],
  法国: ["France"],
  德国: ["Germany"],
  意大利: ["Italy"],
  西班牙: ["Spain"],
  葡萄牙: ["Portugal"],
  荷兰: ["Netherlands", "Holland"],
  比利时: ["Belgium"],
  瑞士: ["Switzerland"],
  奥地利: ["Austria"],
  丹麦: ["Denmark"],
  瑞典: ["Sweden"],
  挪威: ["Norway"],
  芬兰: ["Finland"],
  冰岛: ["Iceland"],
  波兰: ["Poland"],
  捷克: ["Czech Republic", "Czechia"],
  斯洛伐克: ["Slovakia"],
  匈牙利: ["Hungary"],
  罗马尼亚: ["Romania"],
  保加利亚: ["Bulgaria"],
  克罗地亚: ["Croatia"],
  塞尔维亚: ["Serbia"],
  黑山: ["Montenegro"],
  波黑: ["Bosnia and Herzegovina", "Bosnia"],
  斯洛文尼亚: ["Slovenia"],
  阿尔巴尼亚: ["Albania"],
  北马其顿: ["North Macedonia", "Macedonia"],
  希腊: ["Greece"],
  土耳其: ["Turkey", "Turkiye"],
  乌克兰: ["Ukraine"],
  俄罗斯: ["Russia"],
  白俄罗斯: ["Belarus"],
  格鲁吉亚: ["Georgia"],
  亚美尼亚: ["Armenia"],
  阿塞拜疆: ["Azerbaijan"],
  立陶宛: ["Lithuania"],
  拉脱维亚: ["Latvia"],
  爱沙尼亚: ["Estonia"],
  摩尔多瓦: ["Moldova"],
  卢森堡: ["Luxembourg"],
  以色列队: ["Israel"],
  巴西: ["Brazil"],
  阿根廷: ["Argentina"],
  乌拉圭: ["Uruguay"],
  哥伦比亚: ["Colombia"],
  智利: ["Chile"],
  秘鲁: ["Peru"],
  巴拉圭: ["Paraguay"],
  玻利维亚: ["Bolivia"],
  厄瓜多尔: ["Ecuador"],
  委内瑞拉: ["Venezuela"],
  美国: ["United States", "USA"],
  加拿大: ["Canada"],
  墨西哥: ["Mexico"],
  巴拿马: ["Panama"],
  洪都拉斯: ["Honduras"],
  哥斯达黎加: ["Costa Rica"],
  萨尔瓦多: ["El Salvador"],
  危地马拉: ["Guatemala"],
  牙买加: ["Jamaica"],
  海地: ["Haiti"],
  古巴: ["Cuba"],
  埃及: ["Egypt"],
  摩洛哥: ["Morocco"],
  突尼斯: ["Tunisia"],
  阿尔及利亚: ["Algeria"],
  尼日利亚: ["Nigeria"],
  加纳: ["Ghana"],
  喀麦隆: ["Cameroon"],
  科特迪瓦: ["Ivory Coast", "Cote d'Ivoire"],
  塞内加尔: ["Senegal"],
  南非: ["South Africa"],
  马里: ["Mali"],
  几内亚: ["Guinea"],
  刚果: ["Congo"],
  民主刚果: ["DR Congo", "Congo DR"],
  肯尼亚: ["Kenya"],
  鹿岛鹿角: ["Kashima Antlers"],
  浦和红钻: ["Urawa Red Diamonds", "Urawa Reds"],
  柏太阳神: ["Kashiwa Reysol"],
  川崎前锋: ["Kawasaki Frontale"],
  横滨水手: ["Yokohama F. Marinos", "Yokohama F Marinos", "Yokohama Marinos"],
  清水鼓动: ["Shimizu S-Pulse", "Shimizu S Pulse"],
  町田泽维: ["Machida Zelvia", "FC Machida Zelvia"],
  町田泽维亚: ["Machida Zelvia", "FC Machida Zelvia"],
  神户胜利: ["Vissel Kobe"],
  神户胜利船: ["Vissel Kobe"],
  名古屋鲸: ["Nagoya Grampus"],
  名古屋鲸八: ["Nagoya Grampus"],
  冈山绿雉: ["Fagiano Okayama"],
  新泻天鹅: ["Albirex Niigata"],
  京都: ["Kyoto Sanga", "Kyoto Sanga FC"],
  京都不死鸟: ["Kyoto Sanga", "Kyoto Sanga FC"],
  福冈: ["Avispa Fukuoka"],
  福冈黄蜂: ["Avispa Fukuoka"],
  大阪钢巴: ["Gamba Osaka"],
  大阪樱花: ["Cerezo Osaka"],
  广岛三箭: ["Sanfrecce Hiroshima"],
  东京FC: ["FC Tokyo"],
  FC东京: ["FC Tokyo"],
  鸟栖砂岩: ["Sagan Tosu"],
  磐田喜悦: ["Jubilo Iwata"],
  湘南海洋: ["Shonan Bellmare"],
  札幌冈萨多: ["Hokkaido Consadole Sapporo", "Consadole Sapporo"],
  东京绿茵: ["Tokyo Verdy"],
  横滨FC: ["Yokohama FC"],
  长崎航海: ["V-Varen Nagasaki", "V Varen Nagasaki"],
  仙台七夕: ["Vegalta Sendai"],
  千叶市原: ["JEF United Chiba", "JEF Chiba"],
  大宫松鼠: ["Omiya Ardija"],
  甲府风林: ["Ventforet Kofu"],
  山形山神: ["Montedio Yamagata"],
  德岛漩涡: ["Tokushima Vortis"],
  熊本深红: ["Roasso Kumamoto"],
  水户蜀葵: ["Mito HollyHock", "Mito Hollyhock"],
  枥木SC: ["Tochigi SC"],
  山口雷法: ["Renofa Yamaguchi"],
  爱媛FC: ["Ehime FC"],
  大分三神: ["Oita Trinita"],
  鹿儿岛联: ["Kagoshima United"],
  秋田蓝闪电: ["Blaublitz Akita"],
  群马草津温泉: ["Thespakusatsu Gunma", "Thespa Gunma"],
  藤枝MYFC: ["Fujieda MYFC"],
  松本山雅: ["Matsumoto Yamaga"],
  富山胜利: ["Kataller Toyama"],
  今治FC: ["FC Imabari"],
  沼津青蓝: ["Azul Claro Numazu"],
  上海海港: ["Shanghai Port"],
  上海申花: ["Shanghai Shenhua"],
  山东泰山: ["Shandong Taishan"],
  北京国安: ["Beijing Guoan"],
  广州队: ["Guangzhou FC", "Guangzhou"],
  成都蓉城: ["Chengdu Rongcheng"],
  武汉三镇: ["Wuhan Three Towns"],
  浙江队: ["Zhejiang FC"],
  河南队: ["Henan FC"],
  天津津门虎: ["Tianjin Jinmen Tiger"],
  长春亚泰: ["Changchun Yatai"],
  深圳新鹏城: ["Shenzhen Peng City"],
  青岛海牛: ["Qingdao Hainiu"],
  梅州客家: ["Meizhou Hakka"],
  大连英博: ["Dalian Yingbo"],
  皇家马德里: ["Real Madrid"],
  巴塞罗那: ["Barcelona", "FC Barcelona"],
  马德里竞技: ["Atletico Madrid"],
  曼城: ["Manchester City"],
  曼联: ["Manchester United"],
  利物浦: ["Liverpool"],
  切尔西: ["Chelsea"],
  阿森纳: ["Arsenal"],
  热刺: ["Tottenham Hotspur", "Tottenham"],
  拜仁: ["Bayern Munich", "FC Bayern Munich"],
  多特蒙德: ["Borussia Dortmund", "Dortmund"],
  尤文图斯: ["Juventus"],
  国际米兰: ["Inter Milan", "Internazionale"],
  AC米兰: ["AC Milan"],
  巴黎圣日耳曼: ["Paris Saint-Germain", "PSG"],
});

const jcTeamNameAliases = Object.freeze({
  青岛西海岸: ["Qingdao West Coast"],
  云南玉昆: ["Yunnan Yukun"],
  纽卡斯尔: ["Newcastle United"],
  阿斯顿维拉: ["Aston Villa"],
  埃弗顿: ["Everton"],
  西汉姆联: ["West Ham United"],
  水晶宫: ["Crystal Palace"],
  布莱顿: ["Brighton & Hove Albion", "Brighton"],
  富勒姆: ["Fulham"],
  狼队: ["Wolverhampton Wanderers", "Wolves"],
  伯恩茅斯: ["AFC Bournemouth", "Bournemouth"],
  诺丁汉森林: ["Nottingham Forest"],
  布伦特福德: ["Brentford"],
  利兹联: ["Leeds United"],
  伯恩利: ["Burnley"],
  桑德兰: ["Sunderland"],
  莱斯特城: ["Leicester City"],
  南安普顿: ["Southampton"],
  伊普斯维奇: ["Ipswich Town"],
  毕尔巴鄂竞技: ["Athletic Bilbao"],
  皇家社会: ["Real Sociedad"],
  比利亚雷亚尔: ["Villarreal"],
  塞维利亚: ["Sevilla"],
  贝蒂斯: ["Real Betis"],
  瓦伦西亚: ["Valencia"],
  赫塔费: ["Getafe"],
  奥萨苏纳: ["Osasuna"],
  塞尔塔: ["Celta Vigo"],
  西班牙人: ["Espanyol"],
  赫罗纳: ["Girona"],
  巴列卡诺: ["Rayo Vallecano"],
  马洛卡: ["Mallorca"],
  阿拉维斯: ["Alaves", "Deportivo Alaves"],
  莱万特: ["Levante"],
  埃尔切: ["Elche"],
  巴拉多利德: ["Real Valladolid"],
  拉斯帕尔马斯: ["Las Palmas"],
  勒沃库森: ["Bayer Leverkusen"],
  莱比锡红牛: ["RB Leipzig"],
  法兰克福: ["Eintracht Frankfurt"],
  弗赖堡: ["SC Freiburg", "Freiburg"],
  斯图加特: ["VfB Stuttgart", "Stuttgart"],
  门兴: ["Borussia Monchengladbach", "Borussia Mönchengladbach"],
  沃尔夫斯堡: ["VfL Wolfsburg", "Wolfsburg"],
  美因茨: ["Mainz 05", "Mainz"],
  云达不莱梅: ["Werder Bremen"],
  奥格斯堡: ["Augsburg"],
  霍芬海姆: ["Hoffenheim", "TSG Hoffenheim"],
  柏林联合: ["Union Berlin"],
  海登海姆: ["Heidenheim"],
  圣保利: ["St Pauli", "FC St. Pauli"],
  汉堡: ["Hamburger SV", "Hamburg"],
  科隆: ["FC Koln", "FC Köln", "Cologne"],
  那不勒斯: ["Napoli"],
  罗马: ["Roma", "AS Roma"],
  拉齐奥: ["Lazio"],
  亚特兰大: ["Atalanta"],
  佛罗伦萨: ["Fiorentina"],
  博洛尼亚: ["Bologna"],
  都灵: ["Torino"],
  热那亚: ["Genoa"],
  乌迪内斯: ["Udinese"],
  萨索洛: ["Sassuolo"],
  卡利亚里: ["Cagliari"],
  维罗纳: ["Hellas Verona"],
  莱切: ["Lecce"],
  帕尔马: ["Parma"],
  科莫: ["Como"],
  比萨: ["Pisa"],
  克雷莫纳: ["Cremonese"],
  恩波利: ["Empoli"],
  马赛: ["Marseille", "Olympique Marseille"],
  里昂: ["Lyon", "Olympique Lyonnais"],
  摩纳哥: ["Monaco"],
  里尔: ["Lille"],
  朗斯: ["Lens"],
  雷恩: ["Rennes"],
  尼斯: ["Nice", "OGC Nice"],
  南特: ["Nantes"],
  图卢兹: ["Toulouse"],
  斯特拉斯堡: ["Strasbourg"],
  蒙彼利埃: ["Montpellier"],
  兰斯: ["Reims"],
  欧塞尔: ["Auxerre"],
  布雷斯特: ["Brest"],
  洛里昂: ["Lorient"],
  梅斯: ["Metz"],
  昂热: ["Angers"],
  蔚山HD: ["Ulsan HD", "Ulsan Hyundai"],
  全北现代: ["Jeonbuk Hyundai Motors", "Jeonbuk Motors"],
  浦项制铁: ["Pohang Steelers"],
  首尔FC: ["FC Seoul"],
  水原FC: ["Suwon FC"],
  大邱FC: ["Daegu FC"],
  济州联: ["Jeju United"],
  光州FC: ["Gwangju FC"],
  大田市民: ["Daejeon Hana Citizen", "Daejeon Citizen"],
  江原FC: ["Gangwon FC"],
  金泉尚武: ["Gimcheon Sangmu"],
  仁川联: ["Incheon United"],
  迈阿密国际: ["Inter Miami"],
  洛杉矶FC: ["Los Angeles FC", "LAFC"],
  洛杉矶银河: ["LA Galaxy"],
  西雅图海湾人: ["Seattle Sounders"],
  波特兰伐木工: ["Portland Timbers"],
  纽约城: ["New York City FC"],
  纽约红牛: ["New York Red Bulls"],
  亚特兰大联: ["Atlanta United"],
  奥兰多城: ["Orlando City"],
  费城联合: ["Philadelphia Union"],
  辛辛那提FC: ["FC Cincinnati"],
  哥伦布机员: ["Columbus Crew"],
  纳什维尔SC: ["Nashville SC"],
  达拉斯FC: ["FC Dallas"],
  休斯敦迪纳摩: ["Houston Dynamo"],
  奥斯汀FC: ["Austin FC"],
  明尼苏达联: ["Minnesota United"],
  堪萨斯城竞技: ["Sporting Kansas City"],
  科罗拉多急流: ["Colorado Rapids"],
  皇家盐湖城: ["Real Salt Lake"],
  温哥华白帽: ["Vancouver Whitecaps"],
  多伦多FC: ["Toronto FC"],
  蒙特利尔CF: ["CF Montreal"],
  新英格兰革命: ["New England Revolution"],
  芝加哥火焰: ["Chicago Fire"],
  夏洛特FC: ["Charlotte FC"],
  圣路易斯城: ["St. Louis City", "St Louis City"],
  圣何塞地震: ["San Jose Earthquakes"],
  华盛顿联: ["DC United", "D.C. United"],
  马尔默: ["Malmo FF", "Malmö FF"],
  赫根: ["BK Hacken", "BK Häcken"],
  埃尔夫斯堡: ["Elfsborg", "IF Elfsborg"],
  哈马比: ["Hammarby"],
  佐加顿斯: ["Djurgarden", "Djurgården"],
  AIK索尔纳: ["AIK"],
  哥德堡: ["IFK Goteborg", "IFK Göteborg"],
  北雪平: ["IFK Norrkoping", "IFK Norrköping"],
  哈尔姆斯塔德: ["Halmstad"],
  天狼星: ["Sirius", "IK Sirius"],
  米亚尔比: ["Mjallby", "Mjällby"],
  布洛马波卡纳: ["Brommapojkarna"],
  代格福什: ["Degerfors"],
  哥德堡盖斯: ["GAIS"],
  奥斯达: ["Oster", "Öster"],
  博德闪耀: ["Bodo/Glimt", "Bodø/Glimt"],
  莫尔德: ["Molde"],
  罗森博格: ["Rosenborg"],
  布兰: ["Brann"],
  维京: ["Viking FK", "Viking"],
  利勒斯特罗姆: ["Lillestrom", "Lillestrøm"],
  瓦勒伦加: ["Valerenga", "Vålerenga"],
  特罗姆瑟: ["Tromso", "Tromsø"],
  海于格松: ["Haugesund"],
  桑德菲杰: ["Sandefjord"],
  萨尔普斯堡: ["Sarpsborg 08"],
  斯托姆加斯特: ["Stromsgodset", "Strømsgodset"],
  腓特烈斯塔: ["Fredrikstad"],
  汉坎: ["HamKam"],
  克里斯蒂安松: ["Kristiansund"],
  KFUM奥斯陆: ["KFUM Oslo"],
  弗拉门戈: ["Flamengo"],
  帕尔梅拉斯: ["Palmeiras"],
  科林蒂安: ["Corinthians"],
  圣保罗: ["Sao Paulo", "São Paulo"],
  桑托斯: ["Santos"],
  格雷米奥: ["Gremio", "Grêmio"],
  巴西国际: ["Internacional"],
  米内罗竞技: ["Atletico Mineiro", "Atlético Mineiro"],
  克鲁塞罗: ["Cruzeiro"],
  博塔弗戈: ["Botafogo"],
  弗鲁米嫩塞: ["Fluminense"],
  瓦斯科达伽马: ["Vasco da Gama"],
  巴伊亚: ["Bahia"],
  福塔雷萨: ["Fortaleza"],
  塞阿拉: ["Ceara", "Ceará"],
  巴拉纳竞技: ["Athletico Paranaense"],
  布拉干蒂诺红牛: ["Red Bull Bragantino", "Bragantino"],
  尤文图德: ["Juventude"],
  维多利亚: ["Vitoria", "Vitória"],
  累西腓体育: ["Sport Recife"],
  博卡青年: ["Boca Juniors"],
  河床: ["River Plate"],
  竞技: ["Racing Club"],
  独立: ["Independiente"],
  圣洛伦索: ["San Lorenzo"],
  拉努斯: ["Lanus", "Lanús"],
  萨斯菲尔德: ["Velez Sarsfield", "Vélez Sarsfield"],
  拉普拉塔大学生: ["Estudiantes"],
  坦佩雷山猫: ["Ilves"],
  TPS图尔库: ["TPS Turku"],
  国际图尔库: ["Inter Turku", "FC Inter Turku"],
  AC奥卢: ["AC Oulu"],
  雅罗: ["FF Jaro"],
  赫尔辛基: ["HJK Helsinki", "HJK"],
  瓦萨: ["VPS Vaasa", "VPS"],
  库奥皮奥: ["KuPS"],
  玛丽港: ["IFK Mariehamn"],
  赫尔辛基火花: ["IF Gnistan", "Gnistan"],
  拉赫蒂: ["FC Lahti"],
  塞伊奈约基: ["SJK Seinajoki", "SJK Seinäjoki"],
});

const teamLogoLocalClubSlugs = Object.freeze(new Set([
  "ac-milan",
  "afc-bournemouth",
  "alaves",
  "albirex-niigata",
  "arsenal",
  "as-roma",
  "aston-villa",
  "atalanta",
  "athletic-bilbao",
  "atlanta-united",
  "atletico-madrid",
  "augsburg",
  "austin-fc",
  "avispa-fukuoka",
  "azul-claro-numazu",
  "bayer-leverkusen",
  "bayern-munich",
  "beijing-guoan",
  "bk-hacken",
  "blaublitz-akita",
  "boca-juniors",
  "bodo-glimt",
  "bologna",
  "borussia-dortmund",
  "borussia-monchengladbach",
  "bournemouth",
  "brentford",
  "brighton",
  "brighton-and-hove-albion",
  "burnley",
  "cagliari",
  "celta-vigo",
  "cerezo-osaka",
  "cf-montreal",
  "changchun-yatai",
  "charlotte-fc",
  "chelsea",
  "chengdu-rongcheng",
  "chicago-fire",
  "cologne",
  "colorado-rapids",
  "columbus-crew",
  "como",
  "consadole-sapporo",
  "corinthians",
  "cremonese",
  "crystal-palace",
  "daegu-fc",
  "daejeon-citizen",
  "daejeon-hana-citizen",
  "dalian-yingbo",
  "dc-united",
  "d-c-united",
  "deportivo-alaves",
  "dortmund",
  "ehime-fc",
  "eintracht-frankfurt",
  "elche",
  "empoli",
  "espanyol",
  "everton",
  "fagiano-okayama",
  "fc-barcelona",
  "fc-bayern-munich",
  "fc-cincinnati",
  "fc-dallas",
  "fc-imabari",
  "fc-koln",
  "fc-machida-zelvia",
  "fc-seoul",
  "fc-st-pauli",
  "fc-tokyo",
  "fiorentina",
  "flamengo",
  "freiburg",
  "fujieda-myfc",
  "fulham",
  "gamba-osaka",
  "gangwon-fc",
  "genoa",
  "getafe",
  "gimcheon-sangmu",
  "girona",
  "guangzhou",
  "guangzhou-fc",
  "gwangju-fc",
  "hamburg",
  "hamburger-sv",
  "heidenheim",
  "hellas-verona",
  "henan-fc",
  "hoffenheim",
  "hokkaido-consadole-sapporo",
  "houston-dynamo",
  "incheon-united",
  "inter-miami",
  "inter-milan",
  "internazionale",
  "ipswich-town",
  "jef-chiba",
  "jef-united-chiba",
  "jeju-united",
  "jeonbuk-hyundai-motors",
  "jeonbuk-motors",
  "jubilo-iwata",
  "juventus",
  "kagoshima-united",
  "kashima-antlers",
  "kashiwa-reysol",
  "kataller-toyama",
  "kawasaki-frontale",
  "kyoto-sanga",
  "kyoto-sanga-fc",
  "lafc",
  "la-galaxy",
  "las-palmas",
  "lazio",
  "lecce",
  "leeds-united",
  "leicester-city",
  "lens",
  "levante",
  "lille",
  "liverpool",
  "los-angeles-fc",
  "lyon",
  "machida-zelvia",
  "mainz",
  "mainz-05",
  "mallorca",
  "malmo-ff",
  "manchester-city",
  "manchester-united",
  "marseille",
  "matsumoto-yamaga",
  "meizhou-hakka",
  "minnesota-united",
  "mito-hollyhock",
  "molde",
  "monaco",
  "montedio-yamagata",
  "montpellier",
  "nagoya-grampus",
  "nantes",
  "napoli",
  "nashville-sc",
  "newcastle-united",
  "new-england-revolution",
  "new-york-city-fc",
  "new-york-red-bulls",
  "nice",
  "nottingham-forest",
  "ogc-nice",
  "oita-trinita",
  "olympique-lyonnais",
  "olympique-marseille",
  "omiya-ardija",
  "orlando-city",
  "osasuna",
  "palmeiras",
  "paris-saint-germain",
  "parma",
  "philadelphia-union",
  "pisa",
  "pohang-steelers",
  "portland-timbers",
  "psg",
  "qingdao-hainiu",
  "qingdao-west-coast",
  "rayo-vallecano",
  "rb-leipzig",
  "real-betis",
  "real-madrid",
  "real-salt-lake",
  "real-sociedad",
  "real-valladolid",
  "reims",
  "rennes",
  "renofa-yamaguchi",
  "river-plate",
  "roasso-kumamoto",
  "roma",
  "rosenborg",
  "sagan-tosu",
  "sanfrecce-hiroshima",
  "san-jose-earthquakes",
  "santos",
  "sao-paulo",
  "sassuolo",
  "sc-freiburg",
  "seattle-sounders",
  "sevilla",
  "shandong-taishan",
  "shanghai-port",
  "shanghai-shenhua",
  "shenzhen-peng-city",
  "shimizu-s-pulse",
  "shonan-bellmare",
  "southampton",
  "sporting-kansas-city",
  "st-louis-city",
  "st-pauli",
  "strasbourg",
  "stuttgart",
  "sunderland",
  "suwon-fc",
  "thespa-gunma",
  "thespakusatsu-gunma",
  "tianjin-jinmen-tiger",
  "tochigi-sc",
  "tokushima-vortis",
  "tokyo-verdy",
  "torino",
  "toronto-fc",
  "tottenham",
  "tottenham-hotspur",
  "toulouse",
  "tsg-hoffenheim",
  "udinese",
  "ulsan-hd",
  "ulsan-hyundai",
  "union-berlin",
  "urawa-red-diamonds",
  "urawa-reds",
  "valencia",
  "vancouver-whitecaps",
  "vegalta-sendai",
  "ventforet-kofu",
  "vfb-stuttgart",
  "vfl-wolfsburg",
  "villarreal",
  "vissel-kobe",
  "v-varen-nagasaki",
  "werder-bremen",
  "west-ham-united",
  "wolfsburg",
  "wolverhampton-wanderers",
  "wolves",
  "wuhan-three-towns",
  "yokohama-fc",
  "yokohama-f-marinos",
  "yokohama-marinos",
  "yunnan-yukun",
  "zhejiang-fc",
]));

const teamLogoExactUrls = Object.freeze({
  墨西哥: ["/team-logos/mexico.svg"],
  南非: ["/team-logos/south-africa.svg"],
  韩国: ["/team-logos/south-korea.svg"],
  捷克: ["/team-logos/czech.svg"],
  加拿大: ["/team-logos/canada.svg"],
  波黑: ["/team-logos/bosnia.svg"],
  美国: ["/team-logos/usa.svg"],
  巴拉圭: ["/team-logos/paraguay.svg"],
  卡塔尔: ["/team-logos/qatar.svg"],
  瑞士: ["/team-logos/switzerland.svg"],
  巴西: ["/team-logos/brazil.svg"],
  摩洛哥: ["/team-logos/morocco.svg"],
  海地: ["/team-logos/haiti.svg"],
  苏格兰: ["/team-logos/scotland.svg"],
  澳大利亚: ["/team-logos/australia.svg"],
  土耳其: ["/team-logos/turkey.svg"],
  坦佩雷山猫: ["/team-logos/ilves.png"],
  TPS图尔库: ["/team-logos/tps-turku.png"],
  国际图尔库: ["/team-logos/inter-turku.png"],
  AC奥卢: ["/team-logos/ac-oulu.png"],
  雅罗: ["/team-logos/ff-jaro.png"],
  赫尔辛基: ["/team-logos/hjk-helsinki.png"],
  瓦萨: ["/team-logos/vps-vaasa.png"],
  库奥皮奥: ["/team-logos/kups.png"],
  玛丽港: ["/team-logos/ifk-mariehamn.png"],
  赫尔辛基火花: ["/team-logos/if-gnistan.png"],
  拉赫蒂: ["/team-logos/fc-lahti.png"],
  塞伊奈约基: ["/team-logos/sjk-seinajoki.png"],
  鹿岛鹿角: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c666880ae81c57752ce1_kashima-antlers-footballlogos-org.svg",
  ],
  神户胜利: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c880005f06aeb2182737_vissel-kobe-footballlogos-org.svg",
  ],
  神户胜利船: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c880005f06aeb2182737_vissel-kobe-footballlogos-org.svg",
  ],
  町田泽维: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6cc523ff4ec1a240c53e7_machida-zelvia-footballlogos-org.svg",
  ],
  町田泽维亚: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6cc523ff4ec1a240c53e7_machida-zelvia-footballlogos-org.svg",
  ],
  名古屋鲸: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c84b1a5223428f174422_nagoya-grampus-footballlogos-org.svg",
  ],
  名古屋鲸八: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c84b1a5223428f174422_nagoya-grampus-footballlogos-org.svg",
  ],
  浦和红钻: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c6f3a23a41787d4ae086_urawa-red-diamonds-footballlogos-org.svg",
  ],
  冈山绿雉: [
    "https://highlightly.net/soccer/images/teams/264594.png",
  ],
  横滨水手: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c7721cbf56d55ebf0398_yokohama-f-marinos-footballlogos-org.svg",
  ],
  清水鼓动: [
    "https://highlightly.net/soccer/images/teams/241617.png",
  ],
  柏太阳神: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c95a9cfcc1c4a0f409cb_kashiwa-reysol-footballlogos-org.svg",
  ],
  京都: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6cab42b274e1ff2549310_kyoto-sanga-footballlogos-org.svg",
  ],
  京都不死鸟: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6cab42b274e1ff2549310_kyoto-sanga-footballlogos-org.svg",
  ],
  川崎前锋: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c7c58858508bb0fda677_kawasaki-frontale-footballlogos-org.svg",
  ],
  广岛三箭: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6c8cdf80973b062364e1f_sanfrecce-hiroshima-footballlogos-org.svg",
  ],
  福冈: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6ca780875b1be26a2d6ab_avispa-fukuoka-footballlogos-org.svg",
  ],
  福冈黄蜂: [
    "https://cdn.prod.website-files.com/68f550992570ca0322737dc2/68f6ca780875b1be26a2d6ab_avispa-fukuoka-footballlogos-org.svg",
  ],
});

const teamFlagCodes = Object.freeze({
  中国: "cn",
  中国香港: "hk",
  中国澳门: "mo",
  中华台北: "tw",
  日本: "jp",
  韩国: "kr",
  朝鲜: "kp",
  澳大利亚: "au",
  新西兰: "nz",
  新加坡: "sg",
  泰国: "th",
  越南: "vn",
  马来西亚: "my",
  印尼: "id",
  印度尼西亚: "id",
  菲律宾: "ph",
  缅甸: "mm",
  柬埔寨: "kh",
  老挝: "la",
  印度: "in",
  巴基斯坦: "pk",
  孟加拉国: "bd",
  伊朗: "ir",
  伊拉克: "iq",
  沙特: "sa",
  沙特阿拉伯: "sa",
  卡塔尔: "qa",
  阿联酋: "ae",
  阿曼: "om",
  科威特: "kw",
  巴林: "bh",
  约旦: "jo",
  叙利亚: "sy",
  黎巴嫩: "lb",
  巴勒斯坦: "ps",
  以色列: "il",
  以色列队: "il",
  也门: "ye",
  乌兹别克: "uz",
  乌兹别克斯坦: "uz",
  哈萨克: "kz",
  哈萨克斯坦: "kz",
  吉尔吉斯: "kg",
  吉尔吉斯斯坦: "kg",
  塔吉克: "tj",
  塔吉克斯坦: "tj",
  土库曼: "tm",
  土库曼斯坦: "tm",
  英格兰: "gb-eng",
  苏格兰: "gb-sct",
  威尔士: "gb-wls",
  北爱尔兰: "gb-nir",
  爱尔兰: "ie",
  法国: "fr",
  德国: "de",
  意大利: "it",
  西班牙: "es",
  葡萄牙: "pt",
  荷兰: "nl",
  比利时: "be",
  瑞士: "ch",
  奥地利: "at",
  丹麦: "dk",
  瑞典: "se",
  挪威: "no",
  芬兰: "fi",
  冰岛: "is",
  波兰: "pl",
  捷克: "cz",
  斯洛伐克: "sk",
  匈牙利: "hu",
  罗马尼亚: "ro",
  保加利亚: "bg",
  克罗地亚: "hr",
  塞尔维亚: "rs",
  黑山: "me",
  波黑: "ba",
  斯洛文尼亚: "si",
  阿尔巴尼亚: "al",
  北马其顿: "mk",
  希腊: "gr",
  土耳其: "tr",
  乌克兰: "ua",
  俄罗斯: "ru",
  白俄罗斯: "by",
  格鲁吉亚: "ge",
  亚美尼亚: "am",
  阿塞拜疆: "az",
  立陶宛: "lt",
  拉脱维亚: "lv",
  爱沙尼亚: "ee",
  摩尔多瓦: "md",
  卢森堡: "lu",
  巴西: "br",
  阿根廷: "ar",
  乌拉圭: "uy",
  哥伦比亚: "co",
  智利: "cl",
  秘鲁: "pe",
  巴拉圭: "py",
  玻利维亚: "bo",
  厄瓜多尔: "ec",
  委内瑞拉: "ve",
  美国: "us",
  加拿大: "ca",
  墨西哥: "mx",
  巴拿马: "pa",
  洪都拉斯: "hn",
  哥斯达黎加: "cr",
  萨尔瓦多: "sv",
  危地马拉: "gt",
  牙买加: "jm",
  海地: "ht",
  古巴: "cu",
  埃及: "eg",
  摩洛哥: "ma",
  突尼斯: "tn",
  阿尔及利亚: "dz",
  尼日利亚: "ng",
  加纳: "gh",
  喀麦隆: "cm",
  科特迪瓦: "ci",
  塞内加尔: "sn",
  南非: "za",
  马里: "ml",
  几内亚: "gn",
  刚果: "cg",
  民主刚果: "cd",
  肯尼亚: "ke",
});

const teamLogoResultCache = new Map();
const teamLogoStorageKey = "qtcTeamLogoCache:v6";
const teamLogoSuccessTtl = 30 * 24 * 60 * 60 * 1000;
const teamLogoFailTtl = 3 * 24 * 60 * 60 * 1000;

function teamLogoProxyUrl(source, retryCount = 0) {
  const retry = retryCount ? `&retry=${retryCount}` : "";
  return `/api/team-logo?src=${encodeURIComponent(source)}${retry}`;
}

function teamLogoImageUrl(source, retryCount = 0) {
  if (!source) return "";
  return source.startsWith("http") ? teamLogoProxyUrl(source, retryCount) : source;
}

function readTeamLogoStore() {
  try {
    return JSON.parse(localStorage.getItem(teamLogoStorageKey) || "{}");
  } catch (error) {
    return {};
  }
}

function writeTeamLogoStore(store) {
  try {
    localStorage.setItem(teamLogoStorageKey, JSON.stringify(store));
  } catch (error) {}
}

function cachedTeamLogo(teamName) {
  const team = String(teamName || "").trim();
  if (!team) return null;
  if (teamLogoResultCache.has(team)) {
    return teamLogoResultCache.get(team);
  }

  const store = readTeamLogoStore();
  const item = store[team];
  if (!item || !item.expiresAt || Date.now() > item.expiresAt) {
    if (item) {
      delete store[team];
      writeTeamLogoStore(store);
    }
    return null;
  }

  const value = item.url || "";
  teamLogoResultCache.set(team, value);
  return value;
}

function saveTeamLogoCache(teamName, url) {
  const team = String(teamName || "").trim();
  if (!team) return;

  const value = url || "";
  teamLogoResultCache.set(team, value);
  const store = readTeamLogoStore();
  store[team] = {
    url: value,
    expiresAt: Date.now() + (value ? teamLogoSuccessTtl : teamLogoFailTtl),
  };
  writeTeamLogoStore(store);
}

function pruneTeamLogoCache() {
  const store = readTeamLogoStore();
  const now = Date.now();
  let changed = false;
  Object.keys(store).forEach((team) => {
    if (!store[team]?.expiresAt || now > store[team].expiresAt) {
      delete store[team];
      changed = true;
    }
  });
  if (changed) writeTeamLogoStore(store);
}

function teamInitial(teamName) {
  const chars = Array.from(String(teamName || "").trim()).filter((char) => /\S/u.test(char));
  return (chars[0] || "?").toUpperCase();
}

function teamAliasCandidates(teamName) {
  const team = String(teamName || "").trim();
  return Array.from(new Set([team, ...(teamNameAliases[team] || []), ...(jcTeamNameAliases[team] || [])].filter(Boolean)));
}

function logoNameVariants(name) {
  const text = String(name || "").trim();
  const spaced = text.replace(/\s+/g, " ");
  const hyphenated = spaced.replace(/\s+/g, "-");
  const compact = spaced.replace(/\s+/g, "");
  return Array.from(new Set([spaced, hyphenated, hyphenated.toLowerCase(), compact].filter(Boolean)));
}

function teamLogoSlug(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function localClubLogoSources(teamName) {
  const team = String(teamName || "").trim();
  if (!team || teamFlagCodes[team]) return [];
  return teamAliasCandidates(team)
    .filter((alias) => !/[\u3400-\u9fff]/u.test(alias))
    .map((alias) => teamLogoSlug(alias))
    .filter(Boolean)
    .filter((slug) => teamLogoLocalClubSlugs.has(slug))
    .map((slug) => `/team-logos/clubs/${slug}.png`);
}

function exactFlagLogoSources(teamName) {
  const code = teamFlagCodes[String(teamName || "").trim()];
  if (!code) return [];
  const lower = code.toLowerCase();
  const upper = code.toUpperCase();
  return [
    `/team-logos/flags/${lower}.svg`,
    `https://jsd.onmicrosoft.cn/npm/svg-country-flags@1.2.10/svg/${lower}.svg`,
    `https://flagcdn.com/${lower}.svg`,
    `https://purecatamphetamine.github.io/country-flag-icons/3x2/${upper}.svg`,
  ];
}

function flagLogoSources(teamName) {
  return exactFlagLogoSources(teamName);
}

function exactTeamLogoSources(teamName) {
  return [
    ...localClubLogoSources(teamName),
    ...(teamLogoExactUrls[String(teamName || "").trim()] || []),
    ...exactFlagLogoSources(teamName),
  ];
}

function teamLogoSources(teamName) {
  const sources = [...exactTeamLogoSources(teamName)];
  teamAliasCandidates(teamName).forEach((alias) => {
    logoNameVariants(alias).forEach((variant) => {
      const encoded = encodeURIComponent(variant);
      sources.push(`https://jsd.onmicrosoft.cn/gh/footballcsv/japan-logos@master/teams/${encoded}.svg`);
      sources.push(`https://logotypes.dev/${encoded}.svg`);
    });
  });
  return Array.from(new Set(sources)).slice(0, 18);
}

function teamAccentColor(teamName) {
  const key = (teamName || "").trim();
  if (TEAM_COLORS[key]) return TEAM_COLORS[key];
  const normalized = key.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  if (normalized !== key && TEAM_COLORS[normalized]) return TEAM_COLORS[normalized];
  return TEAM_COLORS_DEFAULT;
}

const TEAM_COLORS_DEFAULT = "#636366";

const TEAM_COLORS = {
  "\u6D66\u548C\u7EA2\u94BB": "#E50012",
  "\u6D66\u548C": "#E50012",
  "\u5DDD\u5D0E\u524D\u950B": "#34B1EB",
  "\u5DDD\u5D0E": "#34B1EB",
  "\u6A2A\u6EE8\u6C34\u624B": "#1A3B8C",
  "\u6A2A\u6EE8FC": "#1A3B8C",
  "\u6A2A\u6EE8": "#1A3B8C",
  "\u6A2A\u6EE8\u6C34\u624BFC": "#1A3B8C",
  "\u540D\u53E4\u5C4B\u9CA8\u9C7C": "#E60012",
  "\u540D\u53E4\u5C4B": "#E60012",
  "\u9E7F\u5C9B\u9E7F\u89D2": "#8B0000",
  "\u9E7F\u5C9B": "#8B0000",
  "\u5927\u962A\u94A2\u5DF4": "#005BAC",
  "\u5927\u962A": "#005BAC",
  "\u5927\u962AG": "#005BAC",
  "\u795E\u6237\u80DC\u5229\u8239": "#8B0000",
  "\u795E\u6237": "#8B0000",
  "\u795E\u6237\u80DC\u5229": "#8B0000",
  "\u4E1C\u4EACFC": "#1A3668",
  "\u4E1C\u4EAC": "#1A3668",
  "\u4EAC\u90FD\u4E0D\u6B7B\u9E1F": "#990066",
  "\u4EAC\u90FD": "#990066",
  "\u5E7F\u5C9B\u4E09\u7BAD": "#5E2C83",
  "\u5E7F\u5C9B": "#5E2C83",
  "\u5927\u5206\u4E09\u795E": "#005BAC",
  "\u5927\u5206": "#005BAC",
  "\u672D\u5E4C\u5CA1\u8428\u591A": "#ED1A3D",
  "\u672D\u5E4C": "#ED1A3D",
  "\u672D\u5E4C\u5317\u6D77\u9053": "#ED1A3D",
  "\u67CF\u592A\u9633\u738B": "#FFD700",
  "\u67CF\u592A\u9633": "#FFD700",
  "\u67CF": "#FFD700",
  "\u6E58\u5357\u4E3D\u6D77": "#2E6B45",
  "\u6E58\u5357": "#2E6B45",
  "\u6E58\u5357\u6BD4\u9A6C": "#2E6B45",
  "\u798F\u5188\u9EC4\u8702": "#F5A300",
  "\u798F\u5188": "#F5A300",
  "\u9E1F\u6816\u6C99\u5CA9": "#1557A5",
  "\u9E1F\u6816": "#1557A5",
  "\u6E05\u6C34\u9F13\u52A8": "#FF6B00",
  "\u6E05\u6C34": "#FF6B00",
  "\u65B0\u6F5F\u5929\u9E45": "#F68428",
  "\u65B0\u6F5F": "#F68428",
  "\u4ED9\u53F0\u7EF4\u52A0\u6CF0": "#2A1F5E",
  "\u4ED9\u53F0": "#2A1F5E",
  "\u795E\u5948\u5DDD\u76F8\u6A21\u539F": "#00AEEF",
  "\u76F8\u6A21\u539F": "#00AEEF",
  "\u58EC\u751F\u67AF\u53F6": "#1B5E20",
  "\u5343\u53F6\u5E02\u539F": "#2E7D32",
  "\u5343\u53F6": "#2E7D32",
  "\u4EAC\u90FD\u6851\u52A0": "#9E2A2B",
  "\u677E\u672C\u5C71\u96C5": "#2E5090",
  "\u677E\u672C": "#2E5090",
  "\u5854\u4EC0\u5E72FC": "#E31E24",
  "\u6C34\u6236\u8702\u6597": "#00AA9B",
  "\u9577\u91CE\u5E15\u5854\u83B1\u5965": "#009966",
  "\u9577\u91CE": "#009966",
  "\u5C71\u5F62\u5C71\u795E": "#0033A0",
  "\u5C71\u5F62": "#0033A0",
  "\u5FB7\u5C9B\u6F29\u6DA1": "#003399",
  "\u5FB7\u5C9B": "#003399",
  "\u718A\u672C\u6DF1\u7EA2": "#CC0000",
  "\u718A\u672C": "#CC0000",
  "\u5CA1\u5C71\u7DA0\u96C9": "#228B22",
  "\u5CA1\u5C71": "#228B22",
  "\u6D41\u901A\u9F99": "#0077CC",
  "\u7FA4\u9A6C\u8349\u6D25\u6E29\u6CC9": "#009677",
  "\u7FA4\u9A6C": "#009677",
  "\u6803\u6728SC": "#FFC90E",
  "\u6803\u6728": "#FFC90E",
  "\u7532\u5E9C\u98CE\u6797": "#003399",
  "\u7532\u5E9C": "#003399",
  "\u5C90\u961CFC": "#00A54F",
  "\u5C90\u961C": "#00A54F",
  "\u9580\u5174\u683C\u62C9\u5FB7\u5DF4\u5947": "#DC052D",
  "\u5FB7\u56FD\u5E55\u5C3C\u9ED1": "#0065B2",
  "\u62DC\u4EC1\u6155\u5C3C\u9ED1": "#DC052D",
  "\u62DC\u4EC1": "#DC052D",
  "\u52D2\u6C83\u5E93\u68EE": "#E2001A",
  "\u6C83\u5C14\u592B\u65AF\u5821": "#65A845",
  "\u6C83\u5C14\u592B": "#65A845",
  "\u6CD5\u5170\u514B\u798F": "#E1000F",
  "\u6CD5\u5170\u514B": "#E1000F",
  "\u65AF\u56FE\u52A0\u7279": "#C41230",
  "\u65AF\u56FE": "#C41230",
  "\u591A\u7279\u8499\u5FB7": "#FFCC00",
  "\u591A\u7279": "#FFCC00",
  "\u4E91\u8FBE\u4E0D\u83B1\u6885": "#00A650",
  "\u4E91\u8FBE": "#00A650",
  "\u6CE2\u9E3F": "#004B6B",
  "\u5965\u65AF\u7EB3\u5E03\u5415\u514B": "#C4182C",
  "\u5723\u4FDD\u5229": "#228B22",
  "\u5DF4\u4F0A\u57C3": "#EE0000",
  "\u5E03\u4F26\u745E\u514B": "#74A12E",
  "\u52C3\u826F": "#74A12E",
  "\u4E0D\u83B1\u6885": "#00A650",
  "\u65AF\u56FE\u52A0\u7279": "#C41230",

  "Bayern M\u00FCnchen": "#DC052D",
  "Borussia Dortmund": "#FFCC00",
  "RB Leipzig": "#E2001A",
  "Bayer Leverkusen": "#E2001A",
  "VfB Stuttgart": "#C41230",
  "Eintracht Frankfurt": "#E1000F",
  "VfL Wolfsburg": "#65A845",
  "Borussia M\u00F6nchengladbach": "#008040",
  "SC Freiburg": "#CC0000",
  "Werder Bremen": "#1D8C3F",
  "TSG Hoffenheim": "#1B69B4",
  "FC Augsburg": "#BA3737",
  "1. FC Heidenheim": "#E2001A",
  "FC St. Pauli": "#70462A",
  "Holstein Kiel": "#0066B3",
  "VfL Bochum": "#005CA9",
  "1. FSV Mainz 05": "#CE0000",
  "1. FC Union Berlin": "#E10506",
  "FC K\u00F6ln": "#E2001A",
  "Hamburger SV": "#005CA9",
  "Hertha BSC": "#004C9A",
  "Fortuna D\u00FCsseldorf": "#E10506",
  "FC Schalke 04": "#004C9C",
  "Hannover 96": "#37A137",
  "FC N\u00FCrnberg": "#8C181A",

  "Real Madrid": "#FEBE10",
  "FC Barcelona": "#A50044",
  "Atl\u00E9tico Madrid": "#CB3524",
  "Sevilla FC": "#D1011C",
  "Real Betis": "#15844B",
  "Real Sociedad": "#0F58A8",
  "Athletic Club": "#EE2524",
  "Villarreal CF": "#FFF100",
  "Valencia CF": "#FADA06",
  "Girona FC": "#D50032",
  "RCD Espanyol": "#1C67AD",
  "RC Celta": "#73BBE5",
  "CA Osasuna": "#B02025",
  "Getafe CF": "#005BAA",
  "RCD Mallorca": "#E20613",
  "Deportivo Alav\u00E9s": "#004B8C",
  "UD Las Palmas": "#FCDD00",
  "Rayo Vallecano": "#DA291C",
  "Granada CF": "#CC0000",
  "C\u00E1diz CF": "#FFF100",
  "UD Almer\u00EDa": "#E20613",
  "Elche CF": "#216531",

  "Manchester City": "#6CABDD",
  "Manchester United": "#DA291C",
  "Liverpool FC": "#C8102E",
  "Arsenal FC": "#EF0107",
  "Chelsea FC": "#034694",
  "Tottenham Hotspur": "#132257",
  "Newcastle United": "#241F20",
  "Aston Villa": "#670E36",
  "Brighton & Hove Albion": "#0057B8",
  "West Ham United": "#7A263A",
  "Fulham FC": "#000000",
  "Brentford FC": "#E30613",
  "Crystal Palace": "#1B458F",
  "Wolverhampton Wanderers": "#FDB913",
  "Everton FC": "#003399",
  "Nottingham Forest": "#E53233",
  "AFC Bournemouth": "#DA291C",
  "Leicester City": "#003090",
  "Leeds United": "#FFCD00",
  "Southampton FC": "#D71920",
  "Burnley FC": "#6C1D45",
  "Sheffield United": "#EC2227",
  "Luton Town": "#FF6B00",

  "Paris Saint-Germain": "#004170",
  "Olympique Marseille": "#2FAEE0",
  "Olympique Lyonnais": "#E8292A",
  "AS Monaco": "#E8333D",
  "LOSC Lille": "#E0132C",
  "Stade Rennais": "#E20612",
  "OGC Nice": "#E71B35",
  "RC Lens": "#E50E21",
  "RC Strasbourg": "#0068B4",
  "FC Nantes": "#F9E400",
  "Montpellier HSC": "#F77F00",
  "Stade de Reims": "#E30321",
  "Stade Brestois": "#E20612",

  "Inter Milan": "#010E80",
  "AC Milan": "#FB090B",
  "Juventus FC": "#000000",
  "SSC Napoli": "#12A0D4",
  "AS Roma": "#8E1F2F",
  "SS Lazio": "#85B2E1",
  "Atalanta BC": "#005886",
  "ACF Fiorentina": "#582B8C",
  "Torino FC": "#6B1D2B",
  "Bologna FC": "#DA1A32",
  "Udinese Calcio": "#000000",
  "Genoa CFC": "#CF102D",
  "Cagliari Calcio": "#1B2866",

  "Vissel Kobe": "#8B0000",
  "Albirex Niigata": "#F68428",

  "Bayern Munich": "#DC052D",
  "FC Bayern Munich": "#DC052D",
  "FC Koln": "#E2001A",

  "Atletico Madrid": "#CB3524",
  "Athletic Bilbao": "#EE2524",
  "Deportivo Alaves": "#004B8C",
  "Cadiz CF": "#FFF100",
  "Almeria": "#E20613",

  "Paris Saint-Germain": "#004170",
  "Olympique Marseille": "#2FAEE0",
  "Olympique Lyonnais": "#E8292A",
  "AS Monaco": "#E8333D",
  "LOSC Lille": "#E0132C",
  "Stade Rennais": "#E20612",
  "OGC Nice": "#E71B35",

  "Juventus": "#000000",
  "FC Inter Milan": "#010E80",
  "AC Milan": "#FB090B",
  "Inter": "#010E80",
  "Milan": "#FB090B",
};

function teamBadgeHtml(teamName) {
  const color = teamAccentColor(teamName);
  const sources = teamLogoSources(teamName);
  const cachedResult = cachedTeamLogo(teamName);
  const isCachedLogo = Boolean(cachedResult);
  const rawSrc = exactTeamLogoSources(teamName)[0] || "";
  const directSrc = teamLogoImageUrl(rawSrc);
  const stateClass = isCachedLogo ? "is-loaded" : (directSrc ? "is-loaded" : "is-fallback");
  const srcAttribute = isCachedLogo ? ` src="${escapeHtml(cachedResult)}"` : (directSrc ? ` src="${escapeHtml(directSrc)}"` : "");
  return `
    <div class="team-avatar ${stateClass}" data-team="${escapeHtml(teamName)}" data-source-index="0" data-retry-count="0" data-logo-src="${escapeHtml(sources[0] || "")}" style="background:${color}22; box-shadow:0 0 16px ${color}18;">
      <img alt="${escapeHtml(teamName)}队徽" loading="lazy" decoding="async" fetchpriority="low" referrerpolicy="no-referrer"${srcAttribute} />
      <span class="team-avatar-fallback" aria-hidden="true">${escapeHtml(teamInitial(teamName))}</span>
    </div>
  `;
}

function hydrateTeamBadges(scope = scheduleContent) {
  scope.querySelectorAll(".team-avatar").forEach((badge) => {
    const image = badge.querySelector("img");
    if (!image || image.dataset.logoBound === "true") return;

    image.dataset.logoBound = "true";
    const team = badge.dataset.team || "";
    const sources = teamLogoSources(team);
    const cachedResult = cachedTeamLogo(team);

    if (cachedResult === "") {
      badge.classList.remove("is-loaded");
      badge.classList.add("is-fallback");
      return;
    }
    if (cachedResult) {
      image.src = cachedResult;
      badge.classList.remove("is-fallback");
      badge.classList.add("is-loaded");
      return;
    }

    const showFallback = () => {
      saveTeamLogoCache(team, "");
      badge.classList.remove("is-loaded");
      badge.classList.add("is-fallback");
      image.removeAttribute("src");
    };

    const loadSource = (index, retryCount = 0) => {
      if (!sources[index]) {
        showFallback();
        return;
      }
      badge.dataset.sourceIndex = String(index);
      badge.dataset.retryCount = String(retryCount);
      badge.classList.remove("is-loaded");
      badge.classList.add("is-fallback");
      const url = sources[index];
      image.src = teamLogoImageUrl(url, retryCount);
    };

    image.addEventListener("load", () => {
      if (image.src) {
        saveTeamLogoCache(team, image.getAttribute("src") || image.src);
      }
      badge.classList.remove("is-fallback");
      badge.classList.add("is-loaded");
    });

    image.addEventListener("error", () => {
      const sourceIndex = Number(badge.dataset.sourceIndex || "0");
      const retryCount = Number(badge.dataset.retryCount || "0");
      if (retryCount < 1) {
        loadSource(sourceIndex, retryCount + 1);
        return;
      }
      loadSource(sourceIndex + 1, 0);
    });

    const load = () => {
      if (image.src) {
        return;
      }
      const qrPriorityWindow = Promise.race([
        ensureContactImageReady(),
        new Promise((resolve) => window.setTimeout(resolve, 1200)),
      ]);
      qrPriorityWindow.finally(() => {
        window.setTimeout(() => loadSource(0, 0), 500);
      });
    };
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(load, { timeout: 1400 });
    } else {
      window.setTimeout(load, 900);
    }
  });
}

function matchCard(match, index, day) {
  const statusHtml = matchStatusHtml(match);
  const compactDateTime = compactKickoffDateTime(match, day);
  const isLive = statusHtml.includes("live");
  const isFinished = statusHtml.includes("finished");

  return `
    <article class="match-card reveal-delay-${Math.min(index + 1, 5)}" data-match-no="${escapeHtml(match.matchNo)}" data-home="${escapeHtml(match.home)}" data-away="${escapeHtml(match.away)}">
      <div class="match-card-top">
        <div>
          <div class="match-league">${renderMatchNo(match.matchNo)} · <span class="match-league-name">${escapeHtml(match.league)}</span></div>
        </div>
        <div class="match-card-right">
          ${isLive || isFinished ? statusHtml : `<div class="match-time">${escapeHtml(compactDateTime)}</div>`}
        </div>
      </div>
      <div class="match-teams">
        <div class="team">
          ${teamBadgeHtml(match.home)}
          <span class="team-name">${escapeHtml(match.home)}</span>
          <span class="team-name-sm tag-home">主</span>
        </div>
        <div class="score-area">${scoreHtml(match)}</div>
        <div class="team">
          ${teamBadgeHtml(match.away)}
          <span class="team-name">${escapeHtml(match.away)}</span>
          <span class="team-name-sm tag-away">客</span>
        </div>
      </div>
      <div class="match-card-footer">
        <button class="ai-analysis-btn" type="button" data-match-no="${escapeHtml(match.matchNo)}">
          <svg class="ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          AI分析
        </button>
      </div>
    </article>
  `;
}

function scheduleMarkupForDate(dateKey) {
  const day = dayForDate(dateKey);

  if (!day) {
    return `
      <div class="empty-page">
        <div class="empty-inner">
          <p class="empty-desc">数据正在赶来~</p>
        </div>
      </div>
    `;
  }

  return `
    <div class="date-group">
      ${day.matches.map((match, index) => matchCard(match, index, day)).join("")}
    </div>
  `;
}

function markCardsVisible(scope = scheduleContent) {
  hydrateTeamBadges(scope);
  requestAnimationFrame(() => {
    scope.querySelectorAll(".match-card").forEach((card) => card.classList.add("visible"));
    requestAnimationFrame(() => staggerMatchCards(scope));
  });
}

function settleCardsVisible(scope = scheduleContent) {
  hydrateTeamBadges(scope);
  scope.querySelectorAll(".match-card").forEach((card) => {
    card.classList.add("visible");
    card.style.animation = "none";
  });
}

function isAnyModalOpen() {
  return qrModal.classList.contains("open") ||
    menuPopup.classList.contains("open") ||
    aiDetailPage?.classList.contains("active");
}

function updateChips() {
  setDateChipActive(selectedDateKey);
  centerDateChip(selectedDateKey, { behavior: "smooth" });
}

function goDate(idx) {
  const dates = dateItems();
  if (idx < 0 || idx >= dates.length) return false;
  const currentIdx = dateIndex(selectedDateKey);
  if (idx === currentIdx) return false;
  if (isScheduleTransitioning || isAnyModalOpen()) return false;

  isScheduleTransitioning = true;
  clickBlockUntil = performance.now() + pageTransitionMs + 180;

  const nextDateKey = dates[idx].dateKey;
  const currentPage = scheduleContent.querySelector(".schedule-page.active") ||
    resetSchedulePageState(schedulePageForDate(selectedDateKey), true);
  const nextPage = resetSchedulePageState(schedulePageForDate(nextDateKey), false);
  const dir = idx > currentIdx ? 1 : -1;
  const currentHeight = currentPage.offsetHeight || scheduleContent.offsetHeight || 0;

  selectedDateKey = nextDateKey;
  updateChips();
  resetInteractionVisuals();
  preloadAdjacentSchedules(nextDateKey);

  currentPage.style.setProperty("--page-exit-x", `${dir * -100}%`);
  nextPage.style.setProperty("--page-enter-x", `${dir * 100}%`);
  currentPage.classList.add("is-exiting");
  nextPage.classList.add("is-entering");
  settleCardsVisible(nextPage);

  scheduleContent.style.setProperty("--schedule-min-height", `${currentHeight}px`);
  scheduleContent.classList.add("is-transitioning");
  scheduleContent.replaceChildren(currentPage, nextPage);

  requestAnimationFrame(() => {
    nextPage.classList.add("active");
    currentPage.classList.add("is-exiting-active");
  });

  window.setTimeout(() => {
    resetSchedulePageState(nextPage, true);
    scheduleContent.replaceChildren(nextPage);
    scheduleContent.classList.remove("is-transitioning");
    scheduleContent.style.removeProperty("--schedule-min-height");
    isScheduleTransitioning = false;
    resetInteractionVisuals();
  }, pageTransitionMs);

  return true;
}

function resetSchedulePageState(page, active = false) {
  page.className = active ? "schedule-page active" : "schedule-page";
  page.style.removeProperty("--page-enter-x");
  page.style.removeProperty("--page-exit-x");
  return page;
}

function schedulePageForDate(dateKey) {
  let page = schedulePageCache.get(dateKey);
  if (page) {
    return page;
  }

  page = document.createElement("div");
  page.dataset.date = dateKey;
  page.innerHTML = scheduleMarkupCache.get(dateKey) || scheduleMarkupForDate(dateKey);
  scheduleMarkupCache.set(dateKey, page.innerHTML);
  schedulePageCache.set(dateKey, page);
  return page;
}

function pageHtmlForDate(dateKey) {
  const cached = scheduleMarkupCache.get(dateKey);
  const markup = cached || scheduleMarkupForDate(dateKey);
  scheduleMarkupCache.set(dateKey, markup);
  return `<div class="schedule-page active" data-date="${escapeHtml(dateKey)}">${markup}</div>`;
}

function renderSchedule({ animate = false, nextDateKey = selectedDateKey } = {}) {

  if (!animate || !scheduleContent.querySelector(".schedule-page")) {
    scheduleContent.classList.remove("is-transitioning", "is-dragging");
    scheduleContent.style.removeProperty("--schedule-min-height");
    const page = resetSchedulePageState(schedulePageForDate(nextDateKey), true);
    scheduleContent.replaceChildren(page);
    markCardsVisible(page);
    preloadAdjacentSchedules(nextDateKey);
    return;
  }

  const idx = dateItems().findIndex((d) => d.dateKey === nextDateKey);
  if (idx >= 0) goDate(idx);
}

function selectDate(dateKey, { animate = true, center = true, scrollTop = true, force = false } = {}) {
  if (!validDateKey(dateKey)) return false;
  if (isScheduleTransitioning && !force) return false;

  if (dateKey === selectedDateKey && !force) {
    updateChips();
    if (scrollTop) window.scrollTo({ top: 0, behavior: "smooth" });
    return true;
  }

  if (!animate || !scheduleContent.querySelector(".schedule-page")) {
    selectedDateKey = dateKey;
    setDateChipActive(dateKey);
    renderSchedule({ animate: false, nextDateKey: dateKey });
    if (center) centerDateChip(dateKey, { behavior: "auto" });
    if (scrollTop) window.scrollTo({ top: 0, behavior: "auto" });
    return true;
  }

  const idx = dateItems().findIndex((d) => d.dateKey === dateKey);
  if (idx < 0) return false;

  clickBlockUntil = performance.now() + 800;
  // 切换不同日期时不再自动滚动到顶部，仅保留点击同一日期时滚动
  return goDate(idx);
}

async function loadSchedule({ notify = false } = {}) {
  try {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const loadedDays = Array.isArray(payload.days) ? payload.days : [];
    scheduleDays = hasAnyScheduleMatch(loadedDays) ? loadedDays : mockScheduleDays();
    scheduleMarkupCache.clear();
    schedulePageCache.clear();

    buildDateStrip();
    renderSchedule({ animate: false });
    setTimeout(playEntrance, 100);

    if (notify) {
      const summary = payload.lastImport?.message || "数据已更新";
      showToast(summary);
    }
  } catch (error) {
    // 后端暂时不可用时仍展示静态赛事，便于主题和 AI 详情页完整预览。
    scheduleDays = mockScheduleDays();
    scheduleMarkupCache.clear();
    schedulePageCache.clear();
    buildDateStrip();
    renderSchedule({ animate: false });
    setTimeout(playEntrance, 100);
    if (notify) showToast("已切换到静态预览数据");
  }
}

function bindDateChipClicks() {
  dateStrip.querySelectorAll(".date-chip").forEach((chip) => {
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      if (performance.now() < clickBlockUntil) {
        event.stopPropagation();
        return;
      }
      selectDate(chip.dataset.date, { animate: true, center: true, scrollTop: true });
    });
  });
}

document.addEventListener(
  "click",
  (event) => {
    if (isScheduleTransitioning || performance.now() < clickBlockUntil) {
      if (dateStrip.contains(event.target) || scheduleContent.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  },
  true,
);

function resetInteractionVisuals() {
  dateStrip.classList.remove("dragging");
  scheduleContent.classList.remove("is-dragging");
  scheduleContent.style.removeProperty("--swipe-x");
  scheduleContent.style.removeProperty("--swipe-progress");
}

function targetIndexForSwipe(dx, velocityX) {
  const currentIndex = dateIndex(selectedDateKey);
  if (currentIndex < 0) return -1;

  const shouldCommit =
    Math.abs(dx) >= dateSwitchDistance ||
    (Math.abs(dx) >= gestureIntentDistance * 2 && Math.abs(velocityX) >= swipeVelocityCommit);
  if (!shouldCommit) return -1;

  return dx < 0 ? currentIndex + 1 : currentIndex - 1;
}

function dampSwipeDx(dx) {
  const currentIndex = dateIndex(selectedDateKey);
  const lastIndex = dateItems().length - 1;
  const pullingPastStart = currentIndex <= 0 && dx > 0;
  const pullingPastEnd = currentIndex >= lastIndex && dx < 0;
  const damped = pullingPastStart || pullingPastEnd ? dx * 0.34 : dx;
  return Math.max(-swipeMaxPull, Math.min(swipeMaxPull, damped));
}

function applySwipePreview(dx) {
  const visualDx = dampSwipeDx(dx);
  const progress = Math.min(Math.abs(visualDx) / swipeMaxPull, 1);
  scheduleContent.classList.add("is-dragging");
  scheduleContent.style.setProperty("--swipe-x", `${visualDx}px`);
  scheduleContent.style.setProperty("--swipe-progress", progress.toFixed(3));
  return visualDx;
}

function enableScheduleInteractions() {
  const gesture = {
    active: false,
    source: "",
    pointerId: null,
    touchId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastTime: 0,
    velocityX: 0,
    intent: "",
    startScrollLeft: 0,
    blockedClick: false,
  };

  function canStartGesture(target, source) {
    if (source === "schedule" && (!scheduleContent.contains(target) || dateTopBar.contains(target))) return false;
    if (source === "date" && !dateStrip.contains(target)) return false;
    return !isScheduleTransitioning && !isAnyModalOpen();
  }

  function beginGesture(source, x, y, target, pointerId = null, touchId = null) {
    if (!canStartGesture(target, source)) return false;
    gesture.active = true;
    gesture.source = source;
    gesture.pointerId = pointerId;
    gesture.touchId = touchId;
    gesture.startX = x;
    gesture.startY = y;
    gesture.lastX = x;
    gesture.lastTime = performance.now();
    gesture.velocityX = 0;
    gesture.intent = "";
    gesture.startScrollLeft = dateStrip.scrollLeft;
    gesture.blockedClick = false;
    return true;
  }

  function cancelGesture({ recenter = true } = {}) {
    const source = gesture.source;
    gesture.active = false;
    gesture.source = "";
    gesture.pointerId = null;
    gesture.touchId = null;
    gesture.intent = "";
    resetInteractionVisuals();
    if (recenter && source === "date") centerDateChip(selectedDateKey, { behavior: "smooth" });
  }

  function updateGesture(x, y, event) {
    if (!gesture.active) return;

    const dx = x - gesture.startX;
    const dy = y - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const now = performance.now();

    if (!gesture.intent) {
      if (Math.max(absX, absY) < gestureIntentDistance) return;
      gesture.intent = absX > absY * horizontalGestureRatio ? "horizontal" : "vertical";
      if (gesture.intent === "vertical") {
        cancelGesture({ recenter: false });
        return;
      }
      gesture.blockedClick = true;
      clickBlockUntil = now + 450;
      dateStrip.classList.toggle("dragging", gesture.source === "date");
    }

    if (gesture.intent !== "horizontal") return;
    event?.preventDefault?.();

    const elapsed = Math.max(1, now - gesture.lastTime);
    gesture.velocityX = (x - gesture.lastX) / elapsed;
    gesture.lastX = x;
    gesture.lastTime = now;

    const visualDx = applySwipePreview(dx);
    if (gesture.source === "date") {
      dateStrip.scrollLeft = gesture.startScrollLeft - visualDx;
    }
  }

  function finishGesture(x, y) {
    if (!gesture.active) return;

    const dx = x - gesture.startX;
    const dy = y - gesture.startY;
    const horizontal = gesture.intent === "horizontal" && Math.abs(dx) > Math.abs(dy) * horizontalGestureRatio;
    const targetIdx = horizontal ? targetIndexForSwipe(dx, gesture.velocityX) : -1;
    const source = gesture.source;
    const shouldBlockClick = gesture.blockedClick;

    gesture.active = false;
    gesture.source = "";
    gesture.pointerId = null;
    gesture.touchId = null;
    gesture.intent = "";

    if (shouldBlockClick) clickBlockUntil = performance.now() + 520;

    if (targetIdx >= 0 && goDate(targetIdx)) return;

    resetInteractionVisuals();
    if (source === "date") centerDateChip(selectedDateKey, { behavior: "smooth" });
  }

  if ("PointerEvent" in window) {
    const pointerDown = (source) => (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (!beginGesture(source, event.clientX, event.clientY, event.target, event.pointerId)) return;
      try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch (e) {}
    };

    const pointerMove = (event) => {
      if (!gesture.active || gesture.pointerId !== event.pointerId) return;
      updateGesture(event.clientX, event.clientY, event);
    };

    const pointerUp = (event) => {
      if (!gesture.active || gesture.pointerId !== event.pointerId) return;
      try { event.currentTarget.releasePointerCapture?.(event.pointerId); } catch (e) {}
      finishGesture(event.clientX, event.clientY);
    };

    const pointerCancel = (event) => {
      if (!gesture.active || gesture.pointerId !== event.pointerId) return;
      cancelGesture();
    };

    dateStrip.addEventListener("pointerdown", pointerDown("date"));
    scheduleContent.addEventListener("pointerdown", pointerDown("schedule"));
    [dateStrip, scheduleContent].forEach((element) => {
      element.addEventListener("pointermove", pointerMove);
      element.addEventListener("pointerup", pointerUp);
      element.addEventListener("pointercancel", pointerCancel);
      element.addEventListener("lostpointercapture", pointerCancel);
    });
    return;
  }

  const touchStart = (source) => (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    beginGesture(source, touch.clientX, touch.clientY, event.target, null, touch.identifier);
  };

  const touchMove = (event) => {
    if (!gesture.active) return;
    const touch = Array.from(event.touches).find((item) => item.identifier === gesture.touchId);
    if (touch) updateGesture(touch.clientX, touch.clientY, event);
  };

  const touchEnd = (event) => {
    if (!gesture.active) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === gesture.touchId);
    if (touch) finishGesture(touch.clientX, touch.clientY);
  };

  dateStrip.addEventListener("touchstart", touchStart("date"), { passive: true });
  scheduleContent.addEventListener("touchstart", touchStart("schedule"), { passive: true });
  [dateStrip, scheduleContent].forEach((element) => {
    element.addEventListener("touchmove", touchMove, { passive: false });
    element.addEventListener("touchend", touchEnd, { passive: true });
    element.addEventListener("touchcancel", () => cancelGesture(), { passive: true });
  });
}

async function openImageModal(kind = "contact") {
  activeImageKind = kind;
  qrModal.classList.toggle("is-contact-image", kind === "contact");
  const cached = imageCache.get(kind);
  if (cached?.found) {
    qrModalImage.src = cached.url;
    qrModal.classList.add("open");
    qrModal.setAttribute("aria-hidden", "false");
    refreshImageCache(kind).catch(() => {});
    return;
  }

  try {
    const image = await refreshImageCache(kind);
    if (!image.found) {
      showToast("图片正在赶来~");
      return;
    }
    qrModalImage.src = image.url;
  } catch (error) {
    showToast("图片读取失败");
    return;
  }
  qrModal.classList.add("open");
  qrModal.setAttribute("aria-hidden", "false");
}

function closeQrModal() {
  qrModal.classList.remove("open");
  qrModal.classList.remove("is-contact-image");
  qrModal.setAttribute("aria-hidden", "true");
  activeImageKind = "";
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {}
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("copy failed");
  } finally {
    textarea.remove();
  }
}

// === Hamburger Menu Dropdown ===
function readStoredThemeChoice() {
  try {
    const storedTheme = localStorage.getItem(themeChoiceStorageKey);
    return supportedThemeKeys.has(storedTheme) ? storedTheme : defaultThemeKey;
  } catch (error) {
    return defaultThemeKey;
  }
}

function storeThemeChoice(themeKey) {
  try {
    localStorage.setItem(themeChoiceStorageKey, themeKey);
  } catch (error) {
    // Ignore private-mode storage failures; the visible selection still updates.
  }
}

function positionMenuDropdown() {
  const rect = menuAnchor.getBoundingClientRect();
  const topBarRect = dateTopBar.getBoundingClientRect();
  const topBarStyle = getComputedStyle(dateTopBar);
  const topBarPaddingTop = parseFloat(topBarStyle.paddingTop) || 0;
  const topBarPaddingRight = parseFloat(topBarStyle.paddingRight) || 0;
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const viewportPadding = window.innerWidth <= 360 ? 12 : 16;
  const collapsedSize = 3.2 * rootFontSize;
  const panelWidth = Math.min(18 * rootFontSize, rect.right - viewportPadding);
  const panelHeight = Math.min(22 * rootFontSize, window.innerHeight - rect.top - viewportPadding);
  const right = Math.max(0, topBarRect.right - topBarPaddingRight - rect.right);
  const top = Math.max(0, rect.top - topBarRect.top - topBarPaddingTop);
  const scaleX = collapsedSize / panelWidth;
  const scaleY = collapsedSize / panelHeight;
  menuButton.style.setProperty("--menu-top", `${top}px`);
  menuButton.style.setProperty("--menu-right", `${right}px`);
  menuButton.style.setProperty("--menu-panel-width", `${panelWidth}px`);
  menuButton.style.setProperty("--menu-panel-height", `${panelHeight}px`);
  menuButton.style.setProperty("--menu-scale-x", scaleX.toFixed(5));
  menuButton.style.setProperty("--menu-scale-y", scaleY.toFixed(5));
  menuButton.style.setProperty("--menu-icon-scale-x", (1 / scaleX).toFixed(5));
  menuButton.style.setProperty("--menu-icon-scale-y", (1 / scaleY).toFixed(5));
}

function getMenuStageMaxHeight() {
  const menuTop = parseFloat(menuButton.style.getPropertyValue("--menu-top")) || 72;
  const viewportLimit = window.innerHeight - menuTop - 16;
  const seventyPercent = window.innerHeight * 0.7;
  return Math.max(180, Math.floor(Math.min(viewportLimit, seventyPercent) - 16));
}

function updateMenuStageHeight() {
  positionMenuDropdown();
}

function setMenuView(view) {
  const isThemeView = view === "theme";
  menuPopup.dataset.view = isThemeView ? "theme" : "main";
  mainMenuPanel?.classList.toggle("is-active", !isThemeView);
  themeMenuPanel?.classList.toggle("is-active", isThemeView);
  mainMenuPanel?.setAttribute("aria-hidden", isThemeView ? "true" : "false");
  themeMenuPanel?.setAttribute("aria-hidden", isThemeView ? "false" : "true");
  if (menuViewStage) menuViewStage.scrollTop = 0;
  updateMenuStageHeight();
  requestAnimationFrame(updateMenuStageHeight);
}

function resetMenuView() {
  setMenuView("main");
}

function openMenuPopup() {
  if (menuPopup.classList.contains("open")) return;
  window.clearTimeout(menuResetTimer);
  positionMenuDropdown();
  resetMenuView();
  menuButton.classList.add("is-open");
  menuPopup.classList.add("open");
  menuBackdrop?.classList.add("open");
  dateTopBar.classList.add("menu-open");
  menuPopup.setAttribute("aria-hidden", "false");
  menuBackdrop?.setAttribute("aria-hidden", "false");
  menuButton.setAttribute("aria-expanded", "true");
  menuButton.setAttribute("aria-label", "关闭菜单");
  requestAnimationFrame(updateMenuStageHeight);
}

function closeMenuPopup() {
  if (!menuPopup.classList.contains("open")) return;
  window.clearTimeout(menuResetTimer);
  menuPopup.classList.remove("open");
  menuBackdrop?.classList.remove("open");
  menuButton.classList.remove("is-open");
  dateTopBar.classList.remove("menu-open");
  menuPopup.setAttribute("aria-hidden", "true");
  menuBackdrop?.setAttribute("aria-hidden", "true");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "菜单");
  menuResetTimer = window.setTimeout(() => {
    if (!menuPopup.classList.contains("open")) resetMenuView();
  }, 180);
}

// 事件绑定
menuButton.addEventListener("click", (event) => {
  if (menuPopup.classList.contains("open")) return;
  event.stopPropagation();
  openMenuPopup();
});

menuButton.addEventListener("keydown", (event) => {
  if (menuPopup.classList.contains("open")) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openMenuPopup();
  }
});

qrModal.querySelector(".qr-modal-backdrop").addEventListener("click", closeQrModal);
qrCopyButton?.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  const text = qrCopyButton.dataset.copyText || "15656531239";
  try {
    await copyText(text);
    const originalText = qrCopyButton.textContent;
    qrCopyButton.textContent = "已复制";
    showToast("已复制");
    window.setTimeout(() => {
      qrCopyButton.textContent = originalText || "复制";
    }, 1200);
  } catch (error) {
    showToast("复制失败");
  }
});

menuBackdrop?.addEventListener("click", closeMenuPopup);

menuPopup.querySelectorAll(".menu-close-button").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    closeMenuPopup();
  });
});

// 点击页面其他位置关闭下拉
document.addEventListener("click", (e) => {
  if (
    menuPopup.classList.contains("open") &&
    !menuButton.contains(e.target)
  ) {
    closeMenuPopup();
  }
});

// 窗口变化时重新定位
const repositionMenuIfOpen = () => {
  positionMenuDropdown();
};
window.addEventListener("resize", repositionMenuIfOpen);
window.addEventListener("scroll", repositionMenuIfOpen, { passive: true });
positionMenuDropdown();
requestAnimationFrame(positionMenuDropdown);

themeBackButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setMenuView("main");
});

menuPopup.querySelectorAll(".menu-panel-main .menu-item").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    const action = btn.dataset.action;
    if (action === "theme-settings") {
      setMenuView("theme");
      return;
    }
    const label = btn.dataset.label || btn.textContent.trim();
    menuPopup.querySelectorAll(".menu-panel-main .menu-item").forEach((item) => {
      item.classList.toggle("is-active", item === btn);
      if (item === btn) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });
    closeMenuPopup();
    showToast(label);
  });
});

function setSelectedTheme(themeKey, shouldToast = false) {
  const nextTheme = supportedThemeKeys.has(themeKey) ? themeKey : defaultThemeKey;
  const themeOptions = menuPopup.querySelectorAll(".theme-option");
  let selectedLabel = "";
  let hasSelection = false;
  themeOptions.forEach((option) => {
    const isSelected = option.dataset.theme === nextTheme;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-checked", isSelected ? "true" : "false");
    if (isSelected) {
      hasSelection = true;
      selectedLabel = option.dataset.label || option.textContent.trim();
    }
  });
  if (!hasSelection && nextTheme !== defaultThemeKey) {
    setSelectedTheme(defaultThemeKey, shouldToast);
    return;
  }
  document.documentElement.dataset.theme = hasSelection ? nextTheme : defaultThemeKey;
  storeThemeChoice(hasSelection ? nextTheme : defaultThemeKey);
  if (shouldToast && selectedLabel) showToast(selectedLabel);
}

menuPopup.querySelectorAll(".theme-option").forEach((btn) => {
  btn.addEventListener("click", (event) => {
    event.stopPropagation();
    setSelectedTheme(btn.dataset.theme || defaultThemeKey, true);
    updateMenuStageHeight();
  });
});

setSelectedTheme(readStoredThemeChoice());

function connectEvents() {
  if (!("EventSource" in window)) {
    return;
  }
  // 线上 Worker 当前没有 /api/events，避免移动端控制台每次加载都产生无意义 404。
  const eventHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!eventHosts.has(window.location.hostname)) {
    return;
  }

  const events = new EventSource("/api/events");
  events.addEventListener("updated", () => patchScoresSilently());
  events.onerror = () => {
    events.close();
    setTimeout(connectEvents, 5000);
  };
}

async function patchScoresSilently() {
  try {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const days = Array.isArray(payload.days) ? payload.days : [];
    if (!hasAnyScheduleMatch(days)) return;
    const newMatches = days.flatMap((d) => d.matches || []);
    const newKeys = days.map((d) => d.dateKey).sort().join(",");

    const oldCount = scheduleDays.reduce((sum, d) => sum + (d.matches || []).length, 0);
    const oldKeys = scheduleDays.map((d) => d.dateKey).sort().join(",");

    if (newMatches.length !== oldCount || newKeys !== oldKeys) {
      scheduleDays = days;
      scheduleMarkupCache.clear();
      schedulePageCache.clear();
      buildDateStrip();
      renderSchedule({ animate: false });
      return;
    }

    const newMap = Object.create(null);
    for (const m of newMatches) newMap[m.matchNo] = m;

    document.querySelectorAll(".match-card[data-match-no]").forEach((card) => {
      const matchNo = card.dataset.matchNo;
      const m = newMap[matchNo];
      if (!m) return;
      const scoreArea = card.querySelector(".score-area");
      const statusEl = card.querySelector(".match-status");
      const timeEl = card.querySelector(".match-time");
      const newStatusHtml = matchStatusHtml(m);
      const isLive = newStatusHtml.includes("live");
      const isFinished = newStatusHtml.includes("finished");
      const shouldShowStatus = isLive || isFinished;

      if (scoreArea) {
        const newScoreHtml = scoreHtml(m);
        if (scoreArea.innerHTML !== newScoreHtml) scoreArea.innerHTML = newScoreHtml;
      }
      if (shouldShowStatus) {
        if (timeEl) timeEl.remove();
        if (statusEl) {
          if (statusEl.outerHTML !== newStatusHtml) statusEl.outerHTML = newStatusHtml;
        } else {
          const rightEl = card.querySelector(".match-card-right");
          if (rightEl) rightEl.insertAdjacentHTML("beforeend", newStatusHtml);
        }
      }
    });
  } catch (e) { /* silent */ }
}

enableScheduleInteractions();
pruneTeamLogoCache();
loadSchedule();
scheduleImagePreload();
connectEvents();

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") goDate(dateIndex(selectedDateKey) - 1);
  if (e.key === "ArrowRight") goDate(dateIndex(selectedDateKey) + 1);
  if (e.key === "Escape") {
    if (qrModal.classList.contains("open")) closeQrModal();
    if (menuPopup.classList.contains("open")) closeMenuPopup();
    if (aiDetailPage?.classList.contains("active")) closeStaticAiDetail();
  }
});

// ---- AI 分析详情页 ----
function findMatchByNo(matchNo) {
  for (const day of scheduleDays) {
    const found = (day.matches || []).find((m) => m.matchNo === matchNo);
    if (found) return { match: found, day };
  }
  return null;
}

function aiResultLabel(result) {
  return aiResultLabelMap[result] || "平";
}

function aiResultTone(result) {
  return aiResultToneMap[result] || "result-draw";
}

function aiDetailMatchCard(match, day) {
  const kickoff = compactKickoffDateTime(match, day);
  return `
    <article class="ai-detail-match-card">
      <div class="ai-detail-match-meta">
        <span>${renderMatchNo(match.matchNo)} · ${escapeHtml(match.league || "")}</span>
        <span>${escapeHtml(kickoff)}</span>
      </div>
      <div class="ai-detail-teams">
        <div class="ai-detail-team">
          ${teamBadgeHtml(match.home)}
          <strong>${escapeHtml(match.home || "主队")}</strong>
          <span class="team-name-sm tag-home">主</span>
        </div>
        <div class="ai-detail-vs">VS</div>
        <div class="ai-detail-team">
          ${teamBadgeHtml(match.away)}
          <strong>${escapeHtml(match.away || "客队")}</strong>
          <span class="team-name-sm tag-away">客</span>
        </div>
      </div>
    </article>
  `;
}

function openStaticAiDetail(matchNo) {
  const result = findMatchByNo(matchNo);
  if (!result || !aiDetailPage) return;
  activeAiDetailMatch = result.match;
  activeAiDetailDay = result.day;
  renderAiReportList(activeAiDetailMatch, activeAiDetailDay);
  aiDetailPage.classList.add("active");
  aiDetailPage.setAttribute("aria-hidden", "false");
  appShell?.setAttribute("aria-hidden", "true");
  document.body.classList.add("ai-detail-open");
  window.scrollTo({ top: 0, behavior: "auto" });
  requestAnimationFrame(() => hydrateTeamBadges(aiDetailPage));
}

function closeStaticAiDetail() {
  if (!aiDetailPage) return;
  aiDetailPage.classList.remove("active");
  aiDetailPage.setAttribute("aria-hidden", "true");
  appShell?.setAttribute("aria-hidden", "false");
  document.body.classList.remove("ai-detail-open");
  activeAiDetailMatch = null;
  activeAiDetailDay = null;
}

function renderAiReportList(match, day) {
  const reports = aiReportsForMatch(match);
  aiDetailPage.innerHTML = `
    <div class="ai-detail-shell" data-ai-view="list">
      <header class="ai-detail-topbar">
        <button class="ai-page-back" type="button" data-ai-action="close" aria-label="返回赛程">← 返回</button>
        <strong>AI分析详情</strong>
        <span aria-hidden="true"></span>
      </header>

      ${aiDetailMatchCard(match, day)}

      <section class="ai-model-list" aria-label="模型分析列表">
        ${reports.map((report, index) => `
          <article class="ai-model-card">
            <div class="ai-model-main">
              <div>
                <h3>${escapeHtml(report.modelName)}</h3>
                <p>${escapeHtml(report.summary)}</p>
              </div>
              <span class="ai-result-badge ${aiResultTone(report.result)}">${aiResultLabel(report.result)}</span>
            </div>
            <div class="ai-score-grid">
              <span>全场 <strong>${escapeHtml(report.fullScore)}</strong></span>
              <span>半场 <strong>${escapeHtml(report.halfScore)}</strong></span>
            </div>
            <button class="ai-report-open" type="button" data-report-index="${index}">查看报告</button>
          </article>
        `).join("")}
      </section>
    </div>
  `;
}

function renderAiReportDetail(match, day, report) {
  aiDetailPage.innerHTML = `
    <div class="ai-detail-shell" data-ai-view="report">
      <header class="ai-detail-topbar">
        <button class="ai-page-back" type="button" data-ai-action="list" aria-label="返回AI分析列表">← 返回</button>
        <strong>${escapeHtml(report.modelName)} 详细分析</strong>
        <span aria-hidden="true"></span>
      </header>

      ${aiDetailMatchCard(match, day)}

      <section class="ai-report-summary">
        <div class="ai-model-main">
          <div>
            <h3>${escapeHtml(report.modelName)}</h3>
            <p>${escapeHtml(report.summary)}</p>
          </div>
          <span class="ai-result-badge ${aiResultTone(report.result)}">${aiResultLabel(report.result)}</span>
        </div>
        <div class="ai-score-grid">
          <span>全场 <strong>${escapeHtml(report.fullScore)}</strong></span>
          <span>半场 <strong>${escapeHtml(report.halfScore)}</strong></span>
        </div>
      </section>

      <section class="ai-report-sections" aria-label="详细报告">
        ${(report.reportSections || []).map((section) => `
          <article class="ai-report-section">
            <h3>${escapeHtml(section.title)}</h3>
            <p>${escapeHtml(section.body)}</p>
          </article>
        `).join("")}
      </section>

      <p class="ai-disclaimer">本分析基于赛前公开数据和模型推理生成，仅供参考，不构成投注建议。</p>
    </div>
  `;
  requestAnimationFrame(() => hydrateTeamBadges(aiDetailPage));
}

aiDetailPage?.addEventListener("click", (event) => {
  const reportButton = event.target.closest(".ai-report-open");
  if (reportButton && activeAiDetailMatch && activeAiDetailDay) {
    const reportIndex = Number(reportButton.dataset.reportIndex || "0");
    const report = aiReportsForMatch(activeAiDetailMatch)[reportIndex];
    if (report) renderAiReportDetail(activeAiDetailMatch, activeAiDetailDay, report);
    return;
  }

  const actionButton = event.target.closest("[data-ai-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.aiAction;
  if (action === "close") {
    closeStaticAiDetail();
    return;
  }
  if (action === "list" && activeAiDetailMatch && activeAiDetailDay) {
    renderAiReportList(activeAiDetailMatch, activeAiDetailDay);
    requestAnimationFrame(() => hydrateTeamBadges(aiDetailPage));
  }
});

function openAiAnalysis(matchNo) {
  openStaticAiDetail(matchNo);
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".ai-analysis-btn");
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  openAiAnalysis(btn.dataset.matchNo);
});

// === GSAP-style Easing Functions ===
const gsapEasing = {
  power1: (t) => t,
  power2: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  power2In: (t) => t * t,
  power2Out: (t) => 1 - Math.pow(1 - t, 2),
  power3: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  power4: (t) => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2,
  back: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  elastic: (t) => {
    const c4 = (2 * Math.PI) / 3;
    return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

function gsapAnimate(duration, easing, onUpdate, onComplete, delayMs = 0) {
  const start = performance.now() + delayMs;
  function frame(now) {
    if (now < start) {
      requestAnimationFrame(frame);
      return;
    }
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = easing(progress);
    onUpdate(eased);
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else if (onComplete) {
      onComplete();
    }
  }
  requestAnimationFrame(frame);
}

// Enhanced scroll-to-center with GSAP-style easing
function smoothCenterTo(container, targetScroll, duration = 450) {
  const startScroll = container.scrollLeft;
  const delta = targetScroll - startScroll;
  if (Math.abs(delta) < 2) {
    container.scrollLeft = targetScroll;
    return;
  }
  gsapAnimate(
    duration,
    gsapEasing.power3,
    (t) => { container.scrollLeft = startScroll + delta * t; },
  );
}

// Enhanced match card stagger reveal
function staggerMatchCards(container, baseDelay = 50) {
  const cards = container.querySelectorAll(".match-card.reveal-delay-1, .match-card.reveal-delay-2, .match-card.reveal-delay-3, .match-card.reveal-delay-4, .match-card.reveal-delay-5");
  cards.forEach((card, i) => {
    card.style.animation = "none";
    card.offsetHeight;
    card.style.animation = `gsapReveal 500ms var(--ease-power3) ${baseDelay + i * 50}ms both`;
  });
}
