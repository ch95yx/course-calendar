const REMINDER_DAYS_BEFORE = 2;
const NOTIFIED_CACHE = "ep-calendar-notified-v1";
const NOTIFIED_URL = "/__notified-ids";

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function parseISODate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysUntil(iso, now) {
  now = now || new Date();
  return Math.round((startOfLocalDay(parseISODate(iso)) - startOfLocalDay(now)) / 86400000);
}

function fmtDueTime(t) {
  if (!t) return "";
  const [h, min] = t.split(":").map(Number);
  const ampm = h >= 12 ? "p.m." : "a.m.";
  const hr = ((h + 11) % 12) + 1;
  return min ? `${hr}:${String(min).padStart(2, "0")} ${ampm}` : `${hr} ${ampm}`;
}

function assignmentEvents(store) {
  const list = (typeof mergedEvents === "function")
    ? mergedEvents(store)
    : EVENTS;
  return list.filter((e) => e.type === "assignment");
}

function remindersForDay(now, store) {
  now = now || new Date();
  return assignmentEvents(store).filter((e) => daysUntil(e.date, now) === REMINDER_DAYS_BEFORE);
}

function nextDeadlineReminders(now) {
  now = now || new Date();
  const store = (typeof loadStoreSync === "function") ? loadStoreSync() : emptyStore();
  return assignmentEvents(store)
    .map((e) => ({ event: e, days: daysUntil(e.date, now) }))
    .filter((x) => x.days >= 0)
    .sort((a, b) => a.days - b.days || String(a.event.start || "").localeCompare(String(b.event.start || "")));
}

async function loadNotifiedIds() {
  try {
    const cache = await caches.open(NOTIFIED_CACHE);
    const res = await cache.match(NOTIFIED_URL);
    return res ? await res.json() : [];
  } catch (err) {
    return [];
  }
}

async function saveNotifiedIds(ids) {
  const cache = await caches.open(NOTIFIED_CACHE);
  await cache.put(NOTIFIED_URL, new Response(JSON.stringify(ids), {
    headers: { "Content-Type": "application/json" },
  }));
}

function notificationPayload(event) {
  const course = COURSES[event.course] || COURSES.personal;
  const time = fmtDueTime(event.start);
  return {
    title: `Due in ${REMINDER_DAYS_BEFORE} days · ${course.short}`,
    body: `${event.title}${time ? " · " + time : ""}${event.location ? " · " + event.location : ""}`,
    tag: event.id,
    data: { date: event.date, id: event.id },
  };
}

async function fireDueReminders(registration, now) {
  const store = await loadStoreAsync();
  const due = remindersForDay(now, store);
  if (!due.length) return { fired: 0, due: 0 };
  const shown = new Set(await loadNotifiedIds());
  let fired = 0;
  const stamp = (now || new Date()).toISOString().slice(0, 10);
  for (const event of due) {
    const key = `${event.id}@${stamp}`;
    if (shown.has(key)) continue;
    const payload = notificationPayload(event);
    if (registration && registration.showNotification) {
      await registration.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        data: payload.data,
        icon: "./icon.svg",
        badge: "./icon.svg",
        lang: "en",
        requireInteraction: true,
      });
    }
    shown.add(key);
    fired += 1;
  }
  await saveNotifiedIds([...shown]);
  return { fired, due: due.length };
}
