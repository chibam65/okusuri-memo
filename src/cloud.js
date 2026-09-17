/* Supabase の接続情報を設定するとクラウド同期が有効になります。 */
const CLOUD_CONFIG = {
  url: "", // 例: https://xxxx.supabase.co
  anonKey: ""
};

window.CloudStore = (() => {
  const enabled = Boolean(CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey && window.supabase);
  const client = enabled ? window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey) : null;
  async function session() { return client ? (await client.auth.getSession()).data.session : null; }
  async function signIn(email, password) { return client.auth.signInWithPassword({ email, password }); }
  async function signUp(email, password) { return client.auth.signUp({ email, password }); }
  async function signOut() { return client.auth.signOut(); }
  async function load() {
    const current = await session(); if (!current) return null;
    const result = await client.from("medicine_data").select("payload").eq("user_id", current.user.id).maybeSingle();
    if (result.error) throw result.error;
    return result.data?.payload ?? null;
  }
  async function save(payload) {
    const current = await session(); if (!current) return;
    const result = await client.from("medicine_data").upsert({ user_id: current.user.id, payload, updated_at: new Date().toISOString() });
    if (result.error) throw result.error;
  }
  return { enabled, session, signIn, signUp, signOut, load, save };
})();
