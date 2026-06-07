-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_annotations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "novel_id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "author_name" TEXT NOT NULL DEFAULT '匿名',
    "block_index" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "annotations_novel_id_fkey" FOREIGN KEY ("novel_id") REFERENCES "novels" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_annotations" ("content", "created_at", "id", "novel_id", "resolved", "target_id", "target_type", "type") SELECT "content", "created_at", "id", "novel_id", "resolved", "target_id", "target_type", "type" FROM "annotations";
DROP TABLE "annotations";
ALTER TABLE "new_annotations" RENAME TO "annotations";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
