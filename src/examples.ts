export interface Example {
  id: string;
  name: string;
  category: string;
  beforeName: string;
  afterName: string;
  before: string;
  after: string;
}

export const examples: Example[] = [
  {
    id: 'api', name: 'API response', category: 'A little of everything',
    beforeName: 'response.v1.json', afterName: 'response.v2.json',
    before: JSON.stringify({
      user: { id: 'usr_8f2a', name: 'Alex Morgan', role: 'member', verified: false },
      subscription: { plan: 'starter', seats: 3, price: 19 },
      features: ['dashboard', 'analytics'],
      legacy_id: 1042,
      updated_at: '2026-03-01T09:00:00Z',
    }, null, 2),
    after: JSON.stringify({
      user: { id: 'usr_8f2a', name: 'Alex Morgan', role: 'admin', verified: true },
      subscription: { plan: 'pro', seats: 5, price: 49 },
      features: ['dashboard', 'analytics', 'exports'],
      workspace: { name: 'Studio North', region: 'eu-west-1' },
      updated_at: '2026-03-08T14:30:00Z',
    }, null, 2),
  },
  {
    id: 'config', name: 'App configuration', category: 'Catch deployment drift',
    beforeName: 'config.staging.json', afterName: 'config.production.json',
    before: JSON.stringify({
      app: 'northstar', environment: 'staging',
      server: { port: 3000, logLevel: 'debug', cors: ['http://localhost:3000'] },
      cache: { enabled: false, ttl: 60 },
      flags: { newDashboard: true, betaCheckout: true },
    }, null, 2),
    after: JSON.stringify({
      app: 'northstar', environment: 'production',
      server: { port: 8080, logLevel: 'warn', cors: ['https://example.com'] },
      cache: { enabled: true, ttl: 3600 },
      flags: { newDashboard: true },
      monitoring: { enabled: true, sampleRate: 0.1 },
    }, null, 2),
  },
  {
    id: 'package', name: 'Package manifest', category: 'Review your next release',
    beforeName: 'package.before.json', afterName: 'package.after.json',
    before: JSON.stringify({
      name: 'my-lovely-project', version: '1.4.0', private: true,
      scripts: { dev: 'vite', build: 'vite build' },
      dependencies: { vite: '^6.0.0', typescript: '^5.7.0' },
      engines: { node: '>=20' },
    }, null, 2),
    after: JSON.stringify({
      name: 'my-lovely-project', version: '2.0.0', private: false,
      scripts: { dev: 'vite', build: 'tsc && vite build', test: 'vitest' },
      dependencies: { vite: '^7.0.0', typescript: '^5.9.0' },
      engines: { node: '>=22' }, license: 'MIT',
    }, null, 2),
  },
];
