// Миграции схемы SQLite. Каждая миграция применяется один раз,
// номер фиксируется в schema_migrations.

export const MIGRATIONS: string[] = [
  // v1 — базовая схема
  `
  CREATE TABLE IF NOT EXISTS users (
    user_id      TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role         TEXT NOT NULL CHECK (role IN ('owner','researcher')),
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS methods (
    method_id    TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    measure_type TEXT NOT NULL CHECK (measure_type IN ('quantitative','qualitative')),
    config       TEXT NOT NULL,
    is_active    INTEGER NOT NULL DEFAULT 1
  );

  -- ФИО не существует как поле. Язык респондентов всегда русский и не хранится
  CREATE TABLE IF NOT EXISTS subjects (
    subject_code TEXT PRIMARY KEY,
    age          INTEGER NOT NULL,
    education    TEXT NOT NULL CHECK (education IN
                 ('primary','secondary','vocational','higher','unknown')),
    sex          TEXT CHECK (sex IN ('m','f')),
    diagnosis    TEXT,
    created_by   TEXT NOT NULL REFERENCES users(user_id),
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS norms (
    norm_id            TEXT NOT NULL,
    version            INTEGER NOT NULL,
    source_ref         TEXT NOT NULL,
    source_type        TEXT NOT NULL,
    entered_by         TEXT,
    entered_at         TEXT,
    validated_by       TEXT,
    validated_at       TEXT,
    validation_status  TEXT NOT NULL DEFAULT 'draft',
    method_id          TEXT NOT NULL,
    method_variant     TEXT,
    metric             TEXT NOT NULL,
    procedure_match    TEXT NOT NULL DEFAULT 'full',
    procedure_notes    TEXT,
    age_min            INTEGER NOT NULL,
    age_max            INTEGER NOT NULL,
    education_level    TEXT NOT NULL DEFAULT 'not_stratified',
    sex                TEXT,
    language           TEXT NOT NULL DEFAULT 'ru',
    culture_region     TEXT,
    clinical_status    TEXT NOT NULL DEFAULT 'healthy',
    cell_n             INTEGER NOT NULL,
    total_study_n      INTEGER,
    stat_form          TEXT NOT NULL,
    mean               REAL,
    sd                 REAL,
    percentiles        TEXT,
    distribution_note  TEXT,
    is_skewed          INTEGER NOT NULL DEFAULT 0,
    higher_is_worse    INTEGER NOT NULL,
    data_collection_year INTEGER,
    publication_year     INTEGER,
    stratified_by        TEXT NOT NULL DEFAULT '[]',
    peer_reviewed        INTEGER,
    quality_score        INTEGER,
    quality_tier         TEXT,
    flags                TEXT NOT NULL DEFAULT '[]',
    supersedes           TEXT,
    active               INTEGER NOT NULL DEFAULT 1,
    applied_count        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (norm_id, version)
  );

  CREATE TABLE IF NOT EXISTS test_results (
    result_id      TEXT PRIMARY KEY,
    subject_code   TEXT NOT NULL REFERENCES subjects(subject_code),
    method_id      TEXT NOT NULL REFERENCES methods(method_id),
    raw_measures   TEXT NOT NULL,
    derived        TEXT NOT NULL,
    interpretation TEXT,
    share_consent  INTEGER NOT NULL DEFAULT 0,
    created_by     TEXT NOT NULL REFERENCES users(user_id),
    created_at     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS norm_applications (
    application_id       TEXT PRIMARY KEY,
    result_id            TEXT NOT NULL REFERENCES test_results(result_id),
    norm_id              TEXT NOT NULL,
    norm_version         INTEGER NOT NULL,
    metric               TEXT NOT NULL,
    patient_demographics TEXT NOT NULL,
    raw_value            REAL NOT NULL,
    computed_deviation   TEXT NOT NULL,
    system_suggestion    TEXT,
    was_default          INTEGER NOT NULL,
    clinician_confirmed  INTEGER NOT NULL,
    is_override          INTEGER NOT NULL DEFAULT 0,
    override_reason      TEXT,
    applied_by           TEXT NOT NULL,
    applied_at           TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  // v2 — препараты и комментарий специалиста в карточке испытуемого
  // (итерация 1 по обратной связи клинициста)
  `
  ALTER TABLE subjects ADD COLUMN medications TEXT;
  ALTER TABLE subjects ADD COLUMN comment TEXT;
  `,
];
