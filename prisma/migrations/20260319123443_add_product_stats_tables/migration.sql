-- CreateTable
CREATE TABLE "ProductStatDaily" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "day" DATETIME NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "addToCart" INTEGER NOT NULL DEFAULT 0,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProcessedOrder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductStatDaily_shop_productId_day_key" ON "ProductStatDaily"("shop", "productId", "day");

-- CreateIndex
CREATE INDEX "ProductStatDaily_shop_productId_idx" ON "ProductStatDaily"("shop", "productId");

-- CreateIndex
CREATE INDEX "ProductStatDaily_shop_day_idx" ON "ProductStatDaily"("shop", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedOrder_shop_orderId_key" ON "ProcessedOrder"("shop", "orderId");

-- CreateIndex
CREATE INDEX "ProcessedOrder_shop_idx" ON "ProcessedOrder"("shop");
