const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const params = new URLSearchParams(location.search);
const paramDate = params.get("date");

const state = {
  year: 2026,
  month: 8,
  selected: paramDate || isoTodayInRange() || "2026-09-02",
  hidden: new Set(),
};

if (paramDate) {
  const d = parseISO(paramDate);
  state.year = d.getFullYear();
  state.month = d.getMonth();
}

function isoTodayInRange() {
  const t = new Date();
  const iso = toISO(t);
  if (iso >= "2026-08-01" && iso <= "2028-07-31") return iso;
  return null;
}

function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtLong(iso) {
  return parseISO(iso).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function fmtTime(t) {
  if (!t) return "";
  const [h, min] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p.m." : "a.m.";
  const hr = ((h + 11) % 12) + 1;
  return min ? `${hr}:${String(min).padStart(2, "0")} ${ampm}` : `${hr}:00 ${ampm}`;
}

function visibleEvents() {
  return EVENTS.filter((e) => !state.hidden.has(e.course));
}

function eventsOn(iso) {
  return visibleEvents()
    .filter((e) => e.date === iso)
    .sort((a, b) => {
      const order = { class: 0, break: 1, assignment: 2 };
      const ta = a.start || "99:99";
      const tb = b.start || "99:99";
      if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type];
      return ta.localeCompare(tb);
    });
}

function typeLabel(type) {
  if (type === "class") return "Class / session";
  if (type === "assignment") return "Assignment / deadline";
  return "No class";
}

function isPhone() {
  return window.matchMedia("(max-width: 700px)").matches;
}

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
}

function goMonth(delta) {
  const d = new Date(state.year, state.month + delta, 1);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const selected = parseISO(state.selected);
  const keep = Math.min(selected.getDate(), daysInMonth);
  state.selected = toISO(new Date(state.year, state.month, keep));
  render();
}

function mondayIndex(jsDay) {
  return (jsDay + 6) % 7;
}

function renderLegend() {
  const el = document.getElementById("legend");
  el.innerHTML = "";
  Object.values(COURSES).forEach((c) => {
    const btn = document.createElement("button");
    btn.className = "chip" + (state.hidden.has(c.id) ? "" : " active");
    btn.type = "button";
    btn.innerHTML = `<span class="swatch"><i style="background:var(--${c.hue}-class)"></i><i style="background:var(--${c.hue}-asg)"></i></span>${c.short}`;
    btn.title = `${c.code} · ${c.name}\nDark = class, light = assignment`;
    btn.addEventListener("click", () => {
      if (state.hidden.has(c.id)) state.hidden.delete(c.id);
      else state.hidden.add(c.id);
      render();
    });
    el.appendChild(btn);
  });
  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Dark chip = class  ·  Light chip = assignment due  ·  Click a course to hide it";
  el.appendChild(hint);
}

