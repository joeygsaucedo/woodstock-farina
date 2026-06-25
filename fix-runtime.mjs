import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const functionsDir = '.vercel/output/functions';

try {
  const entries = readdirSync(functionsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const configPath = join(functionsDir, entry.name, '.vc-config.json');
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));

        if (config.runtime === 'nodejs18.x') {
          config.runtime = 'nodejs20.x';
          writeFileSync(configPath, JSON.stringify(config, null, 2));
          console.log(`Updated runtime to nodejs20.x in ${entry.name}`);
        }
      } catch (err) {
        // Config file doesn't exist or isn't JSON, skip
      }
    }
  }

  console.log('Runtime configuration updated successfully');
} catch (err) {
  console.error('Error updating runtime config:', err);
  process.exit(1);
}
