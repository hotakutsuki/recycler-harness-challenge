-- CreateTable
CREATE TABLE "Sheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "photoPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "rawExtraction" TEXT,
    "flags" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" DATETIME,
    "photoDeletedAt" DATETIME
);

-- CreateTable
CREATE TABLE "WeighingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "date" TEXT,
    "supplier" TEXT,
    "plate" TEXT,
    "weigher" TEXT,
    "truckGrossKg" REAL,
    "truckTareKg" REAL,
    "truckNetKg" REAL,
    "truckUnit" TEXT,
    CONSTRAINT "WeighingEvent_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Line" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "materialRaw" TEXT NOT NULL,
    "materialId" TEXT,
    "unit" TEXT,
    "grossKg" REAL,
    "deductionKg" REAL,
    "deductionReason" TEXT,
    "netKg" REAL,
    "price" REAL,
    "amount" REAL,
    CONSTRAINT "Line_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "WeighingEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Line_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Material" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "priceUnit" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "Alias" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    CONSTRAINT "Alias_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Correction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "user" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Correction_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "Sheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "tolerancePct" REAL NOT NULL DEFAULT 10,
    "priceDivergencePct" REAL NOT NULL DEFAULT 10,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "photoRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "language" TEXT NOT NULL DEFAULT 'es'
);

-- CreateIndex
CREATE INDEX "Sheet_status_idx" ON "Sheet"("status");

-- CreateIndex
CREATE INDEX "Sheet_createdAt_idx" ON "Sheet"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeighingEvent_sheetId_key" ON "WeighingEvent"("sheetId");

-- CreateIndex
CREATE INDEX "WeighingEvent_date_idx" ON "WeighingEvent"("date");

-- CreateIndex
CREATE INDEX "WeighingEvent_supplier_idx" ON "WeighingEvent"("supplier");

-- CreateIndex
CREATE INDEX "Line_eventId_idx" ON "Line"("eventId");

-- CreateIndex
CREATE INDEX "Line_materialId_idx" ON "Line"("materialId");

-- CreateIndex
CREATE UNIQUE INDEX "Material_name_key" ON "Material"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Alias_text_key" ON "Alias"("text");

-- CreateIndex
CREATE INDEX "Correction_sheetId_idx" ON "Correction"("sheetId");
