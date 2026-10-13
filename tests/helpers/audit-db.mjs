import { readFile, readdir } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
export const uid=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`
export async function auditDatabase(){
 const db=new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,raw_app_meta_data jsonb DEFAULT '{}');
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
 CREATE PUBLICATION supabase_realtime;
 CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO authenticated;GRANT SELECT,INSERT,DELETE,UPDATE ON storage.objects TO authenticated;`)
 // PGlite cannot load pgcrypto. PIN hashing is outside this test; keep its SQL bodies, stub only its platform extension.
 await db.exec(`CREATE SCHEMA extensions;
 CREATE FUNCTION extensions.crypt(text,text) RETURNS text LANGUAGE sql AS $$ SELECT $1 $$;
 CREATE FUNCTION extensions.gen_salt(text,integer DEFAULT 6) RETURNS text LANGUAGE sql AS $$ SELECT 'test-only'::text $$;
 CREATE FUNCTION extensions.digest(text,text) RETURNS bytea LANGUAGE sql AS $$ SELECT convert_to($1,'UTF8') $$;`)
 for(const file of (await readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()){
  let sql=await readFile(`supabase/migrations/${file}`,'utf8')
  sql=sql.replace('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;','')
  try{await db.exec(sql)}catch(e){throw Error(`Migration ${file}: ${e.message}`)}
 }
 await db.exec(await readFile('supabase/storage/audit-photo-policies.sql','utf8'))
 await db.exec(`INSERT INTO public."Locations"(id,name,active) VALUES(1,'Synthetic A',true),(2,'Synthetic B',true);
 INSERT INTO auth.users(id,email) VALUES('${uid(1)}','one@example.invalid'),('${uid(2)}','two@example.invalid'),('${uid(3)}','inactive@example.invalid');
 INSERT INTO public."Employees"(id,name,role,location_id,active,auth_user_id) VALUES(1,'Synthetic one','employee',1,true,'${uid(1)}'),(2,'Synthetic two','manager',2,true,'${uid(2)}'),(3,'Inactive','employee',1,false,'${uid(3)}');`)
 return db
}
