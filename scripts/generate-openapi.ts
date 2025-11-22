#!/usr/bin/env tsx
/**
 * Generate OpenAPI specification from tRPC router
 *
 * This script generates the OpenAPI spec by importing the app router directly,
 * bypassing the need for a running server.
 */

import { writeFile } from 'node:fs/promises';
import { generateOpenApiDocument } from 'trpc-to-openapi';
import { appRouter } from '../src/trpc/routers/_app';

async function generateOpenApiSpec() {
  console.log('🔧 Generating OpenAPI specification...');

  const openApiDocument = generateOpenApiDocument(appRouter, {
    title: 'PATCH Vulnerability Management API',
    description: 'API for managing assets, vulnerabilities, and remediations in hospital environments',
    version: '1.0.0',
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000/api/trpc',
    docsUrl: 'https://github.com/PATCH-UPGRADE',
    tags: ['Assets', 'Vulnerabilities', 'Remediations', 'Emulators'],
  });

  const outputPath = 'docs/openapi.json';
  await writeFile(outputPath, JSON.stringify(openApiDocument, null, 2), 'utf-8');

  console.log(`✅ OpenAPI spec generated successfully at ${outputPath}`);
}

generateOpenApiSpec().catch((error) => {
  console.error('❌ Error generating OpenAPI spec:', error);
  process.exit(1);
});
