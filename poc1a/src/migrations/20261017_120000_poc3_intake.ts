import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE "poc_prod"."intake_envio" (
      "clave" text PRIMARY KEY CHECK ("clave" ~ '^[0-9a-f]{64}$'),
      "creada_en" timestamp(3) with time zone NOT NULL DEFAULT now()
    );
    CREATE INDEX "intake_envio_creada_en_idx" ON "poc_prod"."intake_envio" ("creada_en");
    CREATE TABLE "poc_prod"."intake_limite" (
      "clave_hmac" text NOT NULL CHECK ("clave_hmac" ~ '^[0-9a-f]{64}$'),
      "tipo" text NOT NULL CHECK ("tipo" IN ('intento', 'creacion')),
      "ventana" timestamp(3) with time zone NOT NULL,
      "n" integer NOT NULL CHECK ("n" >= 1),
      PRIMARY KEY ("clave_hmac", "tipo", "ventana")
    );
    CREATE INDEX "intake_limite_ventana_idx" ON "poc_prod"."intake_limite" ("ventana");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE "poc_prod"."intake_limite";
    DROP TABLE "poc_prod"."intake_envio";
  `)
}
