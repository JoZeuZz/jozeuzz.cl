import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Edición manual: el generador no crea el schema propio de producción (POC_DB_SCHEMA=poc_prod).
  await db.execute(sql`
   CREATE SCHEMA IF NOT EXISTS "poc_prod";
  CREATE TYPE "poc_prod"."enum_proyectos_status" AS ENUM('draft', 'published');
  CREATE TYPE "poc_prod"."enum__proyectos_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "poc_prod"."enum_solicitudes_estado" AS ENUM('recibida', 'en_gestion', 'cerrada');
  CREATE TYPE "poc_prod"."enum_solicitudes_motivo_cierre" AS ENUM('atendida', 'descartada', 'duplicada', 'spam');
  CREATE TABLE "poc_prod"."users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "poc_prod"."users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "poc_prod"."proyectos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar,
  	"titulo" varchar,
  	"resumen" varchar,
  	"notas_internas" varchar,
  	"retirado_en" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "poc_prod"."enum_proyectos_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "poc_prod"."proyectos_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"medios_publicos_id" integer,
  	"medios_privados_id" integer
  );
  
  CREATE TABLE "poc_prod"."_proyectos_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_slug" varchar,
  	"version_titulo" varchar,
  	"version_resumen" varchar,
  	"version_notas_internas" varchar,
  	"version_retirado_en" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "poc_prod"."enum__proyectos_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "poc_prod"."_proyectos_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"medios_publicos_id" integer,
  	"medios_privados_id" integer
  );
  
  CREATE TABLE "poc_prod"."servicios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"slug" varchar NOT NULL,
  	"titulo" varchar NOT NULL,
  	"descripcion" varchar,
  	"activo" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "poc_prod"."solicitudes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nombre" varchar NOT NULL,
  	"contacto" varchar NOT NULL,
  	"tipo_equipo" varchar NOT NULL,
  	"descripcion" varchar NOT NULL,
  	"servicio_id" integer,
  	"estado" "poc_prod"."enum_solicitudes_estado" DEFAULT 'recibida' NOT NULL,
  	"motivo_cierre" "poc_prod"."enum_solicitudes_motivo_cierre",
  	"observaciones_internas" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "poc_prod"."medios_publicos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "poc_prod"."medios_privados" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "poc_prod"."payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "poc_prod"."payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "poc_prod"."payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"proyectos_id" integer,
  	"servicios_id" integer,
  	"solicitudes_id" integer,
  	"medios_publicos_id" integer,
  	"medios_privados_id" integer
  );
  
  CREATE TABLE "poc_prod"."payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "poc_prod"."payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "poc_prod"."payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "poc_prod"."users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "poc_prod"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."proyectos_rels" ADD CONSTRAINT "proyectos_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "poc_prod"."proyectos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."proyectos_rels" ADD CONSTRAINT "proyectos_rels_medios_publicos_fk" FOREIGN KEY ("medios_publicos_id") REFERENCES "poc_prod"."medios_publicos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."proyectos_rels" ADD CONSTRAINT "proyectos_rels_medios_privados_fk" FOREIGN KEY ("medios_privados_id") REFERENCES "poc_prod"."medios_privados"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."_proyectos_v" ADD CONSTRAINT "_proyectos_v_parent_id_proyectos_id_fk" FOREIGN KEY ("parent_id") REFERENCES "poc_prod"."proyectos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poc_prod"."_proyectos_v_rels" ADD CONSTRAINT "_proyectos_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "poc_prod"."_proyectos_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."_proyectos_v_rels" ADD CONSTRAINT "_proyectos_v_rels_medios_publicos_fk" FOREIGN KEY ("medios_publicos_id") REFERENCES "poc_prod"."medios_publicos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."_proyectos_v_rels" ADD CONSTRAINT "_proyectos_v_rels_medios_privados_fk" FOREIGN KEY ("medios_privados_id") REFERENCES "poc_prod"."medios_privados"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."solicitudes" ADD CONSTRAINT "solicitudes_servicio_id_servicios_id_fk" FOREIGN KEY ("servicio_id") REFERENCES "poc_prod"."servicios"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "poc_prod"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "poc_prod"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_proyectos_fk" FOREIGN KEY ("proyectos_id") REFERENCES "poc_prod"."proyectos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_servicios_fk" FOREIGN KEY ("servicios_id") REFERENCES "poc_prod"."servicios"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_solicitudes_fk" FOREIGN KEY ("solicitudes_id") REFERENCES "poc_prod"."solicitudes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_medios_publicos_fk" FOREIGN KEY ("medios_publicos_id") REFERENCES "poc_prod"."medios_publicos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_medios_privados_fk" FOREIGN KEY ("medios_privados_id") REFERENCES "poc_prod"."medios_privados"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "poc_prod"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "poc_prod"."payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "poc_prod"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "poc_prod"."users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "poc_prod"."users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "poc_prod"."users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "poc_prod"."users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "poc_prod"."users" USING btree ("email");
  CREATE UNIQUE INDEX "proyectos_slug_idx" ON "poc_prod"."proyectos" USING btree ("slug");
  CREATE INDEX "proyectos_updated_at_idx" ON "poc_prod"."proyectos" USING btree ("updated_at");
  CREATE INDEX "proyectos_created_at_idx" ON "poc_prod"."proyectos" USING btree ("created_at");
  CREATE INDEX "proyectos__status_idx" ON "poc_prod"."proyectos" USING btree ("_status");
  CREATE INDEX "proyectos_rels_order_idx" ON "poc_prod"."proyectos_rels" USING btree ("order");
  CREATE INDEX "proyectos_rels_parent_idx" ON "poc_prod"."proyectos_rels" USING btree ("parent_id");
  CREATE INDEX "proyectos_rels_path_idx" ON "poc_prod"."proyectos_rels" USING btree ("path");
  CREATE INDEX "proyectos_rels_medios_publicos_id_idx" ON "poc_prod"."proyectos_rels" USING btree ("medios_publicos_id");
  CREATE INDEX "proyectos_rels_medios_privados_id_idx" ON "poc_prod"."proyectos_rels" USING btree ("medios_privados_id");
  CREATE INDEX "_proyectos_v_parent_idx" ON "poc_prod"."_proyectos_v" USING btree ("parent_id");
  CREATE INDEX "_proyectos_v_version_version_slug_idx" ON "poc_prod"."_proyectos_v" USING btree ("version_slug");
  CREATE INDEX "_proyectos_v_version_version_updated_at_idx" ON "poc_prod"."_proyectos_v" USING btree ("version_updated_at");
  CREATE INDEX "_proyectos_v_version_version_created_at_idx" ON "poc_prod"."_proyectos_v" USING btree ("version_created_at");
  CREATE INDEX "_proyectos_v_version_version__status_idx" ON "poc_prod"."_proyectos_v" USING btree ("version__status");
  CREATE INDEX "_proyectos_v_created_at_idx" ON "poc_prod"."_proyectos_v" USING btree ("created_at");
  CREATE INDEX "_proyectos_v_updated_at_idx" ON "poc_prod"."_proyectos_v" USING btree ("updated_at");
  CREATE INDEX "_proyectos_v_latest_idx" ON "poc_prod"."_proyectos_v" USING btree ("latest");
  CREATE INDEX "_proyectos_v_rels_order_idx" ON "poc_prod"."_proyectos_v_rels" USING btree ("order");
  CREATE INDEX "_proyectos_v_rels_parent_idx" ON "poc_prod"."_proyectos_v_rels" USING btree ("parent_id");
  CREATE INDEX "_proyectos_v_rels_path_idx" ON "poc_prod"."_proyectos_v_rels" USING btree ("path");
  CREATE INDEX "_proyectos_v_rels_medios_publicos_id_idx" ON "poc_prod"."_proyectos_v_rels" USING btree ("medios_publicos_id");
  CREATE INDEX "_proyectos_v_rels_medios_privados_id_idx" ON "poc_prod"."_proyectos_v_rels" USING btree ("medios_privados_id");
  CREATE UNIQUE INDEX "servicios_slug_idx" ON "poc_prod"."servicios" USING btree ("slug");
  CREATE INDEX "servicios_activo_idx" ON "poc_prod"."servicios" USING btree ("activo");
  CREATE INDEX "servicios_updated_at_idx" ON "poc_prod"."servicios" USING btree ("updated_at");
  CREATE INDEX "servicios_created_at_idx" ON "poc_prod"."servicios" USING btree ("created_at");
  CREATE INDEX "solicitudes_servicio_idx" ON "poc_prod"."solicitudes" USING btree ("servicio_id");
  CREATE INDEX "solicitudes_updated_at_idx" ON "poc_prod"."solicitudes" USING btree ("updated_at");
  CREATE INDEX "solicitudes_created_at_idx" ON "poc_prod"."solicitudes" USING btree ("created_at");
  CREATE INDEX "medios_publicos_updated_at_idx" ON "poc_prod"."medios_publicos" USING btree ("updated_at");
  CREATE INDEX "medios_publicos_created_at_idx" ON "poc_prod"."medios_publicos" USING btree ("created_at");
  CREATE UNIQUE INDEX "medios_publicos_filename_idx" ON "poc_prod"."medios_publicos" USING btree ("filename");
  CREATE INDEX "medios_privados_updated_at_idx" ON "poc_prod"."medios_privados" USING btree ("updated_at");
  CREATE INDEX "medios_privados_created_at_idx" ON "poc_prod"."medios_privados" USING btree ("created_at");
  CREATE UNIQUE INDEX "medios_privados_filename_idx" ON "poc_prod"."medios_privados" USING btree ("filename");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "poc_prod"."payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "poc_prod"."payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "poc_prod"."payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "poc_prod"."payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_proyectos_id_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("proyectos_id");
  CREATE INDEX "payload_locked_documents_rels_servicios_id_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("servicios_id");
  CREATE INDEX "payload_locked_documents_rels_solicitudes_id_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("solicitudes_id");
  CREATE INDEX "payload_locked_documents_rels_medios_publicos_id_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("medios_publicos_id");
  CREATE INDEX "payload_locked_documents_rels_medios_privados_id_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("medios_privados_id");
  CREATE INDEX "payload_preferences_key_idx" ON "poc_prod"."payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "poc_prod"."payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "poc_prod"."payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "poc_prod"."payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "poc_prod"."payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "poc_prod"."payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "poc_prod"."payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "poc_prod"."payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "poc_prod"."payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "poc_prod"."users_sessions" CASCADE;
  DROP TABLE "poc_prod"."users" CASCADE;
  DROP TABLE "poc_prod"."proyectos" CASCADE;
  DROP TABLE "poc_prod"."proyectos_rels" CASCADE;
  DROP TABLE "poc_prod"."_proyectos_v" CASCADE;
  DROP TABLE "poc_prod"."_proyectos_v_rels" CASCADE;
  DROP TABLE "poc_prod"."servicios" CASCADE;
  DROP TABLE "poc_prod"."solicitudes" CASCADE;
  DROP TABLE "poc_prod"."medios_publicos" CASCADE;
  DROP TABLE "poc_prod"."medios_privados" CASCADE;
  DROP TABLE "poc_prod"."payload_kv" CASCADE;
  DROP TABLE "poc_prod"."payload_locked_documents" CASCADE;
  DROP TABLE "poc_prod"."payload_locked_documents_rels" CASCADE;
  DROP TABLE "poc_prod"."payload_preferences" CASCADE;
  DROP TABLE "poc_prod"."payload_preferences_rels" CASCADE;
  DROP TABLE "poc_prod"."payload_migrations" CASCADE;
  DROP TYPE "poc_prod"."enum_proyectos_status";
  DROP TYPE "poc_prod"."enum__proyectos_v_version_status";
  DROP TYPE "poc_prod"."enum_solicitudes_estado";
  DROP TYPE "poc_prod"."enum_solicitudes_motivo_cierre";`)
}
