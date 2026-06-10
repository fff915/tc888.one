const dateStrip = document.getElementById("dateStrip");
const dateTopBar = document.getElementById("dateTopBar");
const scheduleContent = document.getElementById("schedule-content");
const toast = document.getElementById("toast");
const menuButton = document.getElementById("menuButton");
const menuPopup = document.getElementById("menuPopup");
const qrModal = document.getElementById("qrModal");
const qrModalImage = document.getElementById("qrModalImage");
const qrCopyButton = document.getElementById("qrCopyButton");

let scheduleDays = [];
let selectedDateKey = "";
let toastTimer;
let dateStripSuppressClick = false;
let dateStripScrollTimer = 0;
let dateStripProgrammaticTimer = 0;
let isDateStripProgrammatic = false;
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
const dateOffsets = [-4, -3, -2, -1, 0, 1];
const weekNames = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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
  isDateStripProgrammatic = true;
  clearTimeout(dateStripProgrammaticTimer);
  if (behavior === "auto") {
    dateStrip.scrollLeft = targetLeft;
  } else {
    smoothCenterTo(dateStrip, targetLeft, 400);
  }
  dateStripProgrammaticTimer = window.setTimeout(() => {
    isDateStripProgrammatic = false;
  }, behavior === "smooth" ? 420 : 40);
}

