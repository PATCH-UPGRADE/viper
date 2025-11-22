'use client';

import dynamic from 'next/dynamic';
import 'swagger-ui-react/swagger-ui.css';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function OpenApiDocsPage() {
  return (
    <div className="min-h-screen">
      <SwaggerUI url="/api/openapi.json" />
    </div>
  );
}
