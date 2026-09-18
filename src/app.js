const storageKey = "okurusu-memo-medicines";
const recordKey = "okurusu-memo-records";
const defaultMedicines = [
  { id: "morning-example", name: "朝のおくすり", time: "08:00", note: "食後" },
  { id: "night-example", name: "夜のおくすり", time: "21:00", note: "就寝前" }
];

const list = document.querySelector("#medicineList");
const template = document.querySelector("#medicineTemplate");
const form = document.querySelector("#medicineForm");
const notifyButton = document.querySelector("#notifyButton");
function readStorage(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
  catch { return fallback; }
}
let medicines = readStorage(storageKey, defaultMedicines);
let records = readStorage(recordKey, {});
medicines = medicines.map((medicine) => ({ status: "active", ...medicine }));
let cloudUser = null;
let editingId = null;
let showAllMedicines = false;
const frequencyInput = document.querySelector("#medicineFrequency");
const timeInput = document.querySelector("#medicineTime");
const weekdayInput = document.querySelector("#medicineWeekday");
const weekdayField = document.querySelector("#weekdayField");
const timeField = document.querySelector("#timeField");
const startDateInput = document.querySelector("#medicineStartDate");
const endDateInput = document.querySelector("#medicineEndDate");

function dayKey() { return new Date().toLocaleDateString("sv-SE"); }
function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(medicines));
    localStorage.setItem(recordKey, JSON.stringify(records));
    if (JSON.parse(localStorage.getItem(storageKey) || "null")?.length !== medicines.length) throw new Error("storage verification failed");
  } catch (error) {
    setCloudMessage("このブラウザでは保存できません。通常モードのブラウザで開いてください。");
    throw error;
  }
  if (cloudUser && window.CloudStore.enabled) window.CloudStore.save({ medicines, records }).catch(() => setCloudMessage("同期に失敗しました。通信状態を確認してください。"));
}
function setCloudMessage(message) { document.querySelector("#cloudMessage").textContent = message; }
async function syncNow() {
  if (!cloudUser) return;
  setCloudMessage("同期中…");
  try { await useCloudSession(); setCloudMessage(`${cloudUser.email} で同期しました。`); }
  catch (error) { setCloudMessage(`同期失敗：${error.message || "原因を確認できません"}`); }
}
async function useCloudSession() {
  if (!window.CloudStore.enabled) {
    document.querySelector("#authForm").hidden = true;
    setCloudMessage("この端末だけに保存しています。クラウド同期は後から設定できます。");
    return;
  }
  const session = await window.CloudStore.session(); cloudUser = session?.user ?? null;
  if (!cloudUser) return;
  const remote = await window.CloudStore.load();
  if (remote) {
    const remoteMedicines = Array.isArray(remote.medicines) ? remote.medicines : [];
    const remoteIds = new Set(remoteMedicines.map((medicine) => medicine.id));
    // 既存のクラウドデータを残しつつ、このブラウザで追加された薬も統合する。
    medicines = [...remoteMedicines, ...medicines.filter((medicine) => !remoteIds.has(medicine.id))];
    records = Object.entries({ ...(remote.records || {}), ...records }).reduce((merged, [date, dayRecords]) => {
      merged[date] = { ...(remote.records?.[date] || {}), ...(records[date] || {}), ...dayRecords };
      return merged;
    }, {});
    await window.CloudStore.save({ medicines, records });
    localStorage.setItem(storageKey, JSON.stringify(medicines)); localStorage.setItem(recordKey, JSON.stringify(records)); render();
  } else {
    // 初回ログイン時は、このブラウザに残っている記録をクラウドへ移行する。
    await window.CloudStore.save({ medicines, records });
  }
  document.querySelector("#authForm").hidden = true; document.querySelector("#signOutButton").hidden = false; document.querySelector("#syncButton").hidden = false; document.querySelector("#cloudStatus").textContent = "クラウド同期中"; setCloudMessage(`${cloudUser.email} で同期しています。`);
}
function isTaken(id) { return Boolean(records[dayKey()]?.[id]); }
function isActive(medicine) { return medicine.status !== "ended"; }
function isScheduledToday(medicine) { return isActive(medicine) && (medicine.frequency !== "weekly" || Number(medicine.weekday) === new Date().getDay()); }
function temporaryRecords() { return records[dayKey()]?._temporary || []; }
function renderHistory(date = dayKey()) {
  const dayRecords = records[date] || {};
  const taken = medicines.filter((medicine) => dayRecords[medicine.id]);
  const names = [...taken.map((medicine) => medicine.name), ...(dayRecords._temporary || []).map((item) => item.name)];
  document.querySelector("#historyText").textContent = names.length ? `${names.length}件：${names.join("、")}` : "この日の服用記録はありません";
}
function updateSummary() {
  const todaysMedicines = medicines.filter(isScheduledToday);
  const temporary = temporaryRecords();
  const taken = todaysMedicines.filter((medicine) => isTaken(medicine.id)).length + temporary.length;
  const total = todaysMedicines.length + temporary.length;
  document.querySelector("#summaryText").textContent = total ? `${taken} / ${total} 回 済み` : "今日の予定はありません";
  document.querySelector("#progressValue").textContent = total ? `${Math.round(taken / total * 100)}%` : "–";
}
function render() {
  list.innerHTML = "";
  const visibleMedicines = showAllMedicines ? medicines : medicines.filter(isScheduledToday);
  if (!visibleMedicines.length) list.innerHTML = '<p class="empty-state">今日の予定はありません。下から薬を追加できます。</p>';
  visibleMedicines.sort((a, b) => (a.time || "").localeCompare(b.time || "")).forEach((medicine) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const taken = isTaken(medicine.id);
    card.classList.toggle("taken", taken);
    card.classList.toggle("management-mode", showAllMedicines);
    card.classList.toggle("ended", medicine.status === "ended");
    card.querySelector(".time").textContent = medicine.frequency === "as-needed" ? "頓服" : medicine.frequency === "weekly" ? `毎週${["日", "月", "火", "水", "木", "金", "土"][medicine.weekday]} ${medicine.time}` : medicine.time;
    card.querySelector("h3").textContent = medicine.name;
    card.querySelector("p").textContent = medicine.note || "メモなし";
    const checkButton = card.querySelector(".check-button");
    checkButton.textContent = taken ? "服用済み ✓" : "服用した";
    checkButton.addEventListener("click", () => toggleTaken(medicine.id));
    card.querySelector(".edit-button").addEventListener("click", () => startEditing(medicine));
    const lifecycleButton = card.querySelector(".lifecycle-button");
    lifecycleButton.textContent = medicine.status === "ended" ? "服用を再開" : "服用終了";
    lifecycleButton.addEventListener("click", () => toggleLifecycle(medicine.id));
    card.querySelector(".delete-button").addEventListener("click", () => removeMedicine(medicine.id));
    list.append(card);
  });
  if (!showAllMedicines) temporaryRecords().forEach((item) => {
    const card = template.content.firstElementChild.cloneNode(true);
    card.classList.add("taken", "temporary-card");
    card.querySelector(".time").textContent = item.time;
    card.querySelector("h3").textContent = item.name;
    card.querySelector("p").textContent = item.note || "臨時服用";
    card.querySelector(".check-button").textContent = "記録済み ✓";
    card.querySelector(".edit-button").hidden = true;
    card.querySelector(".lifecycle-button").hidden = true;
    card.querySelector(".delete-button").addEventListener("click", () => { if (!confirm("この臨時服用の記録を削除しますか？")) return; records[dayKey()]._temporary = temporaryRecords().filter((entry) => entry.id !== item.id); save(); render(); renderHistory(); });
    list.append(card);
  });
  updateSummary();
}
function startEditing(medicine) {
  editingId = medicine.id;
  document.querySelector("#medicineName").value = medicine.name;
  frequencyInput.value = medicine.frequency || "daily";
  weekdayInput.value = medicine.weekday ?? "1";
  frequencyInput.dispatchEvent(new Event("change"));
  document.querySelector("#medicineTime").value = medicine.time;
  startDateInput.value = medicine.startDate || "";
  endDateInput.value = medicine.endDate || "";
  document.querySelector("#medicineNote").value = medicine.note || "";
  document.querySelector(".add-section .primary-button").textContent = "変更を保存";
  document.querySelector("#medicineName").focus();
  document.querySelector(".add-section").scrollIntoView({ behavior: "smooth", block: "center" });
}
function toggleLifecycle(id) {
  const medicine = medicines.find((item) => item.id === id); if (!medicine) return;
  if (medicine.status === "ended") { medicine.status = "active"; medicine.endDate = ""; }
  else { medicine.status = "ended"; medicine.endDate ||= dayKey(); }
  save(); render();
}
function toggleTaken(id) {
  const today = dayKey(); records[today] ??= {};
  if (records[today][id]) delete records[today][id]; else records[today][id] = new Date().toISOString();
  save(); render();
}
function removeMedicine(id) {
  if (!confirm("この薬の予定を削除しますか？")) return;
  medicines = medicines.filter((medicine) => medicine.id !== id); save(); render();
}
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = document.querySelector("#medicineName").value.trim();
  const frequency = frequencyInput.value;
  const time = frequency === "as-needed" ? "" : timeInput.value;
  const weekday = weekdayInput.value;
  const note = document.querySelector("#medicineNote").value.trim();
  if (editingId) {
    const medicine = medicines.find((item) => item.id === editingId);
    if (medicine) Object.assign(medicine, { name, time, note, frequency, weekday, startDate: startDateInput.value, endDate: endDateInput.value });
    editingId = null;
    document.querySelector(".add-section .primary-button").textContent = "予定に追加する";
  } else {
    medicines.push({ id: crypto.randomUUID(), name, time, note, frequency, weekday, status: "active", startDate: startDateInput.value, endDate: endDateInput.value });
  }
  try { save(); } catch { return; }
  form.reset(); frequencyInput.dispatchEvent(new Event("change")); render();
});
frequencyInput.addEventListener("change", () => {
  const asNeeded = frequencyInput.value === "as-needed";
  const weekly = frequencyInput.value === "weekly";
  timeField.hidden = asNeeded;
  timeInput.required = !asNeeded;
  weekdayField.hidden = !weekly;
});
document.querySelector("#temporaryButton").addEventListener("click", () => { const form = document.querySelector("#temporaryForm"); form.hidden = !form.hidden; if (!form.hidden) { document.querySelector("#temporaryTime").value = `${String(new Date().getHours()).padStart(2, "0")}:${String(new Date().getMinutes()).padStart(2, "0")}`; document.querySelector("#temporaryName").focus(); } });
document.querySelector("#cancelTemporary").addEventListener("click", () => { document.querySelector("#temporaryForm").hidden = true; });
document.querySelector("#temporaryForm").addEventListener("submit", (event) => { event.preventDefault(); const today = dayKey(); records[today] ??= {}; records[today]._temporary ??= []; records[today]._temporary.push({ id: crypto.randomUUID(), name: document.querySelector("#temporaryName").value.trim(), time: document.querySelector("#temporaryTime").value, note: document.querySelector("#temporaryNote").value.trim() }); save(); event.target.reset(); event.target.hidden = true; render(); renderHistory(); });
function updateNotifyButton() {
  if (!("Notification" in window)) {
    notifyButton.hidden = true;
    return;
  }
  notifyButton.textContent = Notification.permission === "granted" ? "通知はオンです" : "通知をオンにする";
}
notifyButton.addEventListener("click", async () => { if ("Notification" in window) { await Notification.requestPermission(); updateNotifyButton(); } });
function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date(); const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  medicines.filter((medicine) => medicine.time === current && !isTaken(medicine.id)).forEach((medicine) => new Notification("おくすりメモ", { body: `${medicine.name} の時間です。服用後に記録してください。` }));
}
document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(new Date());
const historyDate = document.querySelector("#historyDate"); historyDate.value = dayKey(); historyDate.addEventListener("change", () => renderHistory(historyDate.value));
document.querySelector("#showAllButton").addEventListener("click", () => { showAllMedicines = !showAllMedicines; document.querySelector("#showAllButton").textContent = showAllMedicines ? "今日の予定に戻す" : "すべての薬を管理"; document.querySelector("#scheduleTitle").textContent = showAllMedicines ? "登録中の薬" : "今日の予定"; document.querySelector("#addSection").hidden = !showAllMedicines; document.querySelector("#temporaryButton").hidden = showAllMedicines; document.querySelector("#temporaryForm").hidden = true; render(); });
updateNotifyButton(); render(); renderHistory(); checkReminders(); setInterval(checkReminders, 60000);
document.querySelector("#authForm").addEventListener("submit", async (event) => { event.preventDefault(); if (!window.CloudStore.enabled) return setCloudMessage("登録失敗：Supabase接続情報が未設定です。"); const email = document.querySelector("#authEmail").value; const password = document.querySelector("#authPassword").value; setCloudMessage("ログイン処理中…"); const result = await window.CloudStore.signIn(email, password); if (result.error) return setCloudMessage(`ログイン失敗：${result.error.message}`); await useCloudSession(); });
document.querySelector("#signUpButton").addEventListener("click", async () => { if (!window.CloudStore.enabled) return setCloudMessage("登録失敗：Supabase接続情報が未設定です。"); const email = document.querySelector("#authEmail").value; const password = document.querySelector("#authPassword").value; setCloudMessage("登録処理中…ボタンをもう一度押さずにお待ちください。"); const result = await window.CloudStore.signUp(email, password); setCloudMessage(result.error ? `登録失敗：${result.error.message}` : "登録完了：確認メールを送信しました。メールのリンクを開いてからログインしてください。"); });
document.querySelector("#signOutButton").addEventListener("click", async () => { await window.CloudStore.signOut(); cloudUser = null; document.querySelector("#authForm").hidden = false; document.querySelector("#signOutButton").hidden = true; document.querySelector("#syncButton").hidden = true; document.querySelector("#cloudStatus").textContent = "ローカル保存中"; setCloudMessage("ログアウトしました。端末内保存に戻りました。"); });
document.querySelector("#syncButton").addEventListener("click", syncNow);
useCloudSession().catch(() => setCloudMessage("クラウド接続を確認できません。端末内保存を利用します。"));