function closestCenteredDateKey() {
  const chips = Array.from(dateStrip.querySelectorAll(".date-chip"));
  if (!chips.length) return selectedDateKey;

  const stripRect = dateStrip.getBoundingClientRect();
  const centerX = stripRect.left + stripRect.width / 2;
  let closest = chips[0];
  let closestDistance = Infinity;

  chips.forEach((chip) => {
    const rect = chip.getBoundingClientRect();
    const distance = Math.abs(rect.left + rect.width / 2 - centerX);
    if (distance < closestDistance) {
      closest = chip;
      closestDistance = distance;
    }
  });

  return closest.dataset.date || selectedDateKey;
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

const teamLogoExactUrls = Object.freeze({
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
const teamLogoStorageKey = "qtcTeamLogoCache:v4";
const teamLogoSuccessTtl = 30 * 24 * 60 * 60 * 1000;
const teamLogoFailTtl = 3 * 24 * 60 * 60 * 1000;

function teamLogoProxyUrl(source, retryCount = 0) {
  const retry = retryCount ? `&retry=${retryCount}` : "";
  return `/api/team-logo?src=${encodeURIComponent(source)}${retry}`;
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
  return Array.from(new Set([team, ...(teamNameAliases[team] || [])].filter(Boolean)));
}

function logoNameVariants(name) {
  const text = String(name || "").trim();
  const spaced = text.replace(/\s+/g, " ");
  const hyphenated = spaced.replace(/\s+/g, "-");
  const compact = spaced.replace(/\s+/g, "");
  return Array.from(new Set([spaced, hyphenated, hyphenated.toLowerCase(), compact].filter(Boolean)));
}

function exactFlagLogoSources(teamName) {
  const code = teamFlagCodes[String(teamName || "").trim()];
  if (!code) return [];
  const lower = code.toLowerCase();
  const upper = code.toUpperCase();
  return [
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
  const directSrc = rawSrc.startsWith("http") ? `/api/team-logo?src=${encodeURIComponent(rawSrc)}` : rawSrc;
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
      image.src = url.startsWith("http") ? url : teamLogoProxyUrl(url, retryCount);
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
    <article class="match-card reveal-delay-${Math.min(index + 1, 5)}" data-match-no="${escapeHtml(match.matchNo)}">
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
          <span class="team-name-sm">主</span>
        </div>
        <div class="score-area">${scoreHtml(match)}</div>
        <div class="team">
          ${teamBadgeHtml(match.away)}
          <span class="team-name">${escapeHtml(match.away)}</span>
          <span class="team-name-sm team-name-spacer" aria-hidden="true">主</span>
        </div>
      </div>
      <div class="match-card-footer">
        <button class="ai-analysis-btn" type="button" data-match-no="${escapeHtml(match.matchNo)}">
          <svg class="ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          AI报告
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
      <div class="schedule-disclaimer">内容仅提供赛事数据分析整理，不做任何引导</div>
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

function isAnyModalOpen() {
  return qrModal.classList.contains("open") ||
    menuPopup.classList.contains("open") ||
    document.querySelector(".ai-modal-overlay") !== null;
}

function updateChips() {
  setDateChipActive(selectedDateKey);
  const active = dateStrip.querySelector(".date-chip.active");
  if (active) {
    const targetLeft = Math.max(0,
    active.offsetLeft - (dateStrip.clientWidth - active.offsetWidth) / 2
  );
    smoothCenterTo(dateStrip, targetLeft, 400);
  }
}

function goDate(idx) {
  const dates = dateItems();
  if (idx < 0 || idx >= dates.length) return false;
  if (idx === dateIndex(selectedDateKey)) return false;
  if (isScheduleTransitioning || isAnyModalOpen()) return false;

  isScheduleTransitioning = true;

  window.setTimeout(() => {
    if (isScheduleTransitioning) {
      isScheduleTransitioning = false;
      resetSwipeVisuals();
    }
  }, 1800);

  const dir = idx > dateIndex(selectedDateKey) ? -1 : 1;
  const oldCards = scheduleContent.querySelectorAll(".match-card");

  const tlOut = gsap.timeline({
    onComplete() {
      selectedDateKey = dates[idx].dateKey;
      updateChips();

      // 直接生成新HTML，避免缓存元素被移除后无法重用
      const pageHtml = pageHtmlForDate(selectedDateKey);
  scheduleContent.innerHTML = pageHtml;
  const page = scheduleContent.firstElementChild;
      hydrateTeamBadges(page);
      preloadAdjacentSchedules(selectedDateKey);

      const newCards = scheduleContent.querySelectorAll(".match-card");
      gsap.set(newCards, { xPercent: dir * -60, opacity: 0 });

      gsap.timeline({
        onComplete() {
          isScheduleTransitioning = false;
          resetSwipeVisuals();
        },
      }).to(newCards, {
        xPercent: 0,
        opacity: 1,
        duration: 0.28,
        ease: "power2.out",
        stagger: 0.04,
      });
    },
  });

  tlOut.to(oldCards, {
    xPercent: dir * 60,
    opacity: 0,
    duration: 0.2,
    ease: "power2.in",
    stagger: 0.03,
  });

  return true;
}

function resetSchedulePageState(page, active = false) {
  page.className = active ? "schedule-page active" : "schedule-page";
  page.style.removeProperty("--swipe-scale");
  page.style.removeProperty("--swipe-opacity");
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
    scheduleContent.classList.remove("is-transitioning", "is-swiping");
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
    scheduleDays = payload.days || [];
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
    scheduleContent.innerHTML = `
      <div class="empty-page">
        <div class="empty-inner">
          <p class="empty-title">数据读取失败</p>
          <p class="empty-desc">请确认后台服务正在运行，然后刷新页面。</p>
        </div>
      </div>
    `;
  }
}

function bindDateChipClicks() {
  dateStrip.querySelectorAll(".date-chip").forEach((chip) => {
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      selectDate(chip.dataset.date, { animate: true, center: true, scrollTop: true });
    });
  });
}

function enableDateStripDrag() {
  const obs = {
    active: false,
    startX: 0,
  };

  dateStrip.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    obs.active = true;
    obs.startX = event.clientX;
    obs.hasMoved = false;
    dateStrip.classList.add("dragging");
  });

  dateStrip.addEventListener("pointermove", (event) => {
    if (!obs.active) return;
    const dx = event.clientX - obs.startX;
    if (!obs.hasMoved && Math.abs(dx) > 3) {
      obs.hasMoved = true;
      try { dateStrip.setPointerCapture?.(event.pointerId); } catch (e) {}
    }
    if (!obs.hasMoved) return;
    dateStrip.scrollLeft -= event.movementX;
  });

  function endObserver(event) {
    if (!obs.active) return;
    obs.active = false;
    dateStrip.classList.remove("dragging");
    try { dateStrip.releasePointerCapture?.(event.pointerId); } catch (e) {}

    if (!obs.hasMoved) return;

    const dx = event.clientX - obs.startX;
    if (Math.abs(dx) < 45) return;

    const dates = dateItems();
    const curIdx = dateIndex(selectedDateKey);
    const dir = dx > 0 ? -1 : 1;
    const targetIdx = curIdx + dir;
    if (targetIdx < 0 || targetIdx >= dates.length) return;

    dateStripSuppressClick = true;
    selectDate(dates[targetIdx].dateKey, { animate: true, center: true, scrollTop: true });
    window.setTimeout(() => { dateStripSuppressClick = false; }, 250);
  }

  dateStrip.addEventListener("pointerup", endObserver);
  dateStrip.addEventListener("pointercancel", endObserver);
  dateStrip.addEventListener(
    "scroll",
    () => {
      if (isDateStripProgrammatic || obs.active) return;
      clearTimeout(dateStripScrollTimer);
      dateStripScrollTimer = window.setTimeout(snapDateStripToCenter, 110);
    },
    { passive: true },
  );
}