function renderCalendar() {
  document.getElementById("monthLabel").textContent =
    `${MONTHS[state.month]} ${state.year}`;

  const first = new Date(state.year, state.month, 1);
  const startOffset = mondayIndex(first.getDay());
  const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
  const prevDays = new Date(state.year, state.month, 0).getDate();
  const cells = [];

  for (let i = 0; i < startOffset; i++) {
    const day = prevDays - startOffset + i + 1;
    const d = new Date(state.year, state.month - 1, day);
    cells.push({ date: d, out: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(state.year, state.month, d), out: false });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const extra = cells.length - (startOffset + daysInMonth) + 1;
    cells.push({ date: new Date(state.year, state.month + 1, extra), out: true });
  }

  const grid = document.getElementById("grid");
  grid.innerHTML = "";
  const labels = isPhone() ? WEEKDAYS_SHORT : WEEKDAYS;
  labels.forEach((name) => {
    const h = document.createElement("div");
    h.className = "dow";
    h.textContent = name;
    grid.appendChild(h);
  });
  const todayISO = toISO(new Date());

  cells.forEach(({ date, out }) => {
    const iso = toISO(date);
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell" + (out ? " out" : "") + (iso === todayISO ? " today" : "") + (iso === state.selected ? " selected" : "");
    cell.setAttribute("aria-label", fmtLong(iso));
    const events = eventsOn(iso);
    const shown = events.slice(0, 3);
    const extra = events.length - shown.length;
    cell.innerHTML = `<div class="num">${date.getDate()}</div><div class="pills"></div><div class="dots"></div>`;
    const pills = cell.querySelector(".pills");
    shown.forEach((e) => {
      const hue = COURSES[e.course].hue;
      const p = document.createElement("div");
      p.className = `pill ${e.type} ${hue}`;
      p.textContent = e.title.replace(/^Week \d+ · /, "");
      pills.appendChild(p);
    });
    if (extra > 0) {
      const m = document.createElement("div");
      m.className = "more";
      m.textContent = `+${extra} more`;
      pills.appendChild(m);
    }
    const dots = cell.querySelector(".dots");
    events.slice(0, 4).forEach((e) => {
      const d = document.createElement("i");
      d.className = `dot ${e.type} ${COURSES[e.course].hue}`;
      dots.appendChild(d);
    });
    cell.addEventListener("click", () => {
      state.selected = iso;
      if (out) {
        state.year = date.getFullYear();
        state.month = date.getMonth();
      }
      render();
      if (isPhone()) {
        requestAnimationFrame(() => {
          document.getElementById("dayPanel").scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
    grid.appendChild(cell);
  });
}

function renderSide() {
  const iso = state.selected;
  document.getElementById("sideTitle").textContent = parseISO(iso).getDate();
  document.getElementById("sideWhen").textContent = fmtLong(iso);
  const list = document.getElementById("sideList");
  const events = eventsOn(iso);
  if (!events.length) {
    list.innerHTML = `<p class="empty">Nothing scheduled this day (for the courses you have visible).</p>`;
    return;
  }
  list.innerHTML = events.map((e) => {
    const c = COURSES[e.course];
    const time = e.type === "assignment"
      ? (e.start ? `Due ${fmtTime(e.start)}` : "Deadline")
      : e.start
        ? `${fmtTime(e.start)}${e.end ? " – " + fmtTime(e.end) : ""}`
        : "Time TBA";
    const loc = e.location ? `<div class="meta">${e.location}</div>` : "";
    const notes = e.notes ? `<p class="notes">${e.notes}</p>` : "";
    return `<article class="card ${c.hue} ${e.type}">
      <div class="tag">${c.code} · ${typeLabel(e.type)}</div>
      <h4>${e.title}</h4>
      <div class="meta">${time}</div>
      ${loc}
      ${notes}
    </article>`;
  }).join("");
}

function reminderStatusText() {
  const file = location.protocol === "file:";
  const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  const next = nextDeadlineReminders()[0];
  let nextLine = "No upcoming deadlines.";
  if (next) {
    const when = next.days === 0 ? "today" : next.days === 1 ? "tomorrow" : `in ${next.days} days`;
    const remindIn = next.days - REMINDER_DAYS_BEFORE;
    const remind = remindIn <= 0 ? "reminder window is now" : `alert ${remindIn} day${remindIn === 1 ? "" : "s"} before that`;
    nextLine = `Next: ${COURSES[next.event.course].short} — ${next.event.title} (${when}; ${remind}).`;
  }
  if (file) {
    return `Open this app over http:// (not as a file) so notifications can work. ${nextLine}`;
  }
  if (isIOS() && !isStandalone()) {
    return `On iPhone: Add to Home Screen, then enable reminders. Or tap Add to Calendar for lock-screen alerts. ${nextLine}`;
  }
  if (perm === "granted") return `Reminders on: you will be alerted 2 days before each deadline. ${nextLine}`;
  if (perm === "denied") return `Notifications are blocked in the browser. Allow them in settings, or add the calendar file to iPhone/Mac Calendar. ${nextLine}`;
  return `Turn on reminders to get a notification 2 days before each assignment deadline. ${nextLine}`;
}

function renderRemindBar() {
  const p = document.getElementById("remindStatus");
  p.textContent = reminderStatusText();
  p.className = location.protocol === "file:" ? "file-warn" : "";
  const banner = document.getElementById("iosInstall");
  if (banner) banner.hidden = !(isIOS() && !isStandalone());
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function icsStamp(date, time, isUtc) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  if (!time) return `${y}${m}${d}`;
  const [h, min] = time.split(":");
  const stamp = `${y}${m}${d}T${h}${min}00`;
  return isUtc ? `${stamp}Z` : stamp;
}

function escapeIcs(text) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function downloadDeadlineCalendar() {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EP Course Calendar//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:EP deadlines (2-day alert)",
  ];
  assignmentEvents().forEach((e) => {
    const due = parseISODate(e.date);
    const [hh, mm] = (e.start || "23:59").split(":");
    due.setHours(Number(hh), Number(mm), 0, 0);
    const course = COURSES[e.course];
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${e.id}@ep-calendar`);
    lines.push(`DTSTAMP:${icsStamp(new Date(), "00:00", false)}`);
    lines.push(`DTSTART:${icsStamp(due, e.start || "23:59", false)}`);
    lines.push(`SUMMARY:${escapeIcs(course.short + " · " + e.title)}`);
    lines.push(`DESCRIPTION:${escapeIcs(e.notes || "")}`);
    if (e.location) lines.push(`LOCATION:${escapeIcs(e.location)}`);
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-P2D");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escapeIcs("Due in 2 days: " + e.title)}`);
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ep-deadlines.ics";
  a.click();
  URL.revokeObjectURL(a.href);
}

async function registerApp() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return null;
  const reg = await navigator.serviceWorker.register("./sw.js");
  if (reg.periodicSync) {
    try {
      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state === "granted") {
        await reg.periodicSync.register("deadline-check", { minInterval: 12 * 60 * 60 * 1000 });
      }
    } catch (err) {
      /* not supported */
    }
  }
  return reg;
}

async function askAndNotify() {
  if (location.protocol === "file:") {
    alert("Serve the app over http:// so the browser can send notifications. Then tap Enable reminders again.");
    return;
  }
  if (!("Notification" in window)) {
    alert("This browser does not support notifications. Download the calendar file instead.");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    renderRemindBar();
    return;
  }
  const reg = await registerApp();
  const result = await fireDueReminders(reg || { showNotification: (title, opts) => new Notification(title, opts) });
  if (!result.fired) {
    const next = nextDeadlineReminders()[0];
    const sample = next ? next.event : assignmentEvents()[0];
    if (sample && reg) {
      const payload = notificationPayload(sample);
      await reg.showNotification("Reminders are on", {
        body: `You will be notified 2 days before each deadline. Next up: ${payload.body}`,
        tag: "ep-test",
        icon: "./icon.svg",
      });
    }
  }
  renderRemindBar();
}

function render() {
  renderLegend();
  renderCalendar();
  renderSide();
  renderRemindBar();
}

document.getElementById("prev").addEventListener("click", () => goMonth(-1));
document.getElementById("next").addEventListener("click", () => goMonth(1));
document.getElementById("today").addEventListener("click", () => {
  const t = new Date();
  state.year = t.getFullYear();
  state.month = t.getMonth();
  state.selected = toISO(t);
  render();
});
document.getElementById("enableReminders").addEventListener("click", () => {
  askAndNotify().catch((err) => alert(err.message || String(err)));
});
document.getElementById("downloadIcs").addEventListener("click", downloadDeadlineCalendar);

(function enableSwipe() {
  const cal = document.querySelector(".calendar");
  let x0 = 0;
  let y0 = 0;
  cal.addEventListener("touchstart", (e) => {
    x0 = e.changedTouches[0].clientX;
    y0 = e.changedTouches[0].clientY;
  }, { passive: true });
  cal.addEventListener("touchend", (e) => {
    const x1 = e.changedTouches[0].clientX;
    const y1 = e.changedTouches[0].clientY;
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      goMonth(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
})();

if (navigator.serviceWorker) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "open-date" && event.data.date) {
      const d = parseISO(event.data.date);
      state.year = d.getFullYear();
      state.month = d.getMonth();
      state.selected = event.data.date;
      render();
    }
  });
}

render();
registerApp()
  .then((reg) => {
    if (reg && Notification.permission === "granted") fireDueReminders(reg);
    renderRemindBar();
  })
  .catch(() => {});
