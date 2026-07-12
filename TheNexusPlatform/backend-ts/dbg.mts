import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.LOCAL_DATA_DIR = mkdtempSync(join(tmpdir(), "dbg-"));
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.DATABASE_URL; delete process.env.SUPABASE_DB_URL;
const { createApp } = await import("./src/app.ts");
const app = createApp();
async function req(m: string, p: string, b?: unknown, t?: string) {
  const h: Record<string,string> = { "Content-Type": "application/json" };
  if (t) h.Authorization = `Bearer ${t}`;
  const r = await app.request(p, { method: m, headers: h, body: b===undefined?undefined:JSON.stringify(b) });
  const txt = await r.text(); return { status: r.status, body: txt?JSON.parse(txt):null };
}
const su = await req("POST","/api/platform/auth/signup",{signup_type:"org",org_name:"Dbg Org",email:"d@x.test",password:"password123"});
const me = await req("GET","/api/platform/auth/me",undefined,su.body.access_token);
const orgId = me.body.memberships[0].org_id;
console.log("orgId", orgId, "signup status", su.status);
const audit = await req("GET",`/api/platform/orgs/${orgId}/audit`,undefined,su.body.access_token);
console.log("AUDIT actions:", JSON.stringify(audit.body.map((e:any)=>e.action)));
const ent = await req("GET",`/api/platform/orgs/${orgId}/entitlements`,undefined,su.body.access_token);
console.log("ENTITLEMENTS:", JSON.stringify(ent.body.map((e:any)=>e.module)));