function snapDateStripToCenter() {
  if (isScheduleTransitioning) return;
  const centeredDateKey = closestCenteredDateKey();
  if (!centeredDateKey) return;
  selectDate(centeredDateKey, { animate: centeredDateKey !== selectedDateKey, center: true, scrollTop: true });
}

document.addEventListener(
  "click",
  (event) => {
    if (isScheduleTransitioning || performance.now() < clickBlockUntil) {
      if (dateStrip.contains(event.target)) return;
      if (scheduleContent.contains(event.target)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  },
  true,
);

function resetSwipeVisuals() {
  scheduleContent.classList.remove("is-swiping");
  scheduleContent.style.removeProperty("--swipe-opacity");
  scheduleContent.style.removeProperty("--swipe-scale");
  document.documentElement.classList.remove("is-horizontal-swiping");
  document.body.classList.remove("is-horizontal-swiping");
}

function enableSchedulePagerSwipe() {
  Observer.create({
    target: window,
    type: "touch,pointer",
    onLeft: () => goDate(dateIndex(selectedDateKey) + 1),
    onRight: () => goDate(dateIndex(selectedDateKey) - 1),
    dragMinimum: 45,
    preventDefault: false,
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
function positionMenuDropdown() {
  const rect = menuButton.getBoundingClientRect();
  menuPopup.style.top = (rect.bottom + 4) + "px";
  menuPopup.style.right = (window.innerWidth - rect.right) + "px";
  menuPopup.style.left = "auto";
  menuPopup.style.bottom = "auto";
}

function openMenuPopup() {
  if (menuPopup.classList.contains("open")) return;
  positionMenuDropdown();
  menuPopup.classList.add("open");
  menuPopup.setAttribute("aria-hidden", "false");
}

function closeMenuPopup() {
  if (!menuPopup.classList.contains("open")) return;
  menuPopup.classList.remove("open");
  menuPopup.setAttribute("aria-hidden", "true");
}

// 事件绑定
menuButton.addEventListener("click", () => {
  if (menuPopup.classList.contains("open")) {
    closeMenuPopup();
  } else {
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

// 点击遮罩空白处关闭
menuPopup.addEventListener("click", (e) => {
  if (e.target === menuPopup) closeMenuPopup();
});

// 点击页面其他位置关闭下拉
document.addEventListener("click", (e) => {
  if (menuPopup.classList.contains("open") && !menuButton.contains(e.target) && !menuPopup.contains(e.target)) {
    closeMenuPopup();
  }
});

// 窗口 resize 时重新定位
window.addEventListener("resize", () => {
  if (menuPopup.classList.contains("open")) positionMenuDropdown();
});

menuPopup.querySelectorAll(".menu-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    const action = btn.dataset.action;
    closeMenuPopup();
    showToast(`${action === "item5" ? "暂未开放" : `选项 ${action.replace("item", "")}`}`);
  });
});

// Cloudflare Workers 不支持 SSE，改用每 30 秒轮询
let scorePollTimer = 0;

function connectEvents() {
  scorePollTimer = window.setInterval(() => {
    patchScoresSilently();
  }, 30000);
}

async function patchScoresSilently() {
  try {
    const response = await fetch("/api/schedule", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    const days = payload.days || [];
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

enableDateStripDrag();
enableSchedulePagerSwipe();
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
    const aiOverlay = document.querySelector(".ai-modal-overlay");
    if (aiOverlay) aiOverlay.remove();
  }
});

// ---- AI 分析弹窗 ----
const aiReportCache = new Map();
function findMatchByNo(matchNo) {
  for (const day of scheduleDays) {
    const found = (day.matches || []).find((m) => m.matchNo === matchNo);
    if (found) return { match: found, day };
  }
  return null;
}

function aiPeekHtml(match, day) {
  return '<span class="ai-peek-arrow"></span>';
}

function aiCurrentHtml(match) {
  const scoreDisplay = (match.homeScore ?? "") && (match.awayScore ?? "")
    ? `${match.homeScore}∶${match.awayScore}`
    : "VS";
  const fullScore = match.fullScore || "";
  const halfScore = match.halfScore || match.apiHalfTimeScore || "";
  const league = match.league || "";
  const kickoff = match.kickoff
    ? new Date(match.kickoff).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  return `
    <div class="ai-modal-match">
      <div class="ai-modal-teams">
        <div class="ai-modal-team">
          ${teamBadgeHtml(match.home)}
          <span>${escapeHtml(match.home)}</span>
        </div>
        <span class="ai-modal-score">${escapeHtml(scoreDisplay)}</span>
        <div class="ai-modal-team">
          ${teamBadgeHtml(match.away)}
          <span>${escapeHtml(match.away)}</span>
        </div>
      </div>
      <div class="ai-modal-meta">${escapeHtml(league)} · ${escapeHtml(kickoff)}${fullScore ? ` · 全场 ${escapeHtml(fullScore)}` : ""}${halfScore ? ` · 半场 ${escapeHtml(halfScore)}` : ""}</div>
      <button class="ai-modal-close" type="button" aria-label="关闭">&times;</button>
    </div>
    <div class="ai-modal-tabs">
      <button class="ai-tab active" type="button" data-ai="deepseek">
        <svg class="ai-tab-icon" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" opacity="0.3"/><path d="M12 10L2 15l10 5 10-5-10-5z" fill="currentColor" opacity="0.6"/></svg>
        DeepSeek
      </button>
      <button class="ai-tab" type="button" data-ai="doubao">
        <svg class="ai-tab-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.2"/><path d="M8 11c0-2 1-3 4-3s4 1 4 3c0 2-1 4-4 4s-4-2-4-4z" fill="currentColor"/></svg>
        豆包
      </button>
    </div>
    <div class="ai-modal-body">
      <div class="ai-modal-indicator">
        <span class="ai-indicator-dot active" data-ai="deepseek"></span>
        <span class="ai-indicator-dot" data-ai="doubao"></span>
      </div>
      <div class="ai-modal-section ai-section-deepseek active">
        <div class="ai-report-loading">
          <div class="ai-report-spinner"></div>
          <span>加载中...</span>
        </div>
      </div>
      <div class="ai-modal-section ai-section-doubao">
        <div class="ai-report-loading">
          <div class="ai-report-spinner"></div>
          <span>加载中...</span>
        </div>
      </div>
    </div>
  `;
}

function renderAiReportContent(text) {
  if (!text || !text.trim()) return "<p>暂无分析内容</p>";

  let out = "";
  let inList = false;
  const lines = text.split("\n");

  for (const raw of lines) {
    let line = raw.trim();
    if (!line) { out += ""; continue; }

    const escaped = escapeHtml(line);

    if (/^---+$/.test(line) || /^\*\*\*+$/.test(escaped)) {
      out += '<hr class="ai-hr">';
      continue;
    }

    if (/^###\s+/.test(line)) {
      const heading = escaped.replace(/^###\s+/, "");
      out += `<h3 class="ai-heading ai-h3"><span class="ai-h3-bar"></span>${heading}</h3>`;
      continue;
    }
    if (/^####\s+/.test(line)) {
      const heading = escaped.replace(/^####\s+/, "");
      out += `<h4 class="ai-heading ai-h4">${heading}</h4>`;
      continue;
    }

    if (/^\*\s+/.test(line)) {
      if (!inList) { out += '<ul class="ai-list">'; inList = true; }
      const body = escaped.replace(/^\*\s+/, "");
      out += `<li>${body}</li>`;
      continue;
    }

    if (inList) { out += "</ul>"; inList = false; }

    let processed = escaped;
    processed = processed.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    processed = processed.replace(/^(\d+)\.\s*\*\*(.+?)\*\*\s*/g, '<span class="ai-section-num">$1.</span> <strong>$2</strong> ');
    processed = processed.replace(/^(\d+)\.\s+(.+)$/g, '<span class="ai-section-num">$1.</span> $2');

    const hasSegment = /^[🏆📊📈🤝⚽🎯🔍💡⚠️✅🔥📋🎲💰]/.test(line);
    const cls = hasSegment ? "ai-line ai-line-icon" : "ai-line";
    out += `<p class="${cls}">${processed}</p>`;
  }

  if (inList) out += "</ul>";

  return `<div class="ai-modal-text">${out}</div>`;
}

function populateAiReportSection(section, content) {
  if (!content) {
    section.innerHTML = '<div class="ai-report-error">⚠ 分析报告生成失败，请稍后重试</div>';
    return;
  }
  section.innerHTML = renderAiReportContent(content);
}

function loadAiReport(matchNo, modal) {
  const dsSection = modal.querySelector(".ai-section-deepseek");
  const dbSection = modal.querySelector(".ai-section-doubao");

  // Check frontend cache first — instant display if already fetched
  const cached = aiReportCache.get(matchNo);
  if (cached) {
    populateAiReportSection(dsSection, cached.deepseek?.content);
    populateAiReportSection(dbSection, cached.doubao?.content);
    return;
  }

  fetch(`/api/ai-report?matchNo=${encodeURIComponent(matchNo)}`)
    .then((r) => r.json())
    .then((data) => {
      if (!data.ok) {
        if (dsSection) dsSection.innerHTML = '<div class="ai-report-error">API 不可用</div>';
        if (dbSection) dbSection.innerHTML = '<div class="ai-report-error">API 不可用</div>';
        return;
      }
      if (data.pending) {
        if (data.triggered) {
          if (dsSection) dsSection.innerHTML = '<div class="ai-report-notice">分析已后台生成中，请稍后重新打开查看</div>';
          if (dbSection) dbSection.innerHTML = '<div class="ai-report-notice">分析已后台生成中，请稍后重新打开查看</div>';
        } else {
          pollAiReport(matchNo, modal, 0);
        }
        return;
      }
      const reports = data.reports || {};
      aiReportCache.set(matchNo, reports);
      populateAiReportSection(dsSection, reports.deepseek?.content);
      populateAiReportSection(dbSection, reports.doubao?.content);
    })
    .catch(() => {
      if (dsSection) dsSection.querySelector(".ai-report-loading");
      if (dbSection) dbSection.querySelector(".ai-report-loading");
    });
}

function pollAiReport(matchNo, modal, attempt) {
  if (attempt > 30) return;
  setTimeout(() => {
    fetch(`/api/ai-report?matchNo=${encodeURIComponent(matchNo)}`)
      .then((r) => r.json())
      .then((data) => {
        const dsSection = modal.querySelector(".ai-section-deepseek");
        const dbSection = modal.querySelector(".ai-section-doubao");
        if (!data.ok) return;
        if (data.pending) {
          pollAiReport(matchNo, modal, attempt + 1);
          return;
        }
        const reports = data.reports || {};
        aiReportCache.set(matchNo, reports);
        populateAiReportSection(dsSection, reports.deepseek?.content);
        populateAiReportSection(dbSection, reports.doubao?.content);
      })
      .catch(() => { pollAiReport(matchNo, modal, attempt + 1); });
  }, 3000);
}

function buildAiModalHtml(match, day) {
  const matches = day.matches || [];
  const idx = matches.indexOf(match);
  const prevMatch = matches[idx - 1] || null;
  const nextMatch = matches[idx + 1] || null;

  const topPeek = prevMatch
    ? `<div class="ai-match-peek top" data-match-no="${escapeHtml(prevMatch.matchNo)}">${aiPeekHtml(prevMatch, day)}</div>`
    : "";
  const bottomPeek = nextMatch
    ? `<div class="ai-match-peek bottom" data-match-no="${escapeHtml(nextMatch.matchNo)}">${aiPeekHtml(nextMatch, day)}</div>`
    : "";

  return topPeek + `<div class="ai-modal-pager" data-match-no="${escapeHtml(match.matchNo)}">${aiCurrentHtml(match)}</div>` + bottomPeek;
}

function openAiAnalysis(matchNo) {
  const result = findMatchByNo(matchNo);
  if (!result) return;
  let currentMatch = result.match;
  let currentDay = result.day;

  const existing = document.querySelector(".ai-modal-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "ai-modal-overlay";

  const modal = document.createElement("div");
  modal.className = "ai-modal";
  modal.innerHTML = buildAiModalHtml(currentMatch, currentDay);

  overlay.appendChild(modal);

  let isAiSwipeTransitioning = false;

  function bindAiTabs() {
    const aiOrder = ["deepseek", "doubao"];

    function switchAiTab(ai) {
      modal.querySelectorAll(".ai-tab").forEach((t) => t.classList.toggle("active", t.dataset.ai === ai));
      modal.querySelectorAll(".ai-section-deepseek, .ai-section-doubao").forEach((s) => s.classList.toggle("active", s.classList.contains(`ai-section-${ai}`)));
      modal.querySelectorAll(".ai-indicator-dot").forEach((d) => d.classList.toggle("active", d.dataset.ai === ai));
    }

    modal.querySelectorAll(".ai-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchAiTab(tab.dataset.ai));
    });

    function bindAiSwipe(el) {
      let startX = 0;
      let tracking = false;

      el.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button")) return;
        startX = e.clientX;
        tracking = true;
      });

      el.addEventListener("pointermove", () => {
        if (!tracking) return;
      });

      el.addEventListener("pointerup", (e) => {
        if (!tracking) return;
        tracking = false;
        const dx = e.clientX - startX;
        if (Math.abs(dx) < 40) return;
        const current = modal.querySelector(".ai-tab.active").dataset.ai;
        const curIdx = aiOrder.indexOf(current);
        const nextIdx = dx < 0 ? curIdx + 1 : curIdx - 1;
        if (nextIdx >= 0 && nextIdx < aiOrder.length) switchAiTab(aiOrder[nextIdx]);
      });

      el.addEventListener("pointercancel", () => { tracking = false; });
    }

    bindAiSwipe(modal.querySelector(".ai-modal-tabs"));
    bindAiSwipe(modal.querySelector(".ai-modal-body"));
  }

  function switchToMatch(targetMatch) {
    if (isAiSwipeTransitioning) return;
    if (targetMatch === currentMatch) return;

    const result2 = findMatchByNo(targetMatch.matchNo);
    if (!result2) return;
    const newMatch = result2.match;
    const newDay = result2.day;

    const oldPager = modal.querySelector(".ai-modal-pager");
    const oldPeeks = modal.querySelectorAll(".ai-match-peek");

    isAiSwipeTransitioning = true;

    const matches = (newDay.matches || []);
    const newIdx = matches.indexOf(newMatch);
    const oldIdx = (currentDay.matches || []).indexOf(currentMatch);
    const dir = newIdx > oldIdx ? 1 : -1;

    gsap.to(oldPager, {
      yPercent: dir * -100,
      opacity: 0,
      duration: 0.2,
      ease: "power2.in",
      onComplete() {
        gsap.to(oldPeeks, { opacity: 0, duration: 0.12, onComplete() {
        currentMatch = newMatch;
        currentDay = newDay;

        modal.innerHTML = buildAiModalHtml(newMatch, newDay);
        modal.querySelector(".ai-modal-close").addEventListener("click", close);
        bindAiTabs();
        bindAiPeeks();
        bindAiVerticalSwipe();
        requestAnimationFrame(() => hydrateTeamBadges(modal));
        loadAiReport(newMatch.matchNo, modal);

        const newPager = modal.querySelector(".ai-modal-pager");
        const newPeeks = modal.querySelectorAll(".ai-match-peek");

        gsap.set(newPager, { yPercent: dir * 100, opacity: 0 });
        gsap.set(newPeeks, { opacity: 0 });

        gsap.to(newPager, {
          yPercent: 0,
          opacity: 1,
          duration: 0.28,
          ease: "power2.out",
        });
        gsap.to(newPeeks, {
          opacity: 1,
          duration: 0.35,
          ease: "power2.out",
          onComplete() {
            isAiSwipeTransitioning = false;
            newPeeks.forEach((el) => { el.style.removeProperty("opacity"); });
          },
        });
        }});
      },
    });
  }

  function bindAiVerticalSwipe() {
    let startY = 0;
    let startX = 0;
    let tracking = false;

    modal.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest(".ai-modal-body")) return;
      startY = e.clientY;
      startX = e.clientX;
      tracking = true;
    });

    modal.addEventListener("pointermove", () => {
      if (!tracking) return;
    });

    modal.addEventListener("pointerup", (e) => {
      if (!tracking) return;
      tracking = false;
      const dy = e.clientY - startY;
      const dx = e.clientX - startX;
      if (Math.abs(dy) < 40 || Math.abs(dy) < Math.abs(dx)) return;

      const matches = currentDay.matches || [];
      const curIdx = matches.indexOf(currentMatch);
      const nextIdx = dy > 0 ? curIdx - 1 : curIdx + 1;
      if (nextIdx < 0 || nextIdx >= matches.length) return;
      switchToMatch(matches[nextIdx]);
    });

    modal.addEventListener("pointercancel", () => { tracking = false; });
  }

  function bindAiPeeks() {
    modal.querySelectorAll(".ai-match-peek").forEach((peek) => {
      peek.addEventListener("click", () => {
        const mn = peek.dataset.matchNo;
        const matches = currentDay.matches || [];
        const target = matches.find((m) => m.matchNo === mn);
        if (target) switchToMatch(target);
      });
    });
  }

  const close = () => {
    overlay.classList.add("closing");
    const onTransitionEnd = () => {
      if (document.body.contains(overlay)) overlay.remove();
      overlay.removeEventListener("transitionend", onTransitionEnd);
    };
    overlay.addEventListener("transitionend", onTransitionEnd, { once: true });
    setTimeout(() => { if (document.body.contains(overlay)) overlay.remove(); }, 320);
  };

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  modal.querySelector(".ai-modal-close").addEventListener("click", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, { once: true });

  bindAiTabs();
  bindAiPeeks();
  bindAiVerticalSwipe();
  requestAnimationFrame(() => hydrateTeamBadges(modal));
  loadAiReport(matchNo, modal);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.classList.add("open");
  });
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
