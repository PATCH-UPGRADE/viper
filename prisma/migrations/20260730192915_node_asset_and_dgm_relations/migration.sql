-- CreateTable
CREATE TABLE "_DeviceGroupMatchingToNode" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DeviceGroupMatchingToNode_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AssetToNode" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AssetToNode_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_DeviceGroupMatchingToNode_B_index" ON "_DeviceGroupMatchingToNode"("B");

-- CreateIndex
CREATE INDEX "_AssetToNode_B_index" ON "_AssetToNode"("B");

-- AddForeignKey
ALTER TABLE "_DeviceGroupMatchingToNode" ADD CONSTRAINT "_DeviceGroupMatchingToNode_A_fkey" FOREIGN KEY ("A") REFERENCES "device_group_matching"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceGroupMatchingToNode" ADD CONSTRAINT "_DeviceGroupMatchingToNode_B_fkey" FOREIGN KEY ("B") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssetToNode" ADD CONSTRAINT "_AssetToNode_A_fkey" FOREIGN KEY ("A") REFERENCES "asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssetToNode" ADD CONSTRAINT "_AssetToNode_B_fkey" FOREIGN KEY ("B") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;
