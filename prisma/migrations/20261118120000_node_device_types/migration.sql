-- CreateTable
CREATE TABLE "_DeviceTypeToNode" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DeviceTypeToNode_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_DeviceTypeToNode_B_index" ON "_DeviceTypeToNode"("B");

-- AddForeignKey
ALTER TABLE "_DeviceTypeToNode" ADD CONSTRAINT "_DeviceTypeToNode_A_fkey" FOREIGN KEY ("A") REFERENCES "device_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_DeviceTypeToNode" ADD CONSTRAINT "_DeviceTypeToNode_B_fkey" FOREIGN KEY ("B") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A node that linked a device group matching now links the device type of the
-- matching's product. A matching with no product, or a product with no device
-- type, has no device type to link, so that link is not carried over.
INSERT INTO "_DeviceTypeToNode" ("A", "B")
SELECT DISTINCT p."deviceTypeId", link."B"
FROM "_DeviceGroupMatchingToNode" link
JOIN "device_group_matching" m ON m."id" = link."A"
JOIN "product" p ON p."id" = m."productId"
WHERE p."deviceTypeId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropTable
DROP TABLE "_DeviceGroupMatchingToNode";
