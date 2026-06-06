-- CreateTable
CREATE TABLE "annotations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novel_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "annotations_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dependency_edges" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novel_id" TEXT NOT NULL,
    "source_scene_num" INTEGER NOT NULL,
    "target_scene_num" INTEGER NOT NULL,
    "dependency_type" TEXT NOT NULL,
    "weight" REAL NOT NULL DEFAULT 1.0,
    CONSTRAINT "dependency_edges_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_scenes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novel_id" TEXT NOT NULL,
    "scene_num" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "time_of_day" TEXT NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "locked_by" TEXT,
    "current_version_id" TEXT,
    CONSTRAINT "scenes_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scenes_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "scripts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_scenes" ("id", "location", "novel_id", "scene_num", "time_of_day") SELECT "id", "location", "novel_id", "scene_num", "time_of_day" FROM "scenes";
DROP TABLE "scenes";
ALTER TABLE "new_scenes" RENAME TO "scenes";
CREATE TABLE "new_scripts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scene_id" TEXT NOT NULL,
    "yaml_content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" TEXT NOT NULL DEFAULT 'system',
    "parent_version_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "scripts_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "scenes" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "scripts_parent_version_id_fkey" FOREIGN KEY ("parent_version_id") REFERENCES "scripts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_scripts" ("created_at", "id", "scene_id", "version", "yaml_content") SELECT "created_at", "id", "scene_id", "version", "yaml_content" FROM "scripts";
DROP TABLE "scripts";
ALTER TABLE "new_scripts" RENAME TO "scripts";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
