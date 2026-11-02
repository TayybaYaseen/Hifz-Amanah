// npm run api:dev — the API in development mode. NODE_ENV must be explicit: unset means production.
process.env.NODE_ENV ??= 'development';
await import('./main.ts');
