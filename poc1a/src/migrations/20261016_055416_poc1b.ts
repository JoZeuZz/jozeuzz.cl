import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "poc_prod"."enum_eventos_solicitud_estado_anterior" AS ENUM('recibida', 'en_gestion', 'cerrada');
  CREATE TYPE "poc_prod"."enum_eventos_solicitud_estado_nuevo" AS ENUM('recibida', 'en_gestion', 'cerrada');
  CREATE TYPE "poc_prod"."enum_eventos_solicitud_motivo_cierre" AS ENUM('atendida', 'descartada', 'duplicada', 'spam');
  CREATE TABLE "poc_prod"."eventos_solicitud" (
    "id" serial PRIMARY KEY NOT NULL,
    "solicitud_id" integer NOT NULL,
    "estado_anterior" "poc_prod"."enum_eventos_solicitud_estado_anterior" NOT NULL,
    "estado_nuevo" "poc_prod"."enum_eventos_solicitud_estado_nuevo" NOT NULL,
    "actor" varchar NOT NULL,
    "fecha" timestamp(3) with time zone NOT NULL,
    "motivo_cierre" "poc_prod"."enum_eventos_solicitud_motivo_cierre",
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
   );

  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD COLUMN "eventos_solicitud_id" integer;
  ALTER TABLE "poc_prod"."eventos_solicitud" ADD CONSTRAINT "eventos_solicitud_solicitud_id_solicitudes_id_fk" FOREIGN KEY ("solicitud_id") REFERENCES "poc_prod"."solicitudes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "eventos_solicitud_solicitud_idx" ON "poc_prod"."eventos_solicitud" USING btree ("solicitud_id");
  CREATE INDEX "eventos_solicitud_updated_at_idx" ON "poc_prod"."eventos_solicitud" USING btree ("updated_at");
  CREATE INDEX "eventos_solicitud_created_at_idx" ON "poc_prod"."eventos_solicitud" USING btree ("created_at");
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_eventos_solicitud_fk" FOREIGN KEY ("eventos_solicitud_id") REFERENCES "poc_prod"."eventos_solicitud"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_eventos_solicitud_id_idx" ON "poc_prod"."payload_locked_documents_rels" USING btree ("eventos_solicitud_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "poc_prod"."eventos_solicitud" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "poc_prod"."eventos_solicitud" CASCADE;
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_eventos_solicitud_fk";

  DROP INDEX "poc_prod"."payload_locked_documents_rels_eventos_solicitud_id_idx";
  ALTER TABLE "poc_prod"."payload_locked_documents_rels" DROP COLUMN "eventos_solicitud_id";
  DROP TYPE "poc_prod"."enum_eventos_solicitud_estado_anterior";
  DROP TYPE "poc_prod"."enum_eventos_solicitud_estado_nuevo";
  DROP TYPE "poc_prod"."enum_eventos_solicitud_motivo_cierre";`)
}
